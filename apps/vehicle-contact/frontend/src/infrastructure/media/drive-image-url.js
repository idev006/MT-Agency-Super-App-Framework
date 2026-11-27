// VC-ADR-050 PR B: evidence photos are loaded straight from Google Drive by link (owner: "รูปรถไม่ใช่ความลับ"). Only links of
// this exact shape are ever put in an <img src> — the server's rule (backend/gas/src/domain/policies/PhotoLayout.js
// DRIVE_IMAGE_URL); drive-image-url.test.js fails if the two differ.
export const DRIVE_IMAGE_URL = /^https:\/\/drive\.google\.com\/thumbnail\?id=[A-Za-z0-9_-]{10,200}&sz=w[0-9]{2,4}$/

export function safeDriveImageUrl(value) {
  return typeof value === 'string' && DRIVE_IMAGE_URL.test(value) ? value : ''
}
