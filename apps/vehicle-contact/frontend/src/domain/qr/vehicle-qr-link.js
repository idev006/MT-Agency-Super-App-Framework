// VC-ADR-032 (A): the vehicle QR holds a LINK to this app, `<app>#/q/<code>`. The code travels in the
// hash fragment, which browsers never send to a server or in a Referer header. A phone camera opens the
// link; a signed-out visitor sees only the sign-in page (no API call, nothing about the vehicle), and an
// officer with vehicle.lookup sees the vehicle after signing in. The in-app scanner accepts the same
// link (only for THIS app's address) or the bare 64-character code printed on older test stickers.
export const VEHICLE_QR_CODE = /^[a-f0-9]{64}$/i

export function appBaseUrl(location = globalThis.location) {
  return location ? `${location.origin}${location.pathname}` : ''
}

export function vehicleQrLink(code, location = globalThis.location) {
  if (!VEHICLE_QR_CODE.test(String(code || ''))) return ''
  return `${appBaseUrl(location)}#/q/${String(code).toLowerCase()}`
}

// What a scan may resolve: the bare code, or exactly this app's /q/ link. Anything else → ''.
export function codeFromScan(text, location = globalThis.location) {
  const value = String(text || '').trim()
  if (VEHICLE_QR_CODE.test(value)) return value.toLowerCase()
  const prefix = `${appBaseUrl(location)}#/q/`
  if (!prefix.startsWith('http') || !value.startsWith(prefix)) return ''
  const code = value.slice(prefix.length)
  return VEHICLE_QR_CODE.test(code) ? code.toLowerCase() : ''
}

// Short code printed under the QR (for a human check against the record; never enough to look up).
export const stickerShortCode = (qrId) => String(qrId || '').slice(0, 8).toUpperCase()
