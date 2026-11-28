// N1b PR 5 (VC-ADR-051): QR administration as native async use cases on the core — qr.issue / qr.revoke / qr.replace /
// qr.export. Same behaviour as the legacy VehicleOperations.manageQr + QrExportOperation + the sticker decoration of the
// export (StickerCategoryOperations); the legacy acceptance tests run through the core as generated copies.
// On the core: issue / revoke / replace = one read round (vehicle + its ACTIVE QR rows) and ONE commit (revokes + the new
// QR + audit; the QR print-state rule of the core store resets the vehicle to NOT_PRINTED on the new ACTIVE QR); export =
// one read round for every selected vehicle and the person-type list, then one batch of QR_EXPORTED audit rows.
import {qrReason} from '../../../gas/src/domain/policies/QrReasonPolicy.js';
import {QR_EXPORT_MAX} from '../../../gas/src/application/use-cases/QrExportOperation.js';
import {STICKER_SETTING_KEY, stickerCategoriesFrom, resolveSticker} from '../../../gas/src/domain/policies/StickerCategoryPolicy.js';

const need = (v, name, max = 200) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max || /^[=+@]/.test(v.trim())) throw new Error('INVALID_' + name);
  return v.trim();
};
const STATUS = Object.freeze({READY: 'READY', REISSUE: 'REISSUE_NEEDED', NONE: 'NO_ACTIVE_QR', INACTIVE: 'VEHICLE_NOT_ACTIVE', MISSING: 'NOT_FOUND'});
const audit = (id, at, actorId, vehicleId, action) => ({op: 'insert', table: 'vc_change_audit', data: {audit_id: id(), actor_id: actorId,
  entity_type: 'qr', entity_id: vehicleId, action, redacted_summary: action, correlation_id: id().slice(0, 16), created_at: at}});

async function manageQr(mode, p, a, {store, now, id, sha256}) {
  const vehicleId = need(p.vehicleId, 'VEHICLE_ID');
  const why = qrReason(mode, p.reason, p.note); // VC-ADR-036: every QR change carries a reason
  const [vehicle, active] = await store.readMany([
    {kind: 'one', name: 'vc_vehicles', filter: {vehicle_id: vehicleId}},
    {kind: 'list', name: 'vc_qr_tokens', filter: {vehicle_id: vehicleId, status: 'ACTIVE'}}]);
  if (!vehicle || vehicle.status !== 'ACTIVE') throw new Error('VEHICLE_NOT_ACTIVE');
  const rows = (active || []).filter(q => q.status === 'ACTIVE');
  if (rows.length > 1) throw new Error('MULTIPLE_ACTIVE_QR');
  if (mode === 'issue' && rows.length) throw new Error('QR_ALREADY_ACTIVE');
  if (mode === 'revoke' && !rows.length) return {vehicleId, revoked: false};
  const at = now();
  const writes = rows.map(row => ({op: 'update', table: 'vc_qr_tokens', key: {qr_id: row.qr_id},
    fields: {status: 'REVOKED', revoked_at: at, revoked_by: a.userId, revoke_reason: why.reason, revoke_note: why.note}}));
  if (mode === 'revoke') {
    writes.push(audit(id, at, a.userId, vehicleId, 'QR_REVOKED'));
    await store.writeMany(writes);
    return {vehicleId, revoked: true};
  }
  const token = id(), qrId = id();
  writes.push({op: 'insert', table: 'vc_qr_tokens', data: {qr_id: qrId, vehicle_id: vehicleId, token_digest: sha256(token), qr_token: token,
    issued_at: at, revoked_at: '', issued_by: a.userId, reason: why.reason, issue_note: why.note,
    replaces_qr_id: mode === 'replace' && rows[0] ? rows[0].qr_id : '', status: 'ACTIVE'}});
  writes.push(audit(id, at, a.userId, vehicleId, mode === 'replace' ? 'QR_REPLACED' : 'QR_ISSUED'));
  await store.writeMany(writes);
  return {vehicleId, qrId, token};
}
export const qrIssue = (p, a, deps) => manageQr('issue', p, a, deps);
export const qrRevoke = (p, a, deps) => manageQr('revoke', p, a, deps);
export const qrReplace = (p, a, deps) => manageQr('replace', p, a, deps);

// qr.export (S5 / VC-ADR-032 B): the ACTIVE code of each selected vehicle (max 100) + its resolved sticker; a QR issued
// before 0.9.30 has only its digest → REISSUE_NEEDED (never guessed); every returned code → one QR_EXPORTED audit row
export async function qrExport(p, a, {store, now, id}) {
  const raw = p.vehicleIds;
  if (!Array.isArray(raw) || !raw.length || raw.length > QR_EXPORT_MAX) throw new Error('INVALID_VEHICLE_IDS');
  const ids = [...new Set(raw.map(v => need(v, 'VEHICLE_ID')))];
  const rows = await store.readMany([{kind: 'one', name: 'vc_settings', filter: {key: STICKER_SETTING_KEY}},
    ...ids.flatMap(v => [{kind: 'one', name: 'vc_vehicles', filter: {vehicle_id: v}},
      {kind: 'list', name: 'vc_qr_tokens', filter: {vehicle_id: v, status: 'ACTIVE'}}])]);
  const stickers = stickerCategoriesFrom(rows[0]);
  const items = ids.map((vehicleId, i) => {
    const v = rows[1 + 2 * i], qrs = rows[2 + 2 * i] || [];
    if (!v) return {vehicleId, status: STATUS.MISSING};
    const base = {vehicleId, plate: v.plate_normalized || '', province: v.province_code || '', vehicleType: v.vehicle_type || '',
      brand: v.make || '', model: v.model || '', color: v.color || '', stickerCategory: v.sticker_category || ''};
    if (v.status !== 'ACTIVE') return {...base, status: STATUS.INACTIVE};
    if (qrs.length !== 1) return {...base, status: STATUS.NONE};
    const q = qrs[0], token = typeof q.qr_token === 'string' && /^[a-f0-9]{64}$/.test(q.qr_token) ? q.qr_token : '';
    return {...base, status: token ? STATUS.READY : STATUS.REISSUE, qrId: q.qr_id, issuedAt: q.issued_at || '', ...(token ? {token} : {})};
  });
  const ready = items.filter(x => x.status === STATUS.READY);
  if (ready.length) { const at = now(); await store.writeMany(ready.map(x => audit(id, at, a.userId, x.vehicleId, 'QR_EXPORTED'))); }
  return {items: items.map(x => ({...x, sticker: resolveSticker(x.stickerCategory, stickers)})), exportedAt: now(), ready: ready.length};
}
