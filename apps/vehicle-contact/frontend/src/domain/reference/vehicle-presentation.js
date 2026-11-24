// R3: shared presentation of vehicle facts (photo slots, phone numbers) for the vehicle card.
export const PHOTO_SLOT_LABELS = Object.freeze({
  FRONT: 'ด้านหน้า', REAR: 'ด้านหลัง', LEFT: 'ด้านซ้าย', RIGHT: 'ด้านขวา', FRONT_ANGLE: 'มุมเฉียงหน้า',
})

export function photoSlotLabel(slot) {
  return PHOTO_SLOT_LABELS[slot] || 'ไม่ระบุตำแหน่ง'
}

// Stored as E.164 (+66XXXXXXXXX). Thai readers expect the national form 0XX-XXX-XXXX.
export function formatThaiPhone(e164) {
  const value = String(e164 || '').trim()
  const match = /^\+66(\d{8,9})$/.exec(value)
  if (!match) return value
  const national = `0${match[1]}`
  return national.length === 10
    ? `${national.slice(0, 3)}-${national.slice(3, 6)}-${national.slice(6)}`
    : `${national.slice(0, 2)}-${national.slice(2, 5)}-${national.slice(5)}`
}

// Only a well-formed E.164 number becomes a tap-to-call link.
export function telHref(e164) {
  const value = String(e164 || '').trim()
  return /^\+\d{8,15}$/.test(value) ? `tel:${value}` : ''
}

// Primary contact first, then the original order.
export function orderContacts(contacts = []) {
  return [...contacts].sort((a, b) => Number(b.isPrimary === true) - Number(a.isPrimary === true))
}
