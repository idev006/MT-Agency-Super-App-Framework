// VC-ADR-036 S3 (owner 2026-11-25: "ต้องมีการเก็บประวัติการขอ QR ของรถแต่ละคัน"): the full QR history of one
// vehicle, newest first, with who/why/chain. Reads vc_qr_tokens + display names; never returns a token or digest.
export function createQrHistory({store,need}){
 return function qrHistory(p){
  const vehicleId=need(p.vehicleId,'VEHICLE_ID');
  if(!store.one('vc_vehicles',{vehicle_id:vehicleId}))throw new Error('NOT_FOUND');
  const rows=store.list('vc_qr_tokens',{vehicle_id:vehicleId});
  const names=new Map();
  for(const uid of new Set(rows.flatMap(r=>[r.issued_by,r.revoked_by]).filter(Boolean)))
   names.set(uid,(store.one('vc_users',{user_id:uid})||{}).display_name||'');
  const items=rows.map((r,i)=>({order:i,qrId:r.qr_id,status:r.status,issuedAt:r.issued_at||'',issuedBy:r.issued_by||'',issuedByName:names.get(r.issued_by)||'',
   reason:r.reason||'',note:r.issue_note||'',replacesQrId:r.replaces_qr_id||'',revokedAt:r.revoked_at||'',revokedBy:r.revoked_by||'',
   revokedByName:names.get(r.revoked_by)||'',revokeReason:r.revoke_reason||'',revokeNote:r.revoke_note||''}))
   // newest first; same timestamp -> later insertion (stored order) first
   .sort((x,y)=>String(y.issuedAt).localeCompare(String(x.issuedAt))||y.order-x.order)
   .map(({order,...item})=>item);
  return {vehicleId,items};
 };
}
