// Sticker colour + size by the vehicle user's category — mirror of the backend StickerCategoryPolicy
// (drift-tested). Source: EXECUTIVE_APPROVAL_PROPOSAL_V2 / WORKFLOW_SOP_POLICY_REVIEW. The colour helps
// classify; it grants no right. Sizes are the two print sizes: 5 × 5 cm and 8 × 8 cm.
export const STICKER_CATEGORIES = Object.freeze({
  GENERAL_OFFICER: Object.freeze({ label: 'พล.ต.ต. ขึ้นไป', colour: 'แดง', hex: '#d71920', size: 8 }),
  SENIOR_OFFICER: Object.freeze({ label: 'พ.ต.ต. – พ.ต.อ.', colour: 'น้ำเงิน', hex: '#1f3f99', size: 5 }),
  JUNIOR_OFFICER: Object.freeze({ label: 'ร.ต.ต. – ร.ต.อ.', colour: 'เขียว', hex: '#138a3d', size: 5 }),
  NCO: Object.freeze({ label: 'ส.ต.ต. – ด.ต.', colour: 'เหลือง', hex: '#f2c200', size: 5 }),
  CO_RESIDENT: Object.freeze({ label: 'ผู้พักอาศัยร่วม', colour: 'ม่วง', hex: '#6b2fa3', size: 5 }),
  PUBLIC: Object.freeze({ label: 'บุคคลทั่วไป', colour: 'ชมพู', hex: '#e75aa0', size: 5 }),
})
export const STICKER_SIZES = Object.freeze([5, 8])
export const stickerCategoryOf = (code) => STICKER_CATEGORIES[code] || null
export const stickerCategoryText = (code) => { const c = stickerCategoryOf(code); return c ? `${c.colour} · ${c.label}` : 'ยังไม่กำหนด' }
// Text on a dark/light band: yellow needs dark text, the rest white.
export const bandTextColour = (code) => (code === 'NCO' ? '#111111' : '#ffffff')
