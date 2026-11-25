// VC-ADR-036 (owner 2026-11-25): QR is issued/replaced/revoked by admins only, always with a reason,
// and every change is kept as history (vc_qr_tokens rows + who/why). OTHER requires a short note.
export const QR_REASONS=Object.freeze({
 issue:Object.freeze(['NEW','LOST','DAMAGED','STOLEN','OTHER']),
 replace:Object.freeze(['LOST','DAMAGED','STOLEN','OTHER']),
 revoke:Object.freeze(['LOST','STOLEN','VEHICLE_SOLD','ADMIN_REVOKE','OTHER'])
});
// System-recorded reasons (never accepted from a client).
export const QR_SYSTEM_REASONS=Object.freeze({approval:'REGISTRATION_APPROVED',cancel:'VEHICLE_CANCELLED'});
export function qrReason(mode,reason,note){
 const allowed=QR_REASONS[mode];
 if(!allowed||typeof reason!=='string'||!allowed.includes(reason))throw new Error('INVALID_QR_REASON');
 const text=note===undefined||note===null?'':String(note).trim();
 if(text.length>200)throw new Error('INVALID_QR_REASON');
 if(reason==='OTHER'&&!text)throw new Error('INVALID_QR_REASON');
 return {reason,note:text};
}
