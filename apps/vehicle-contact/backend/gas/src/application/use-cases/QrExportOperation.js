// S5 / VC-ADR-032 (B) (owner 2026-11-25: "admin ควรเห็น QR ของรถแต่ละคันได้อย่างสะดวก" + "หน้าที่ผู้ใช้สามารถ
// สั่ง export qr ของรถที่เลือกได้ เพื่อนำไปให้โรงพิมพ์ จัดพิมพ์"). Returns the ACTIVE QR code of each
// selected vehicle so admins (qr.manage) can show and print it. The code is stored at issue since 0.9.30;
// a QR issued before that has only its digest and is reported REISSUE_NEEDED (never guessed).
// Every vehicle whose code is returned gets a QR_EXPORTED audit row (who exported which vehicle, when).
export const QR_EXPORT_MAX = 100;
const STATUS = Object.freeze({READY: 'READY', REISSUE: 'REISSUE_NEEDED', NONE: 'NO_ACTIVE_QR', INACTIVE: 'VEHICLE_NOT_ACTIVE', MISSING: 'NOT_FOUND'});

export function createQrExport({store, need, id, now}) {
  const readAll = reqs => (typeof store.readMany === 'function' ? store.readMany(reqs)
    : reqs.map(r => (r.kind === 'one' ? store.one(r.name, r.filter) : store.list(r.name, r.filter))));
  return function qrExport(p, a) {
    const raw = p.vehicleIds;
    if (!Array.isArray(raw) || !raw.length || raw.length > QR_EXPORT_MAX) throw new Error('INVALID_VEHICLE_IDS');
    const ids = [...new Set(raw.map(v => need(v, 'VEHICLE_ID')))];
    // ONE parallel round: each vehicle + its ACTIVE QR rows.
    const rows = readAll(ids.flatMap(v => [{kind: 'one', name: 'vc_vehicles', filter: {vehicle_id: v}},
      {kind: 'list', name: 'vc_qr_tokens', filter: {vehicle_id: v, status: 'ACTIVE'}}]));
    const items = ids.map((vehicleId, i) => {
      const v = rows[2 * i], qrs = rows[2 * i + 1] || [];
      if (!v) return {vehicleId, status: STATUS.MISSING};
      const base = {vehicleId, plate: v.plate_normalized || '', province: v.province_code || '', vehicleType: v.vehicle_type || '',
        brand: v.make || '', model: v.model || '', color: v.color || ''};
      if (v.status !== 'ACTIVE') return {...base, status: STATUS.INACTIVE};
      if (qrs.length !== 1) return {...base, status: STATUS.NONE};
      const q = qrs[0], token = typeof q.qr_token === 'string' && /^[a-f0-9]{64}$/.test(q.qr_token) ? q.qr_token : '';
      return {...base, status: token ? STATUS.READY : STATUS.REISSUE, qrId: q.qr_id, issuedAt: q.issued_at || '', ...(token ? {token} : {})};
    });
    const ready = items.filter(x => x.status === STATUS.READY);
    if (ready.length) {
      const at = now();
      const audits = ready.map(x => ({op: 'insert', table: 'vc_change_audit', data: {audit_id: id(), actor_id: a.userId, entity_type: 'qr',
        entity_id: x.vehicleId, action: 'QR_EXPORTED', redacted_summary: 'QR_EXPORTED', correlation_id: id().slice(0, 16), created_at: at}}));
      if (typeof store.writeMany === 'function') store.writeMany(audits);
      else for (const w of audits) store.insert(w.table, w.data);
    }
    return {items, exportedAt: now(), ready: ready.length};
  };
}
