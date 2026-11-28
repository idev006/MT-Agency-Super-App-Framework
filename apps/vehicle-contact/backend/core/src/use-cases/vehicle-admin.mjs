// N1b PR 4 (VC-ADR-051): vehicle administration + owner change requests as native async use cases on the core —
// vehicles.update / vehicles.cancel / contacts.update and changes.submit / listPending / review / listMine. Same behaviour as
// the legacy VehicleOperations + ChangeReviewOperation + the sticker rule (StickerCategoryOperations); the legacy acceptance
// tests run through the core as generated copies. What the core does better:
//  - every write path is ONE all-or-nothing commit (cancel: vehicle + QR revokes + retention job + audit; contact update +
//    audit; submit + audit), the vehicle write guarded by its version;
//  - the pending / own change lists read one window + COUNT instead of every row.
import {pageWindow, pageOf} from '../../../gas/src/application/pagination/Pagination.js';
import {assertVehicleTransition, vehicleBusinessKey} from '../../../gas/src/domain/policies/VehicleLifecycle.js';
import {QR_SYSTEM_REASONS} from '../../../gas/src/domain/policies/QrReasonPolicy.js';
import {STICKER_SETTING_KEY, stickerCategoriesFrom, stickerCategory, stickerCode}
  from '../../../gas/src/domain/policies/StickerCategoryPolicy.js';

const PAGE_OPTIONS = {defaultLimit: 50, maxLegacyLimit: 100};
const need = (v, name, max = 200) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max || /^[=+@]/.test(v.trim())) throw new Error('INVALID_' + name);
  return v.trim();
};
const phone = v => { if (typeof v !== 'string' || !/^\+[1-9][0-9]{6,14}$/.test(v)) throw new Error('INVALID_PHONE_E164'); return v; };
const auditRow = ({id, at}, actor, kind, entity, action) => ({op: 'insert', table: 'vc_change_audit', data: {audit_id: id(),
  actor_id: actor && actor.userId || 'PUBLIC_CAMPAIGN', entity_type: kind, entity_id: entity, action, redacted_summary: action,
  correlation_id: id().slice(0, 16), created_at: at}});
const versionGuard = read => (read && read.version ? {ifVersion: read.version} : {});
async function retrying(times, fn, exhausted = 'BUSY') {
  for (let attempt = 1; ; attempt++) {
    try { return await fn(); }
    catch (error) { if (!error || error.message !== 'WRITE_CONFLICT') throw error; if (attempt >= times) throw new Error(exhausted); }
  }
}
const activeOrThrow = row => { if (!row || row.status !== 'ACTIVE') throw new Error('VEHICLE_NOT_ACTIVE'); return row; };

// vehicles.update: the sticker rule first (a live, ACTIVE category), then one version-guarded commit
export async function vehiclesUpdate(p, a, {store, now, id}) {
  let sticker;
  if (p.stickerCategory !== undefined)
    sticker = stickerCategory(p.stickerCategory, stickerCategoriesFrom(await store.one('vc_settings', {key: STICKER_SETTING_KEY})));
  const vehicleId = need(p.vehicleId, 'VEHICLE_ID');
  const [read, owner] = await store.readMany([
    {kind: 'versioned', name: 'vc_vehicles', filter: {vehicle_id: vehicleId}},
    ...(p.ownerUserId !== undefined ? [{kind: 'one', name: 'vc_users', filter: {user_id: need(p.ownerUserId, 'OWNER_USER_ID')}}] : [])]);
  const v = activeOrThrow(read && read.row);
  const version = Number(v.version);
  if (!Number.isInteger(p.expectedVersion) || p.expectedVersion !== version) throw new Error('VERSION_CONFLICT');
  const at = now(), patch = {updated_at: at, updated_by: a.userId, version: version + 1};
  for (const [client, field] of [['brand', 'make'], ['model', 'model'], ['color', 'color'], ['plateType', 'plate_type'], ['vehicleType', 'vehicle_type']])
    if (p[client] !== undefined) patch[field] = need(p[client], client);
  if (sticker !== undefined) patch.sticker_category = stickerCode(sticker);
  if (p.ownerUserId !== undefined) {
    if (!owner || owner.status !== 'ACTIVE') throw new Error('OWNER_NOT_FOUND');
    patch.owner_user_id = owner.user_id;
  }
  if (p.plate !== undefined || p.province !== undefined) {
    const [plate, province] = vehicleBusinessKey(p.plate ?? v.plate_normalized, p.province ?? v.province_code).split('|');
    const same = await store.list('vc_vehicles', {plate_normalized: plate, province_code: province, status: 'ACTIVE'});
    if (same.some(x => x.vehicle_id !== vehicleId)) throw new Error('DUPLICATE_VEHICLE');
    patch.plate_normalized = plate; patch.province_code = province;
  }
  try {
    await store.writeMany([{op: 'update', table: 'vc_vehicles', key: {vehicle_id: vehicleId}, fields: patch, ...versionGuard(read)},
      auditRow({id, at}, a, 'vehicle', vehicleId, 'VEHICLE_UPDATED')]);
  } catch (error) { if (error && error.message === 'WRITE_CONFLICT') throw new Error('VERSION_CONFLICT'); throw error; }
  return {vehicleId, version: version + 1};
}

// vehicles.cancel: INACTIVE + every ACTIVE QR revoked + a retention job + audit — one commit
export async function vehiclesCancel(p, a, {store, now, id}) {
  const vehicleId = need(p.vehicleId, 'VEHICLE_ID');
  return retrying(3, async () => {
    const [read, setting, qrs] = await store.readMany([
      {kind: 'versioned', name: 'vc_vehicles', filter: {vehicle_id: vehicleId}},
      {kind: 'one', name: 'vc_settings', filter: {key: 'retention_days'}},
      {kind: 'list', name: 'vc_qr_tokens', filter: {vehicle_id: vehicleId}}]);
    const v = activeOrThrow(read && read.row);
    assertVehicleTransition(v.status, 'INACTIVE');
    const retention = Number(setting?.value);
    if (!Number.isSafeInteger(retention) || retention < 1) throw new Error('RETENTION_POLICY_NOT_CONFIGURED');
    const at = now();
    const writes = [{op: 'update', table: 'vc_vehicles', key: {vehicle_id: vehicleId},
      fields: {status: 'INACTIVE', version: Number(v.version) + 1, updated_at: at, updated_by: a.userId}, ...versionGuard(read)}];
    for (const q of (qrs || []).filter(x => x.status === 'ACTIVE'))
      writes.push({op: 'update', table: 'vc_qr_tokens', key: {qr_id: q.qr_id},
        fields: {status: 'REVOKED', revoked_at: at, revoked_by: a.userId, revoke_reason: QR_SYSTEM_REASONS.cancel, revoke_note: ''}});
    writes.push({op: 'insert', table: 'vc_retention_jobs', data: {job_id: id(), vehicle_id: vehicleId,
      due_at: new Date(Date.parse(at) + retention * 86400000).toISOString(), status: 'WAITING_RETENTION', approved_by: '', approved_at: '',
      attempts: 0, last_error: '', legal_hold: false, created_at: at, updated_at: at}});
    writes.push(auditRow({id, at}, a, 'vehicle', vehicleId, 'VEHICLE_CANCELLED'));
    await store.writeMany(writes);
    return {vehicleId, status: 'INACTIVE'};
  });
}

// contacts.update: the one ACTIVE primary contact of an ACTIVE vehicle, + audit — one commit
export async function contactsUpdate(p, a, {store, now, id}) {
  const vehicleId = need(p.vehicleId, 'VEHICLE_ID');
  const [vehicle, contacts] = await store.readMany([
    {kind: 'one', name: 'vc_vehicles', filter: {vehicle_id: vehicleId}},
    {kind: 'list', name: 'vc_vehicle_contacts', filter: {vehicle_id: vehicleId}}]);
  const v = activeOrThrow(vehicle);
  const list = (contacts || []).filter(x => x.status === 'ACTIVE' && x.is_primary === true);
  if (list.length !== 1) throw new Error('PRIMARY_CONTACT_INVARIANT');
  const at = now(), patch = {updated_at: at};
  if (p.contactName !== undefined) patch.display_name = need(p.contactName, 'CONTACT_NAME');
  if (p.contactPhone !== undefined) patch.phone_e164 = phone(p.contactPhone);
  if (Object.keys(patch).length === 1) throw new Error('NO_CHANGES');
  await store.writeMany([{op: 'update', table: 'vc_vehicle_contacts', key: {contact_id: list[0].contact_id}, fields: patch},
    auditRow({id, at}, a, 'vehicle', v.vehicle_id, 'CONTACT_UPDATED')]);
  return {vehicleId: v.vehicle_id, updated: true};
}

// changes.submit: the owner (or a vehicle.update holder) proposes a delta; request + audit in one commit
export async function changesSubmit(p, a, {store, now, id}) {
  const v = activeOrThrow(await store.one('vc_vehicles', {vehicle_id: need(p.vehicleId, 'VEHICLE_ID')}));
  if (!a || !(v.owner_user_id === a.userId || a.permissions.includes('vehicle.update'))) throw new Error('OWNERSHIP_NOT_VERIFIED');
  const delta = {};
  for (const f of ['contactName', 'contactPhone', 'brand', 'model', 'color'])
    if (p[f] !== undefined) delta[f] = f === 'contactPhone' ? phone(p[f]) : need(p[f], f);
  if (!Object.keys(delta).length) throw new Error('NO_CHANGES');
  const reqId = id(), at = now();
  await store.writeMany([{op: 'insert', table: 'vc_change_requests', data: {change_id: reqId, vehicle_id: v.vehicle_id,
    proposed_delta: JSON.stringify(delta), status: 'PENDING', submitted_by: a.userId, submitted_at: at, reviewed_by: '', reviewed_at: ''}},
  auditRow({id, at}, a, 'change', reqId, 'CHANGE_SUBMITTED')]);
  return {requestId: reqId, status: 'PENDING'};
}

async function changePage(store, filter, p, map) {
  const window = pageWindow(p, PAGE_OPTIONS);
  const [rows, total] = await store.readMany([
    {kind: 'list', name: 'vc_change_requests', filter, limit: window.n},
    {kind: 'count', name: 'vc_change_requests', filter}]);
  return pageOf((rows || []).map(map), Number(total), window);
}
export const changesListPending = (p, _a, {store}) => changePage(store, {status: 'PENDING'}, p,
  r => ({requestId: r.change_id, vehicleId: r.vehicle_id, submittedAt: r.submitted_at, proposedDelta: JSON.parse(r.proposed_delta)}));
export const changesListMine = (p, a, {store}) => changePage(store, {submitted_by: String(a.userId)}, p,
  r => ({requestId: r.change_id, vehicleId: r.vehicle_id, status: r.status, submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at, proposedDelta: JSON.parse(r.proposed_delta)}));

// changes.review (C6): ONE version-guarded commit; on conflict re-read: same decision applied → replay, other → refused
export async function changesReview(p, a, {store, now, id}) {
  const requestId = need(p.requestId, 'REQUEST_ID');
  if (!['APPROVE', 'REJECT'].includes(p.decision)) throw new Error('INVALID_DECISION');
  const target = p.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  return retrying(4, async () => {
    const [request] = await store.readMany([{kind: 'versioned', name: 'vc_change_requests', filter: {change_id: requestId}}]);
    const r = request && request.row;
    if (!r) throw new Error('INVALID_REQUEST_STATE');
    if (r.status === target) return {requestId, status: p.decision, replayed: true};
    if (r.status !== 'PENDING') throw new Error('INVALID_REQUEST_STATE');
    const at = now(), writes = [];
    if (p.decision === 'APPROVE') {
      const delta = JSON.parse(r.proposed_delta), wantsContact = delta.contactName !== undefined || delta.contactPhone !== undefined;
      const [vehicle, contacts] = await store.readMany([{kind: 'versioned', name: 'vc_vehicles', filter: {vehicle_id: r.vehicle_id}},
        ...(wantsContact ? [{kind: 'list', name: 'vc_vehicle_contacts', filter: {vehicle_id: r.vehicle_id}}] : [])]);
      const v = activeOrThrow(vehicle && vehicle.row);
      const patch = {updated_at: at, updated_by: a.userId, version: Number(v.version) + 1};
      for (const [client, field] of [['brand', 'make'], ['model', 'model'], ['color', 'color']]) if (delta[client] !== undefined) patch[field] = delta[client];
      writes.push({op: 'update', table: 'vc_vehicles', key: {vehicle_id: v.vehicle_id}, fields: patch, ...versionGuard(vehicle)});
      if (wantsContact) {
        const c = (contacts || []).find(x => x.status === 'ACTIVE' && x.is_primary === true);
        if (!c) throw new Error('CONTACT_NOT_FOUND');
        const changes = {updated_at: at};
        if (delta.contactName !== undefined) changes.display_name = delta.contactName;
        if (delta.contactPhone !== undefined) changes.phone_e164 = delta.contactPhone;
        writes.push({op: 'update', table: 'vc_vehicle_contacts', key: {contact_id: c.contact_id}, fields: changes});
      }
    }
    writes.push({op: 'update', table: 'vc_change_requests', key: {change_id: requestId},
      fields: {status: target, reviewed_by: a.userId, reviewed_at: at}, ...versionGuard(request)});
    writes.push(auditRow({id, at}, a, 'change', requestId, 'CHANGE_' + p.decision));
    await store.writeMany(writes);
    return {requestId, status: p.decision};
  });
}
