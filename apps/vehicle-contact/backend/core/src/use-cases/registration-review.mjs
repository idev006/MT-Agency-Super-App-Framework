// N1b PR 3 (VC-ADR-051): registration review as native async use cases on the core —
// registrations.listPending / detail / review / photo. Same behaviour as the legacy VehicleOperations + StickerCategoryOperations
// + MediaRetentionOperations (the legacy acceptance tests run through the core as generated copies), with two changes:
//  - the approval's duplicate check queries ACTIVE vehicles by plate + province (index plate_normalized+province_code+status)
//    instead of reading the whole vehicle table;
//  - listPending reads one bounded window + COUNT in one round instead of every pending request.
// The QR token of an approval is derived (deriveSecret = HMAC with the auth pepper, the same key as the legacy engine), so a
// replay or a recovery returns the same token from either engine.
import {pageWindow, pageOf} from '../../../gas/src/application/pagination/Pagination.js';
import {runFlowAsync} from '../../../gas/src/application/flows/FlowRunner.js';
import {organizeVehiclePhotosFlow} from '../../../gas/src/application/flows/PhotoLayoutFlow.js';
import {photoLinks} from '../../../gas/src/domain/policies/PhotoLayout.js';
import {PHOTO_POLICY_KEY, readPhotoPolicy} from '../../../gas/src/domain/policies/PhotoPolicy.js';
import {STICKER_SETTING_KEY, stickerCategoriesFrom, resolveSticker, stickerCategory, stickerInk}
  from '../../../gas/src/domain/policies/StickerCategoryPolicy.js';

const PAGE_OPTIONS = {defaultLimit: 50, maxLegacyLimit: 100};
const REVIEW = 'registrations.review';
const need = (v, name, max = 200) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max || /^[=+@]/.test(v.trim())) throw new Error('INVALID_' + name);
  return v.trim();
};
const parseJournal = row => { try { return JSON.parse(row?.detail_json || '{}'); } catch { return {}; } };
const reviewStatus = decision => (decision === 'APPROVE' ? 'APPROVED' : 'REJECTED');
const reviewAction = decision => (decision === 'APPROVE' ? 'REGISTRATION_APPROVED' : 'REGISTRATION_REJECTED');
const stickerRead = {kind: 'one', name: 'vc_settings', filter: {key: STICKER_SETTING_KEY}};
const choices = list => list.map(c => ({...c, ink: stickerInk(c.hex)})).filter(c => c.active);

export async function registrationsListPending(p, _actor, {store}) {
  const window = pageWindow(p, PAGE_OPTIONS);
  const filter = {status: 'PENDING_APPROVAL'};
  const [rows, total] = await store.readMany([
    {kind: 'list', name: 'vc_registration_requests', filter, limit: window.n},
    {kind: 'count', name: 'vc_registration_requests', filter}
  ]);
  const items = (rows || []).map(r => ({requestId: r.request_id, vehicleId: r.vehicle_id, submittedAt: r.submitted_at, status: r.status}));
  return pageOf(items, Number(total), window);
}

export async function registrationsDetail(p, _actor, {store}) {
  const requestId = need(p.requestId, 'REQUEST_ID');
  const [r, policyRow, stickerRow] = await store.readMany([
    {kind: 'one', name: 'vc_registration_requests', filter: {request_id: requestId}},
    {kind: 'one', name: 'vc_settings', filter: {key: PHOTO_POLICY_KEY}},
    stickerRead
  ]);
  if (!r) throw new Error('NOT_FOUND');
  const application = JSON.parse(r.application_json), policy = readPhotoPolicy(policyRow);
  // VC-ADR-050 PR B: each evidence photo carries its Drive links (the reviewer's browser loads it directly)
  if (Array.isArray(application.photos)) application.photos = application.photos.map(f => ({...f, ...photoLinks(f.storageRef, policy)}));
  const list = stickerCategoriesFrom(stickerRow);
  return {requestId: r.request_id, status: r.status, application, submittedAt: r.submitted_at,
    sticker: resolveSticker(application?.sticker_category || '', list), stickerCategories: choices(list)};
}

export async function registrationsPhoto(p, actor, {store, now, id, media}) {
  const requestId = need(p.requestId, 'REQUEST_ID', 256), photoId = need(p.photoId, 'PHOTO_ID', 256);
  const request = await store.one('vc_registration_requests', {request_id: requestId});
  if (!request) throw new Error('NOT_FOUND');
  const photo = (JSON.parse(request.application_json).photos || []).find(f => f.photoId === photoId);
  if (!photo) throw new Error('PHOTO_NOT_FOUND');
  await store.insert('vc_change_audit', {audit_id: id(), actor_id: actor && actor.userId || 'PUBLIC_CAMPAIGN',
    entity_type: 'registration', entity_id: requestId, action: 'REGISTRATION_PHOTO_VIEWED',
    redacted_summary: 'REGISTRATION_PHOTO_VIEWED', correlation_id: id().slice(0, 16), created_at: now()});
  if (!media) throw new Error('MEDIA_NOT_CONFIGURED');
  const file = await media.read(photo.storageRef);
  return {photoId, slot: photo.slot, mimeType: file.mime_type, base64Image: file.base64Image};
}

// registrations.review: the sticker rule (StickerCategoryOperations), then the review with WRITE_CONFLICT retries
export async function registrationsReview(p, actor, deps) {
  const {store, media} = deps;
  if (!deps.deriveSecret) throw new Error('AUTH_PEPPER_NOT_CONFIGURED');
  let payload = p;
  if (p.decision === 'APPROVE') {
    let [stickerRow, request] = await store.readMany([stickerRead,
      ...(typeof p.requestId === 'string' ? [{kind: 'one', name: 'vc_registration_requests', filter: {request_id: p.requestId}}] : [])]);
    let code = typeof p.stickerCategory === 'string' && p.stickerCategory.trim() ? p.stickerCategory : '';
    if (!code) { try { code = request ? JSON.parse(request.application_json).sticker_category || '' : ''; } catch { code = ''; } }
    if (!code) throw new Error('STICKER_CATEGORY_REQUIRED');
    payload = {...p, stickerCategory: stickerCategory(code, stickerCategoriesFrom(stickerRow))};
  }
  const requestId = need(payload.requestId, 'REQUEST_ID');
  if (!['APPROVE', 'REJECT'].includes(payload.decision)) throw new Error('INVALID_DECISION');
  // C4: the request is read with its version and the commit is guarded by it; a WRITE_CONFLICT re-runs the review
  // (the same decision replays, a different one is refused)
  for (let attempt = 1; ; attempt++) {
    let result;
    try { result = await reviewOnce(payload, requestId, actor, deps); }
    catch (error) { if (!error || error.message !== 'WRITE_CONFLICT') throw error; if (attempt >= 3) throw new Error('BUSY'); continue; }
    // VC-ADR-050: the approved vehicle's photos go into its own Drive folder (best effort: never undoes the approval)
    if (payload.decision === 'APPROVE' && result && result.vehicleId && media && typeof media.organize === 'function')
      try { await runFlowAsync(organizeVehiclePhotosFlow(result.vehicleId), {store, media}); } catch { /* PR C's job catches up */ }
    return result;
  }
}

async function reviewOnce(p, requestId, actor, deps) {
  const {store, id} = deps;
  const decision = p.decision;
  const [versioned, journals] = await store.readMany([
    {kind: 'versioned', name: 'vc_registration_requests', filter: {request_id: requestId}},
    // newest-first: the live DB has the DESC composite index for this filter (the V57 regression)
    {kind: 'newest', name: 'vc_operation_journal', filter: {operation: REVIEW, entity_id: requestId}, limit: 1}]);
  let r = versioned && versioned.row;
  if (!r) throw new Error('INVALID_REQUEST_STATE');
  const app = JSON.parse(r.application_json), previous = (journals || [])[0] || null, prior = parseJournal(previous);
  if (decision === 'APPROVE' && p.platePhotoVerified !== true) throw new Error('PLATE_PHOTO_NOT_VERIFIED');
  if (previous && ['PREPARED', 'RECOVERY_REQUIRED'].includes(previous.status)) {
    if (prior.decision !== decision) throw new Error('OPERATION_RECOVERY_REQUIRED');
    if (await completeReviewState(r, app, previous, prior, deps)) {
      await ensureReviewAudit(prior, deps);
      await store.update('vc_operation_journal', {event_id: previous.event_id}, {status: 'APPLIED'});
      return reviewResult(r, previous, prior, deps);
    }
    const errors = await rollbackReviewPartial(r, deps);
    if (errors.length) {
      try { await store.update('vc_operation_journal', {event_id: previous.event_id}, {status: 'RECOVERY_REQUIRED',
        detail_json: JSON.stringify({...prior, recovery: {stage: 'RESTART_CLEANUP', errors}})}); } catch { /* the refusal below stands */ }
      throw new Error('OPERATION_RECOVERY_REQUIRED');
    }
    r = await store.one('vc_registration_requests', {request_id: requestId});
    if (!r || r.status !== 'PENDING_APPROVAL') throw new Error('OPERATION_RECOVERY_REQUIRED');
    return applyReview(previous, prior, r, app, deps);
  }
  if (previous && previous.status === 'APPLIED' && prior.decision === decision) {
    if (!(await completeReviewState(r, app, previous, prior, deps))) throw new Error('OPERATION_RECOVERY_REQUIRED');
    await ensureReviewAudit(prior, deps);
    return reviewResult(r, previous, prior, deps);
  }
  if (r.status !== 'PENDING_APPROVAL') throw new Error('INVALID_REQUEST_STATE');
  const eventId = id(); // drawn before the detail ids, in the legacy order
  const detail = {operation: REVIEW, requestId, vehicleId: r.vehicle_id, decision, actorId: actor.userId,
    contactId: id(), qrId: decision === 'APPROVE' ? id() : '', auditId: id(), correlationId: id().slice(0, 16),
    stickerCategory: p.stickerCategory || app.sticker_category || ''};
  return commitReview(eventId, detail, r, app, versioned.version, deps);
}

const reviewToken = (deps, eventId, requestId) => deps.deriveSecret('registration-review:' + eventId + ':' + requestId);
// ACTIVE vehicles with this business key — an equality query (index plate_normalized + province_code + status)
const activeByPlate = (store, app) => store.list('vc_vehicles',
  {plate_normalized: String(app.plate_normalized), province_code: String(app.province_code), status: 'ACTIVE'});

function approvalRows(detail, request, app, token, at, sha256) {
  return [
    {op: 'insert', table: 'vc_vehicles', data: {vehicle_id: request.vehicle_id, plate_normalized: app.plate_normalized, province_code: app.province_code,
      vehicle_type: app.vehicle_type, make: app.make, model: app.model, color: app.color, status: 'ACTIVE', version: 1,
      created_at: at, updated_at: at, created_by: detail.actorId, updated_by: detail.actorId, plate_type: app.plate_type,
      organization_id: app.organization_id, sticker_category: detail.stickerCategory || ''}},
    {op: 'insert', table: 'vc_vehicle_contacts', data: {contact_id: detail.contactId, vehicle_id: request.vehicle_id, display_name: app.contactName,
      phone_e164: app.contactPhone, relationship: app.relationship, is_primary: true, status: 'ACTIVE', verified_at: at, created_at: at, updated_at: at}},
    ...app.photos.map(f => ({op: 'insert', table: 'vc_vehicle_photos', data: {photo_id: f.photoId, vehicle_id: request.vehicle_id,
      slot: f.slot, storage_ref: f.storageRef, mime_type: f.mimeType, size_bytes: f.sizeBytes, status: 'ACTIVE', version: 1, created_at: at}})),
    {op: 'insert', table: 'vc_qr_tokens', data: {qr_id: detail.qrId, vehicle_id: request.vehicle_id, token_digest: sha256(token), qr_token: token,
      issued_at: at, revoked_at: '', issued_by: detail.actorId, reason: 'REGISTRATION_APPROVED', status: 'ACTIVE'}}
  ];
}

// W1 fresh review: every write in ONE all-or-nothing commit — nothing partial to compensate. A concurrent approval of the
// same request collides on the vehicle / QR create preconditions, so only one approval can ever land.
async function commitReview(eventId, detail, request, app, requestVersion, deps) {
  const {store, now, sha256} = deps;
  const at = now(), approve = detail.decision === 'APPROVE', token = approve ? reviewToken(deps, eventId, request.request_id) : '';
  if (approve && (await activeByPlate(store, app)).some(v => v.vehicle_id !== request.vehicle_id)) throw new Error('DUPLICATE_VEHICLE');
  const writes = [{op: 'insert', table: 'vc_operation_journal', data: {event_id: eventId, operation: REVIEW, entity_id: request.request_id,
    actor_id: detail.actorId, status: 'APPLIED', detail_json: JSON.stringify(detail), created_at: at}}];
  if (approve) writes.push(...approvalRows(detail, request, app, token, at, sha256));
  writes.push({op: 'update', table: 'vc_registration_requests', key: {request_id: request.request_id},
    fields: {status: reviewStatus(detail.decision), reviewed_by: detail.actorId, reviewed_at: at}, ...(requestVersion ? {ifVersion: requestVersion} : {})});
  if (approve) writes.push({op: 'insert', table: 'vc_change_audit', data: {audit_id: detail.auditId + '-v', actor_id: detail.actorId, entity_type: 'vehicle',
    entity_id: request.vehicle_id, action: 'REGISTRATION_APPROVED', redacted_summary: 'REGISTRATION_APPROVED', correlation_id: detail.correlationId, created_at: at}});
  writes.push({op: 'insert', table: 'vc_change_audit', data: {audit_id: detail.auditId, actor_id: detail.actorId, entity_type: 'registration',
    entity_id: request.request_id, action: reviewAction(detail.decision), redacted_summary: reviewAction(detail.decision),
    correlation_id: detail.correlationId, created_at: at}});
  // a create collision = a concurrent review of this request committed first: re-read (WRITE_CONFLICT)
  try { await store.writeMany(writes); } catch (error) { if (error && error.message === 'DUPLICATE_KEY') throw new Error('WRITE_CONFLICT'); throw error; }
  const result = {requestId: request.request_id, vehicleId: request.vehicle_id, status: reviewStatus(detail.decision)};
  if (approve) { result.qrToken = token; result.qrId = detail.qrId; }
  return result;
}

// --- recovery of a journal left PREPARED / RECOVERY_REQUIRED by an older engine (B2B: restart converges, replay = same token)
async function ensureReviewAudit(detail, {store, now, id}) {
  if (await store.one('vc_change_audit', {audit_id: detail.auditId})) return;
  const action = reviewAction(detail.decision);
  await store.insert('vc_change_audit', {audit_id: detail.auditId || id(), actor_id: detail.actorId || 'PUBLIC_CAMPAIGN', entity_type: 'registration',
    entity_id: detail.requestId, action, redacted_summary: action, correlation_id: detail.correlationId || id().slice(0, 16), created_at: now()});
}
async function reviewResult(request, journal, detail, deps) {
  const result = {requestId: request.request_id, vehicleId: request.vehicle_id, status: reviewStatus(detail.decision)};
  if (detail.decision === 'APPROVE') {
    const token = reviewToken(deps, journal.event_id, request.request_id), qr = await deps.store.one('vc_qr_tokens', {qr_id: detail.qrId});
    if (!qr || qr.vehicle_id !== request.vehicle_id || qr.status !== 'ACTIVE' || qr.token_digest !== deps.sha256(token)) throw new Error('OPERATION_RECOVERY_REQUIRED');
    result.qrToken = token; result.qrId = detail.qrId;
  }
  return result;
}
async function completeReviewState(request, app, journal, detail, deps) {
  if (request.status !== reviewStatus(detail.decision)) return false;
  if (detail.decision === 'REJECT') return true;
  const {store, sha256} = deps, vehicleId = request.vehicle_id;
  const [vehicle, contacts, photos, qr] = await store.readMany([
    {kind: 'one', name: 'vc_vehicles', filter: {vehicle_id: vehicleId}},
    {kind: 'list', name: 'vc_vehicle_contacts', filter: {vehicle_id: vehicleId}, limit: 10},
    {kind: 'list', name: 'vc_vehicle_photos', filter: {vehicle_id: vehicleId}, limit: 10},
    {kind: 'one', name: 'vc_qr_tokens', filter: {qr_id: detail.qrId}}]);
  const token = reviewToken(deps, journal.event_id, request.request_id);
  const activeContacts = (contacts || []).filter(x => x.status === 'ACTIVE'), activePhotos = (photos || []).filter(x => x.status === 'ACTIVE');
  const expected = (app.photos || []).map(x => x.photoId).sort(), actual = activePhotos.map(x => x.photo_id).sort();
  return !!vehicle && vehicle.status === 'ACTIVE' && activeContacts.length === 1 && JSON.stringify(expected) === JSON.stringify(actual)
    && !!qr && qr.vehicle_id === vehicleId && qr.status === 'ACTIVE' && qr.token_digest === sha256(token);
}
async function rollbackReviewPartial(request, {store}) {
  const errors = [];
  const attempt = async fn => { try { await fn(); } catch (error) { errors.push(String(error?.message || 'COMPENSATION_FAILED').slice(0, 64)); } };
  const vehicleId = request.vehicle_id;
  for (const row of await store.list('vc_qr_tokens', {vehicle_id: vehicleId}, 10)) await attempt(() => store.remove('vc_qr_tokens', {qr_id: row.qr_id}));
  for (const row of await store.list('vc_vehicle_photos', {vehicle_id: vehicleId}, 10)) await attempt(() => store.remove('vc_vehicle_photos', {photo_id: row.photo_id}));
  for (const row of await store.list('vc_vehicle_contacts', {vehicle_id: vehicleId}, 10)) await attempt(() => store.remove('vc_vehicle_contacts', {contact_id: row.contact_id}));
  if (await store.one('vc_vehicles', {vehicle_id: vehicleId})) await attempt(() => store.remove('vc_vehicles', {vehicle_id: vehicleId}));
  const current = await store.one('vc_registration_requests', {request_id: request.request_id});
  if (current && current.status !== 'PENDING_APPROVAL') await attempt(() => store.update('vc_registration_requests',
    {request_id: request.request_id}, {status: 'PENDING_APPROVAL', reviewed_by: '', reviewed_at: ''}));
  return errors;
}
// re-apply a recovered review: the business rows + the request in ONE commit, then the audit and the journal
async function applyReview(journal, detail, request, app, deps) {
  const {store, now, sha256} = deps;
  let terminalApplied = false;
  try {
    const at = now(), writes = [];
    if (detail.decision === 'APPROVE') {
      if ((await activeByPlate(store, app)).some(v => v.vehicle_id !== request.vehicle_id)) throw new Error('DUPLICATE_VEHICLE');
      writes.push(...approvalRows(detail, request, app, reviewToken(deps, journal.event_id, request.request_id), at, sha256));
    }
    writes.push({op: 'update', table: 'vc_registration_requests', key: {request_id: request.request_id},
      fields: {status: reviewStatus(detail.decision), reviewed_by: detail.actorId, reviewed_at: at}});
    await store.writeMany(writes);
    terminalApplied = true;
    await ensureReviewAudit(detail, deps);
    await store.update('vc_operation_journal', {event_id: journal.event_id}, {status: 'APPLIED'});
    return reviewResult(await store.one('vc_registration_requests', {request_id: request.request_id}), journal, detail, deps);
  } catch (error) {
    if (terminalApplied) {
      try { await store.update('vc_operation_journal', {event_id: journal.event_id}, {status: 'RECOVERY_REQUIRED',
        detail_json: JSON.stringify({...detail, recovery: {stage: 'TERMINAL_STATE_APPLIED'}})}); } catch { /* refusal stands */ }
      throw new Error('OPERATION_RECOVERY_REQUIRED');
    }
    const errors = await rollbackReviewPartial(request, deps);
    try { await store.update('vc_operation_journal', {event_id: journal.event_id}, {status: errors.length ? 'RECOVERY_REQUIRED' : 'ROLLED_BACK',
      detail_json: JSON.stringify({...detail, recovery: {stage: 'REVIEW_WRITES', errors}})}); } catch { errors.push('JOURNAL_UPDATE_FAILED'); }
    if (errors.length) throw new Error('OPERATION_RECOVERY_REQUIRED');
    throw error;
  }
}
