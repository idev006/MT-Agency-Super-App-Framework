// registrations.submit (public) — ONE source for both engines (VC-ADR-046 phase 3 wave 2b). Rules moved unchanged from
// VehicleOperations (body, reconcileSubmitTimeout, registrationSubmit / submitOnce) and the submit sticker decorator of
// StickerCategoryOperations: person type → form → idempotency key → reference lists → campaign, idempotent replay, legacy
// orphan reconciliation, campaign quota with optimistic concurrency (WRITE_CONFLICT → re-read, ≤ 4 attempts → CAMPAIGN_BUSY),
// every business write in ONE all-or-nothing commit. One change: the duplicate-vehicle check reads the vehicles with this
// plate + province (index plate_normalized + province_code + _seq) instead of the WHOLE vehicles table.
// deps: {now() → ISO, id() → 64 hex, sha256(text) → hex}. Effects: reads, patch, remove, writeMany, memoGet, memoPut.
import {stickerCategory, STICKER_SETTING_KEY, DEFAULT_STICKER_CATEGORIES, parseStickerCategories} from '../../domain/policies/StickerCategoryPolicy.js';
import {vehicleBusinessKey, validateFivePhotos} from '../../domain/policies/VehicleLifecycle.js';
import {referencesFlow, assertRegistrationAgainst, campaignRead, checkCampaign} from './RegistrationFlows.js';

const SUBMIT = 'registrations.submit';
const stickerRead = {kind: 'one', name: 'vc_settings', filter: {key: STICKER_SETTING_KEY}};
const stickerList = row => (row && row.value ? parseStickerCategories(row.value) : DEFAULT_STICKER_CATEGORIES);
const needText = (v, name, max = 200) => { if (typeof v !== 'string' || !v.trim() || v.length > max || /^[=+@]/.test(v.trim())) throw new Error('INVALID_' + name); return v.trim(); };
const phoneE164 = v => { if (typeof v !== 'string' || !/^\+[1-9][0-9]{6,14}$/.test(v)) throw new Error('INVALID_PHONE_E164'); return v; };
const idemRead = idemKey => ({kind: 'one', name: 'vc_idempotency', filter: {key: idemKey}});
const parseOr = (raw, fallback) => { try { return JSON.parse(raw); } catch { return fallback; } };

export function registrationBody(p) {
  const key = vehicleBusinessKey(p.plate, p.province).split('|');
  return {plate_normalized: key[0], province_code: key[1],
    plate_type: needText(p.plateType, 'PLATE_TYPE'), vehicle_type: needText(p.vehicleType, 'VEHICLE_TYPE'),
    make: needText(p.brand, 'BRAND'), model: needText(p.model, 'MODEL'), color: needText(p.color, 'COLOR'),
    organization_id: needText(p.organizationId, 'ORGANIZATION_ID'), relationship: needText(p.relationship, 'RELATIONSHIP'),
    contactName: needText(p.contactName, 'CONTACT_NAME'), contactPhone: phoneE164(p.contactPhone), sticker_category: p.stickerCategory || ''};
}

// A previous attempt may have died (GAS timeout/restart) after PREPARED but before the idempotency commit, leaving an orphan
// application + CLAIMED photos. Reverse those partial writes so a retry can proceed; the quota cannot be proven from state
// alone → flagged for the manual runbook. Since W1 a submit writes its request AND an APPLIED journal in ONE commit, so a
// request whose journal is APPLIED is a COMMITTED submit (e.g. a racing winner) — never an orphan. → {committed, removedIds}
function* reconcileSubmitTimeout(idemKey) {
  const [orphans] = yield {reads: [{kind: 'list', name: 'vc_registration_requests', filter: {idempotency_key: idemKey}, limit: 5}]};
  const outcome = {committed: false, removedIds: []};
  if (!orphans.length) return outcome;
  let blocked = false;
  for (const orphan of orphans) {
    const [journal] = yield {reads: [{kind: 'one', name: 'vc_operation_journal', filter: {entity_id: orphan.request_id, operation: SUBMIT}}]};
    if (journal && journal.status === 'APPLIED') { outcome.committed = true; continue; }
    const photoIds = (parseOr(orphan.application_json, {}).photos || []).map(f => f.photoId);
    const errors = [];
    const fail = e => errors.push(String(e?.message || 'RECOVERY_FAILED').slice(0, 64));
    for (const pid of photoIds) {
      try {
        const [st] = yield {reads: [{kind: 'one', name: 'vc_photo_staging', filter: {photo_id: pid}}]};
        if (st && st.status === 'CLAIMED') yield {patch: {table: 'vc_photo_staging', filter: {photo_id: pid}, fields: {status: 'STAGED', used_at: ''}}};
      } catch (e) { fail(e); }
    }
    let removed = false;
    try { yield {remove: {table: 'vc_registration_requests', filter: {request_id: orphan.request_id}}}; removed = true; } catch (e) { fail(e); }
    if (removed) outcome.removedIds.push(orphan.request_id);
    if (journal) {
      try {
        yield {patch: {table: 'vc_operation_journal', filter: {event_id: journal.event_id}, fields: {status: 'RECOVERY_REQUIRED',
          detail_json: JSON.stringify({...parseOr(journal.detail_json, {}), recovery: {requestRemoved: removed, photosRestored: photoIds, quotaCheck: 'MANUAL', errors}})}}};
      } catch (e) { fail(e); }
    }
    if (errors.length) blocked = true;
  }
  if (blocked) throw new Error('OPERATION_RECOVERY_REQUIRED');
  return outcome;
}

// W1 (VC-ADR-028): independent rows in ONE parallel round, every business write in ONE commit (all-or-nothing with
// preconditions: never a partial submit to compensate). C5: the quota is written only if the campaign's version is unchanged.
function* submitOnce(q, payload, digest, idemKey, deps) {
  const key = payload.plate_normalized + '|' + payload.province_code;
  const fivePhotos = validateFivePhotos(q.photos);
  const photoReads = fivePhotos ? q.photos.map(x => ({kind: 'one', name: 'vc_photo_staging', filter: {photo_id: needText(x.photoId, 'PHOTO_ID')}})) : [];
  let [versioned, old, orphans, org, vehicles, pending, ...staged] = yield {reads: [
    {kind: 'versioned', name: 'vc_campaigns', filter: {token_digest: deps.sha256(q.campaignToken.toLowerCase())}},
    idemRead(idemKey),
    {kind: 'list', name: 'vc_registration_requests', filter: {idempotency_key: idemKey}},
    {kind: 'one', name: 'vc_organizations', filter: {organization_id: payload.organization_id}},
    {kind: 'list', name: 'vc_vehicles', filter: {plate_normalized: payload.plate_normalized, province_code: payload.province_code}},
    {kind: 'list', name: 'vc_registration_requests', filter: {status: 'PENDING_APPROVAL'}},
    ...photoReads]};
  if (old) {
    if (old.request_digest !== digest || old.status !== 'COMPLETED') throw new Error('IDEMPOTENCY_CONFLICT');
    const result = JSON.parse(old.result_json);
    const [j] = yield {reads: [{kind: 'one', name: 'vc_operation_journal', filter: {entity_id: result.requestId, operation: SUBMIT}}]};
    if (j && j.status === 'PREPARED') { try { yield {patch: {table: 'vc_operation_journal', filter: {event_id: j.event_id}, fields: {status: 'APPLIED'}}}; } catch { /* best effort */ } }
    return result;
  }
  // legacy (pre-W1) timed-out partial attempts may have left an orphan request: reconcile it, then re-read the photos
  let removedIds = [];
  if (orphans.length) {
    const outcome = yield* reconcileSubmitTimeout(idemKey); removedIds = outcome.removedIds;
    if (outcome.committed) { // a concurrent submit with the same key already committed: replay it (never re-create)
      const [winner] = yield {reads: [idemRead(idemKey)]};
      if (!winner) throw new Error('OPERATION_RECOVERY_REQUIRED');
      if (winner.request_digest !== digest || winner.status !== 'COMPLETED') throw new Error('IDEMPOTENCY_CONFLICT');
      return JSON.parse(winner.result_json);
    }
    staged = yield {reads: photoReads};
  }
  const campaign = versioned.row;
  if (!campaign || campaign.status !== 'ACTIVE' || campaign.revoked_at) throw new Error('CAMPAIGN_INVALID');
  if (Number(campaign.submitted_count) >= Number(campaign.max_submissions)) throw new Error('CAMPAIGN_INVALID');
  if (!org || org.status !== 'ACTIVE') throw new Error('ORGANIZATION_INACTIVE');
  const duplicate = vehicles.some(v => v.plate_normalized === payload.plate_normalized && v.province_code === payload.province_code && v.status !== 'INACTIVE');
  // a same-key retry racing the winner can read a stale "no idempotency row" yet see the winner's committed effects (its
  // pending request / CLAIMED photos): re-read the idempotency row and replay the winner before rejecting (G7 C1)
  function* replayOrThrow(code) {
    const [winner] = yield {reads: [idemRead(idemKey)]};
    if (winner && winner.request_digest === digest && winner.status === 'COMPLETED') return JSON.parse(winner.result_json);
    throw new Error(code);
  }
  const live = pending.filter(r => !removedIds.includes(r.request_id)); // reconciled orphans no longer count
  if (duplicate || live.some(r => { const x = JSON.parse(r.application_json); return x.plate_normalized + '|' + x.province_code === key; }))
    return yield* replayOrThrow('DUPLICATE_VEHICLE');
  if (!fivePhotos) throw new Error('FIVE_PHOTOS_REQUIRED');
  if (q.photos.some((x, i) => { const f = staged[i]; return !f || f.campaign_id !== campaign.campaign_id || f.status !== 'STAGED' || f.slot !== x.slot; }))
    return yield* replayOrThrow('PHOTO_NOT_STAGED');
  const media = q.photos.map((x, i) => staged[i]);
  const requestId = deps.id(), vehicleId = deps.id(), eventId = deps.id(), at = deps.now();
  const snapshot = {...payload, photos: media.map(f => ({photoId: f.photo_id, slot: f.slot, storageRef: f.storage_ref, mimeType: f.mime_type, sizeBytes: f.size_bytes}))};
  const journal = {operation: SUBMIT, requestId, vehicleId, campaignId: campaign.campaign_id, idempotencyKey: idemKey, requestDigest: digest};
  const result = {requestId, vehicleId, status: 'PENDING_APPROVAL'};
  try {
    yield {writeMany: [
      {op: 'insert', table: 'vc_operation_journal', data: {event_id: eventId, operation: SUBMIT, entity_id: requestId, actor_id: 'PUBLIC_CAMPAIGN',
        status: 'APPLIED', detail_json: JSON.stringify(journal), created_at: at}},
      {op: 'insert', table: 'vc_registration_requests', data: {request_id: requestId, vehicle_id: vehicleId, campaign_id: campaign.campaign_id,
        status: 'PENDING_APPROVAL', submitted_at: at, reviewed_by: '', reviewed_at: '', application_json: JSON.stringify(snapshot), idempotency_key: idemKey}},
      ...media.map(file => ({op: 'update', table: 'vc_photo_staging', key: {photo_id: file.photo_id}, fields: {status: 'CLAIMED', used_at: at}})),
      {op: 'update', table: 'vc_campaigns', key: {campaign_id: campaign.campaign_id}, fields: {submitted_count: Number(campaign.submitted_count) + 1},
        ...(versioned.version ? {ifVersion: versioned.version} : {})},
      {op: 'insert', table: 'vc_idempotency', data: {key: idemKey, operation: SUBMIT, actor_id: 'PUBLIC_CAMPAIGN', request_digest: digest,
        result_json: JSON.stringify(result), status: 'COMPLETED', created_at: at}}
    ]};
  } catch (error) {
    // a concurrent submit with the same key won: nothing of ours was written (all-or-nothing) → replay its stored result
    if (error && error.message === 'DUPLICATE_KEY') {
      const [winner] = yield {reads: [idemRead(idemKey)]};
      if (winner) {
        if (winner.request_digest === digest && winner.status === 'COMPLETED') return JSON.parse(winner.result_json);
        throw new Error('IDEMPOTENCY_CONFLICT');
      }
    }
    throw error;
  }
  return result;
}

export function* registrationSubmitFlow(p, deps) {
  // checks in the legacy order (person type → form → idempotency key → reference lists → campaign); the rows they need are
  // read in ONE round first (reads have no effect, so the order of the errors is unchanged)
  const withSticker = !(p.stickerCategory === '' || p.stickerCategory === undefined);
  const tokenOk = typeof p.campaignToken === 'string' && /^[a-f0-9]{64}$/i.test(p.campaignToken);
  const {refs, extra} = yield* referencesFlow(deps, [...(withSticker ? [stickerRead] : []), ...(tokenOk ? [campaignRead(p.campaignToken, deps)] : [])]);
  const q = {...p};
  if (withSticker) q.stickerCategory = stickerCategory(q.stickerCategory, stickerList(extra[0])); else delete q.stickerCategory;
  const payload = registrationBody(q);
  const idem = needText(q.idempotencyKey, 'IDEMPOTENCY_KEY', 100);
  const digest = deps.sha256(JSON.stringify({...q, campaignToken: undefined}));
  assertRegistrationAgainst(refs, q);
  if (!tokenOk) throw new Error('CAMPAIGN_INVALID');
  const campaign = checkCampaign(extra[withSticker ? 1 : 0], deps, {requireCapacity: false});
  const idemKey = deps.sha256('registration:' + campaign.campaign_id + ':' + idem);
  for (let attempt = 1; ; attempt++) {
    try { return yield* submitOnce(q, payload, digest, idemKey, deps); }
    catch (error) {
      if (error && error.message === 'WRITE_CONFLICT' && attempt < 4) continue; // the campaign changed under us: re-read, retry
      if (error && error.message === 'WRITE_CONFLICT') throw new Error('CAMPAIGN_BUSY');
      throw error;
    }
  }
}
