// Sticker colour + size by the vehicle user's category (owner 2026-11-26: "สีของสติกเกอร์เป็นไปตามประเภทของผู้
// เกี่ยวข้องกับรถ (อ่านจากเอกสารของโครงการ)" + sizes 5×5 and 8×8 cm). Source: EXECUTIVE_APPROVAL_PROPOSAL_V2 §
// "ข้อเสนอการจำแนกสี สติกเกอร์ QR" and WORKFLOW_SOP_POLICY_REVIEW "Policy updates". The colour helps people
// classify; it grants NO right (not a gate or parking pass). Using colour reveals a rank group, so the
// legal/DPO privacy review in those documents is required before real data (#55 gate).
export const STICKER_CATEGORIES = Object.freeze({
  GENERAL_OFFICER: Object.freeze({label: 'พล.ต.ต. ขึ้นไป', colour: 'แดง', hex: '#d71920', size: 8}),
  SENIOR_OFFICER: Object.freeze({label: 'พ.ต.ต. – พ.ต.อ.', colour: 'น้ำเงิน', hex: '#1f3f99', size: 5}),
  JUNIOR_OFFICER: Object.freeze({label: 'ร.ต.ต. – ร.ต.อ.', colour: 'เขียว', hex: '#138a3d', size: 5}),
  NCO: Object.freeze({label: 'ส.ต.ต. – ด.ต.', colour: 'เหลือง', hex: '#f2c200', size: 5}),
  CO_RESIDENT: Object.freeze({label: 'ผู้พักอาศัยร่วม', colour: 'ม่วง', hex: '#6b2fa3', size: 5}),
  PUBLIC: Object.freeze({label: 'บุคคลทั่วไป', colour: 'ชมพู', hex: '#e75aa0', size: 5}),
});
export function stickerCategory(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!Object.prototype.hasOwnProperty.call(STICKER_CATEGORIES, code)) throw new Error('INVALID_STICKER_CATEGORY');
  return code;
}
