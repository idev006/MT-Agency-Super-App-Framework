// VC-ADR-036 S3: mirrors backend/gas/src/domain/policies/QrReasonPolicy.js (drift-tested).
export const QR_REASONS = Object.freeze({
  issue: Object.freeze(['NEW', 'LOST', 'DAMAGED', 'STOLEN', 'OTHER']),
  replace: Object.freeze(['LOST', 'DAMAGED', 'STOLEN', 'OTHER']),
  revoke: Object.freeze(['LOST', 'STOLEN', 'VEHICLE_SOLD', 'ADMIN_REVOKE', 'OTHER']),
})
export const QR_REASON_LABELS = Object.freeze({
  NEW: 'ออก QR ให้รถที่ยังไม่มี', LOST: 'สูญหาย', DAMAGED: 'ชำรุด / อ่านไม่ได้', STOLEN: 'ถูกขโมย / ถูกนำไปใช้',
  VEHICLE_SOLD: 'ขายรถ / เปลี่ยนเจ้าของ', ADMIN_REVOKE: 'ผู้ดูแลระบบเพิกถอน', OTHER: 'อื่น ๆ (ระบุ)',
  REGISTRATION_APPROVED: 'ออกเมื่ออนุมัติการลงทะเบียน', VEHICLE_CANCELLED: 'ยกเลิกยานพาหนะ',
})
export const qrReasonLabel = (code) => QR_REASON_LABELS[code] || code || '—'
export function qrReasonProblem(mode, reason, note) {
  if (!QR_REASONS[mode]?.includes(reason)) return 'เลือกเหตุผล'
  const text = String(note || '').trim()
  if (text.length > 200) return 'หมายเหตุยาวเกิน 200 ตัวอักษร'
  if (reason === 'OTHER' && !text) return 'ระบุเหตุผลเพิ่มเติม'
  return ''
}
