// Person type → sticker colour + size. The live list is configurable by a system admin (backend
// StickerCategoryPolicy, VC-ADR-038) and comes with each vehicle as `sticker`. These defaults mirror the
// backend defaults (drift-tested) and are only a fallback for data from an older backend.
// The colour helps classify; it grants no right. Sizes are the two print sizes: 5 × 5 cm and 8 × 8 cm.
export const DEFAULT_STICKER_CATEGORIES = Object.freeze([
  { code: 'GENERAL_OFFICER', label: 'พล.ต.ต. ขึ้นไป', colour: 'แดง', hex: '#d71920', size: 8, active: true },
  { code: 'SENIOR_OFFICER', label: 'พ.ต.ต. – พ.ต.อ.', colour: 'น้ำเงิน', hex: '#1f3f99', size: 5, active: true },
  { code: 'JUNIOR_OFFICER', label: 'ร.ต.ต. – ร.ต.อ.', colour: 'เขียว', hex: '#138a3d', size: 5, active: true },
  { code: 'NCO', label: 'ส.ต.ต. – ด.ต.', colour: 'เหลือง', hex: '#f2c200', size: 5, active: true },
  { code: 'CO_RESIDENT', label: 'ผู้พักอาศัยร่วม', colour: 'ม่วง', hex: '#6b2fa3', size: 5, active: true },
  { code: 'PUBLIC', label: 'บุคคลทั่วไป', colour: 'ชมพู', hex: '#e75aa0', size: 5, active: true },
].map((c) => Object.freeze(c)))
export const STICKER_CATEGORIES = Object.freeze(Object.fromEntries(DEFAULT_STICKER_CATEGORIES.map(({ code, active, ...rest }) => [code, Object.freeze(rest)])))
export const STICKER_SIZES = Object.freeze([5, 8])
export const STICKER_CODE = /^[A-Z][A-Z0-9_]{1,31}$/
export const STICKER_HEX = /^#[0-9a-f]{6}$/

// Black or white text, whichever contrasts more with the colour (same rule as the backend).
export function stickerInk(hex) {
  if (!STICKER_HEX.test(String(hex || '').toLowerCase())) return '#ffffff'
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255))
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? '#111111' : '#ffffff'
}
// One sticker from the API ({code,label,colour,hex,ink,size,active}) or null when malformed / absent.
export function toSticker(value) {
  if (!value || typeof value !== 'object') return null
  const code = typeof value.code === 'string' ? value.code : ''
  const hex = typeof value.hex === 'string' ? value.hex.toLowerCase() : ''
  const size = Number(value.size)
  if (!STICKER_CODE.test(code) || !STICKER_HEX.test(hex) || !STICKER_SIZES.includes(size)) return null
  return Object.freeze({ code, label: String(value.label || code), colour: String(value.colour || ''), hex, size,
    ink: STICKER_HEX.test(String(value.ink || '')) ? value.ink : stickerInk(hex), active: value.active !== false })
}
export const toStickerList = (value) => (Array.isArray(value) ? value.map(toSticker).filter(Boolean) : [])
// The sticker of a code in a list (defaults when no list is given).
export const stickerOf = (code, list = DEFAULT_STICKER_CATEGORIES) => toSticker(list.find((c) => c.code === code))
export const stickerText = (s) => (s ? `${s.colour} · ${s.label} · ${s.size}×${s.size} ซม.` : 'ยังไม่กำหนด')
// legacy helpers (code → default list)
export const stickerCategoryOf = (code) => stickerOf(code)
export const stickerCategoryText = (code) => stickerText(stickerOf(code))
export const bandTextColour = (code) => stickerInk(STICKER_CATEGORIES[code]?.hex)
