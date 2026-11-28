// VC-ADR-055 photo rules (owner 2026-11-28: "ถ้าสามารถกำหนดกฏ ให้ผู้ใช้ต้องถ่ายแนวนอน แนวตั้ง หรือ อนุญาตทั้ง2 แบบ ก็จะดีมาก
// ... รูปที่อัพโหลดขึ้นมาต้องมีขนาดไม่เกินเท่าใด ... การประมวลผลรูปจะเกิดที่ FE"). The system admin sets them; the device applies
// them (resize, quality, size, orientation); the server re-checks the file header (backend/gas/src/domain/policies/PhotoPolicy.js).
// The limits and defaults below mirror the server's; tests/photo-policy.test.js fails if they drift apart.
export const PHOTO_POLICY_LIMITS = Object.freeze({ maxSide: [800, 4000], quality: [0.5, 0.95], maxBytes: [100000, 4500000], thumbSide: [160, 640], minSide: [0, 2000] })
export const PHOTO_ORIENTATIONS = Object.freeze(['ANY', 'LANDSCAPE', 'PORTRAIT'])
export const DEFAULT_PHOTO_POLICY = Object.freeze({ maxSide: 1600, quality: 0.82, maxBytes: 1500000, thumbSide: 320, minSide: 0, orientation: 'ANY' })
const INTEGERS = new Set(['maxSide', 'maxBytes', 'thumbSide', 'minSide'])

export const ORIENTATION_LABELS = Object.freeze({ ANY: 'แนวนอนหรือแนวตั้งก็ได้', LANDSCAPE: 'แนวนอนเท่านั้น', PORTRAIT: 'แนวตั้งเท่านั้น' })

// One field within its limits?
export function validPhotoField(key, value) {
  if (key === 'orientation') return PHOTO_ORIENTATIONS.includes(value)
  const range = PHOTO_POLICY_LIMITS[key]
  return Boolean(range) && typeof value === 'number' && Number.isFinite(value) && value >= range[0] && value <= range[1]
    && (!INTEGERS.has(key) || Number.isInteger(value))
}
// A whole policy the server would accept (same cross-field rules)
export function validPhotoPolicy(p) {
  return Boolean(p) && Object.keys(DEFAULT_PHOTO_POLICY).every((k) => validPhotoField(k, p[k])) && p.thumbSide <= p.maxSide && p.minSide <= p.maxSide
}

// Server value → a frozen policy; null when absent / not a policy (older backend). Missing newer fields → their defaults.
export function toPhotoPolicy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const p = { ...DEFAULT_PHOTO_POLICY }
  for (const k of Object.keys(DEFAULT_PHOTO_POLICY)) if (value[k] !== undefined) p[k] = value[k]
  return validPhotoPolicy(p) ? Object.freeze(p) : null
}
// The rules the device applies: the server's, else the defaults (an upload never breaks on a missing policy)
export const photoPolicyOrDefault = (value) => toPhotoPolicy(value) || DEFAULT_PHOTO_POLICY

// Orientation of a width × height photo against the rule (a square fits both)
export const fitsOrientation = (width, height, orientation) => orientation === 'ANY' || width === height
  || (orientation === 'LANDSCAPE' ? width > height : height > width)

// The size the device resizes to: the longest side down to maxSide, never up. Null when the result would break minSide.
export function targetSize(width, height, policy) {
  const scale = Math.min(1, policy.maxSide / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale))
  return Math.min(w, h) < (policy.minSide || 0) ? null : { width: w, height: h }
}

// What is wrong with a decoded photo before any upload: '' | PHOTO_ORIENTATION_INVALID | PHOTO_TOO_SMALL
export function photoShapeProblem(width, height, policy) {
  if (!fitsOrientation(width, height, policy.orientation)) return 'PHOTO_ORIENTATION_INVALID'
  if (!targetSize(width, height, policy)) return 'PHOTO_TOO_SMALL'
  return ''
}

// Thai message for a photo problem (device or server code)
export function photoProblemText(code, policy = DEFAULT_PHOTO_POLICY) {
  if (code === 'PHOTO_ORIENTATION_INVALID') return policy.orientation === 'PORTRAIT' ? 'ต้องถ่ายแนวตั้ง กรุณาถือโทรศัพท์แนวตั้งแล้วถ่ายใหม่' : 'ต้องถ่ายแนวนอน กรุณาหมุนโทรศัพท์เป็นแนวนอนแล้วถ่ายใหม่'
  if (code === 'PHOTO_TOO_SMALL') return `รูปเล็กเกินไป ด้านสั้นต้องไม่น้อยกว่า ${policy.minSide} px กรุณาถ่ายใหม่ให้เห็นรถเต็มภาพ`
  if (code === 'PHOTO_TOO_LARGE') return `รูปใหญ่เกินกำหนด (ไม่เกิน ${(policy.maxBytes / 1000000).toLocaleString('th-TH', { maximumFractionDigits: 1 })} MB) กรุณาเลือกรูปอื่นหรือถ่ายใหม่`
  if (code === 'INVALID_MEDIA') return 'เปิดรูปนี้ไม่ได้ กรุณาถ่ายใหม่หรือเลือกรูป JPEG/PNG/WebP'
  return ''
}
