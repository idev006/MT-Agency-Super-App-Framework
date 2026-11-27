// Officer-path read operations as shared flows (VC-ADR-046 phase 2b): ONE source for both engines — the legacy engine runs
// them with runFlowSync, the Node core with runFlowAsync. Rules moved unchanged from VehicleOperations.js, VehicleView.js,
// Vehicle360.js, MediaRetentionOperations.js (vehicles.photo) and the vehicles.detail sticker decoration
// (StickerCategoryOperations.js). Every view / contact read / photo view writes its access-audit row (the store's log
// policy decides whether it is kept and for how long — VC-ADR-040).
// deps: {now() → ISO, id() → secret token, sha256(text) → hex}
import {photoLinks} from '../../domain/policies/PhotoLayout.js';
import {photoPolicyRead, readPhotoPolicy} from '../../domain/policies/PhotoPolicy.js';
import {vehicleBusinessKey} from '../../domain/policies/VehicleLifecycle.js';
import {STICKER_SETTING_KEY, DEFAULT_STICKER_CATEGORIES, parseStickerCategories, resolveSticker, stickerInk} from '../../domain/policies/StickerCategoryPolicy.js';

// Same input checks as the legacy `need` helper: a trimmed non-empty string, max 200, no spreadsheet-formula prefix.
export function need(v, name, max = 200) {
  if (typeof v !== 'string' || !v.trim() || v.length > max || /^[=+@]/.test(v.trim())) throw new Error('INVALID_' + name);
  return v.trim();
}
const auditRow = (actor, vehicleId, source, result, {id, now}) => ({audit_id: id(), actor_id: actor.userId, vehicle_id: vehicleId,
  lookup_source: source, result, correlation_id: id().slice(0, 16), created_at: now()});
// append-only access log (an insert is already one atomic commit — no outer transaction)
function* lookupAudit(actor, vehicleId, source, result, deps) { yield {insert: {table: 'vc_lookup_audit', row: auditRow(actor, vehicleId, source, result, deps)}}; }
function* activeVehicle(vehicleId) {
  const [row] = yield {reads: [{kind: 'one', name: 'vc_vehicles', filter: {vehicle_id: need(vehicleId, 'VEHICLE_ID')}}]};
  if (!row || row.status !== 'ACTIVE') throw new Error('VEHICLE_NOT_ACTIVE');
  return row;
}

// The vehicle read model (lookup / detail / QR): the access-audit row is written in the SAME round as the view's reads.
export function* vehicleViewFlow(v, actor, source, deps) {
  if (!v || v.status !== 'ACTIVE') return null;
  const response = {vehicleId: v.vehicle_id, plate: v.plate_normalized, province: v.province_code, status: v.status,
    vehicleType: v.vehicle_type, plateType: v.plate_type, brand: v.make, model: v.model, color: v.color, stickerCategory: v.sticker_category || '', version: Number(v.version)};
  const wantContacts = actor.permissions.includes('vehicle.contact.read');
  const wantPhotos = actor.permissions.includes('vehicle.photos.read');
  const wantHistory = actor.permissions.includes('vehicle.history.read');
  const reads = [];
  if (wantContacts) reads.push({kind: 'list', name: 'vc_vehicle_contacts', filter: {vehicle_id: v.vehicle_id}});
  if (wantPhotos) reads.push({kind: 'list', name: 'vc_vehicle_photos', filter: {vehicle_id: v.vehicle_id}}, photoPolicyRead);
  if (wantHistory) reads.push({kind: 'list', name: 'vc_change_audit', filter: {entity_id: v.vehicle_id}});
  const refKeys = [['VEHICLE_TYPE', v.vehicle_type], ['COLOR', v.color], ['PLATE_TYPE', v.plate_type]].filter(([, code]) => code);
  for (const [catalog, code] of refKeys) reads.push({kind: 'one', name: 'vc_reference_values', filter: {reference_id: 'REF-' + catalog + '-' + code}});
  const extra = reads.length;
  if (v.organization_id) reads.push({kind: 'one', name: 'vc_organizations', filter: {organization_id: v.organization_id}});
  reads.push({kind: 'one', name: 'vc_qr_tokens', filter: {vehicle_id: v.vehicle_id, status: 'ACTIVE'}});
  const rows = yield {reads, inserts: [['vc_lookup_audit', auditRow(actor, v.vehicle_id, source, 'FOUND', deps)]]};
  const tail = rows.splice(extra); // [organization?, activeQr]
  const qrRow = tail.pop(), orgRow = v.organization_id ? tail.pop() : null;
  const contactRows = wantContacts ? rows.shift() : [], photoRows = wantPhotos ? rows.shift() : [], policyRow = wantPhotos ? rows.shift() : null,
    historyRows = wantHistory ? rows.shift() : [];
  const label = {}; for (const ref of rows) if (ref && ref.label_th) label[ref.catalog + '|' + ref.code] = ref.label_th;
  response.organization = {id: v.organization_id || '', name: orgRow && orgRow.name || ''};
  response.registeredAt = v.created_at || ''; response.updatedAt = v.updated_at || '';
  response.qr = {active: Boolean(qrRow), issuedAt: qrRow && qrRow.issued_at || ''};
  const labelOf = (catalog, code) => label[catalog + '|' + code] || '';
  response.labels = {vehicleType: labelOf('VEHICLE_TYPE', v.vehicle_type), color: labelOf('COLOR', v.color), plateType: labelOf('PLATE_TYPE', v.plate_type)};
  if (wantContacts)
    response.contacts = contactRows.filter(c => c.status === 'ACTIVE')
      .map(c => ({name: c.display_name, phone: c.phone_e164, relationship: c.relationship, isPrimary: c.is_primary, verifiedAt: c.verified_at || ''}));
  if (wantPhotos)
    response.photos = photoRows.filter(x => x.status === 'ACTIVE')
      .map(x => ({photoId: x.photo_id, slot: x.slot, storageRef: x.storage_ref, mimeType: x.mime_type, createdAt: x.created_at || '',
        ...photoLinks(x.storage_ref, readPhotoPolicy(policyRow))})); // VC-ADR-050 PR B: the browser loads the photo from Drive
  if (wantHistory) response.history = historyRows.slice(-100)
    .map(x => ({audit_id: x.audit_id, action: x.action, redacted_summary: x.redacted_summary, created_at: x.created_at}));
  return response;
}

// VC-ADR-036 S2: extra dimensions of the DETAIL view, gated by permission (vehicle.list holders: owner, created/updated by,
// registration origin, change requests, retention; audit.read holders: newest 50 lookups). Two parallel rounds.
const ACCESS_LOG_LIMIT = 50;
export function* vehicle360Flow(v, actor) {
  const can = p => actor.permissions.includes(p);
  const admin = can('vehicle.list'), auditor = can('audit.read');
  if (!v || (!admin && !auditor)) return {};
  const reqs = [], at = {};
  const add = (k, r) => { at[k] = reqs.length; reqs.push(r); };
  if (admin) {
    add('reg', {kind: 'list', name: 'vc_registration_requests', filter: {vehicle_id: v.vehicle_id}});
    add('chg', {kind: 'list', name: 'vc_change_requests', filter: {vehicle_id: v.vehicle_id}});
    add('ret', {kind: 'list', name: 'vc_retention_jobs', filter: {vehicle_id: v.vehicle_id}});
  }
  if (auditor) add('acc', {kind: 'newest', name: 'vc_lookup_audit', filter: {vehicle_id: v.vehicle_id}, limit: ACCESS_LOG_LIMIT});
  const rows = reqs.length ? yield {reads: reqs} : [];
  const pick = k => (k in at ? rows[at[k]] || [] : []);
  const regs = pick('reg'), changes = pick('chg'), jobs = pick('ret'), access = pick('acc');
  const reg = regs.filter(r => r.status === 'APPROVED').slice(-1)[0] || regs.slice(-1)[0] || null;
  const userIds = new Set();
  if (admin) [v.owner_user_id, v.created_by, v.updated_by, reg && reg.reviewed_by,
    ...changes.flatMap(c => [c.submitted_by, c.reviewed_by]), ...jobs.map(j => j.approved_by)].forEach(u => u && userIds.add(u));
  access.forEach(a => a.actor_id && userIds.add(a.actor_id));
  const ids = [...userIds];
  const second = ids.map(u => ({kind: 'one', name: 'vc_users', filter: {user_id: u}}));
  if (reg && reg.campaign_id) second.push({kind: 'one', name: 'vc_campaigns', filter: {campaign_id: reg.campaign_id}});
  const named = second.length ? yield {reads: second} : [];
  const names = new Map(ids.map((u, i) => [u, (named[i] && named[i].display_name) || '']));
  const campaign = reg && reg.campaign_id ? named[ids.length] : null;
  const nameOf = u => (u ? names.get(u) || '' : '');
  const out = {};
  if (admin) {
    out.owner = v.owner_user_id ? {name: nameOf(v.owner_user_id)} : null;
    out.createdByName = nameOf(v.created_by);
    out.updatedByName = nameOf(v.updated_by);
    out.registration = reg ? {status: reg.status, submittedAt: reg.submitted_at || '', reviewedAt: reg.reviewed_at || '',
      reviewedByName: nameOf(reg.reviewed_by), campaignName: (campaign && campaign.campaign_name) || '', viaCampaign: Boolean(reg.campaign_id)} : null;
    out.changeRequests = changes.map(c => {
      let fields = [];
      try { fields = Object.keys(JSON.parse(c.proposed_delta || '{}')); } catch { fields = []; }
      return {status: c.status, submittedAt: c.submitted_at || '', submittedByName: nameOf(c.submitted_by),
        reviewedAt: c.reviewed_at || '', reviewedByName: nameOf(c.reviewed_by), fields};
    }).reverse();
    const job = jobs.slice(-1)[0];
    out.retention = job ? {status: job.status, dueAt: job.due_at || '', approvedAt: job.approved_at || '',
      approvedByName: nameOf(job.approved_by), legalHold: job.legal_hold === true || job.legal_hold === 'true'} : null;
  }
  if (auditor) out.accessLog = access.map(a => ({at: a.created_at || '', actorName: nameOf(a.actor_id),
    source: a.lookup_source || '', result: a.result || ''})).sort((x, y) => String(y.at).localeCompare(String(x.at)));
  return out;
}

// vehicles.lookup: plate + province (business key) → the view, or null (a not-found search is logged too)
export function* vehicleLookupFlow(p, actor, deps) {
  const [plate, province] = vehicleBusinessKey(p.plate, p.province).split('|');
  const [list] = yield {reads: [{kind: 'list', name: 'vc_vehicles', filter: {plate_normalized: String(plate), province_code: String(province), status: 'ACTIVE'}}]};
  if (list.length > 1) throw new Error('DUPLICATE_ACTIVE_VEHICLE');
  if (!list.length) { yield* lookupAudit(actor, 'NO_MATCH', 'PLATE', 'NOT_FOUND', deps); return null; }
  return yield* vehicleViewFlow(list[0], actor, 'PLATE', deps);
}

// vehicles.detail: the view + Vehicle 360 dimensions + the resolved sticker and the active person types
// (the sticker list is read in the SAME round as the vehicle: detail = 2 rounds, was 3 with the old outer decorator)
export function* vehicleDetailFlow(p, actor, deps) {
  const [v, stickerRow] = yield {reads: [{kind: 'one', name: 'vc_vehicles', filter: {vehicle_id: need(p.vehicleId, 'VEHICLE_ID')}},
    {kind: 'one', name: 'vc_settings', filter: {key: STICKER_SETTING_KEY}}]};
  if (!v || v.status !== 'ACTIVE') throw new Error('VEHICLE_NOT_ACTIVE');
  const view = yield* vehicleViewFlow(v, actor, 'DETAIL', deps);
  const out = view ? Object.assign(view, yield* vehicle360Flow(v, actor)) : view;
  if (!out) return out;
  const l = stickerRow && stickerRow.value ? parseStickerCategories(stickerRow.value) : DEFAULT_STICKER_CATEGORIES;
  const choices = l.map(c => ({...c, ink: stickerInk(c.hex)})).filter(c => c.active);
  return {...out, sticker: resolveSticker(out.stickerCategory, l), stickerCategories: choices};
}

// vehicles.history: the vehicle's change-audit trail, the last 100 entries in insertion order
export function* vehicleHistoryFlow(p) {
  const vehicleId = need(p.vehicleId, 'VEHICLE_ID');
  const [rows] = yield {reads: [{kind: 'list', name: 'vc_change_audit', filter: {entity_id: vehicleId}}]};
  return rows.slice(-100);
}

// contacts.read: the active contacts of an active vehicle (always logged — CONTACT cannot be switched off)
export function* contactReadFlow(p, actor, deps) {
  const v = yield* activeVehicle(p.vehicleId);
  const [list] = yield {reads: [{kind: 'list', name: 'vc_vehicle_contacts', filter: {vehicle_id: v.vehicle_id}}]};
  yield* lookupAudit(actor, v.vehicle_id, 'CONTACT', 'FOUND', deps);
  return list.filter(x => x.status === 'ACTIVE').map(x => ({name: x.display_name, phone: x.phone_e164, relationship: x.relationship}));
}

// qr.resolve: a 64-hex sticker token → the vehicle view; a signed-in officer is told WHY (revoked / vehicle inactive),
// never a vehicle field (owner 2026-11-26)
export function* qrResolveFlow(p, actor, deps) {
  const token = need(p.token, 'TOKEN');
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error('INVALID_QR');
  const [qr] = yield {reads: [{kind: 'one', name: 'vc_qr_tokens', filter: {token_digest: deps.sha256(token.toLowerCase())}}]};
  if (!qr) { yield* lookupAudit(actor, 'NO_MATCH', 'QR', 'NOT_FOUND', deps); return null; }
  if (qr.status !== 'ACTIVE') { yield* lookupAudit(actor, qr.vehicle_id || 'NO_MATCH', 'QR', 'QR_REVOKED', deps); throw new Error('QR_REVOKED'); }
  const [v] = yield {reads: [{kind: 'one', name: 'vc_vehicles', filter: {vehicle_id: qr.vehicle_id}}]};
  if (!v || v.status !== 'ACTIVE') { yield* lookupAudit(actor, qr.vehicle_id || 'NO_MATCH', 'QR', 'VEHICLE_NOT_ACTIVE', deps); throw new Error('VEHICLE_NOT_ACTIVE'); }
  return yield* vehicleViewFlow(v, actor, 'QR', deps);
}

// vehicles.photo: one ACTIVE photo of an ACTIVE vehicle, read through the media port (owner's Drive via the bridge)
export function* vehiclePhotoFlow(p, actor, deps) {
  const vehicleId = need(p.vehicleId, 'VEHICLE_ID'), photoId = need(p.photoId, 'PHOTO_ID');
  const [vehicle, photo] = yield {reads: [{kind: 'one', name: 'vc_vehicles', filter: {vehicle_id: vehicleId}}, {kind: 'one', name: 'vc_vehicle_photos', filter: {photo_id: photoId}}]};
  if (!vehicle || vehicle.status !== 'ACTIVE') throw new Error('VEHICLE_NOT_ACTIVE');
  if (!photo || photo.vehicle_id !== vehicleId || photo.status !== 'ACTIVE') throw new Error('PHOTO_NOT_FOUND');
  const media = yield {mediaRead: {ref: photo.storage_ref}};
  yield* lookupAudit(actor, vehicleId, 'PHOTO', 'FOUND', deps);
  return {photoId, slot: photo.slot, mimeType: media.mime_type, base64Image: media.base64Image};
}
