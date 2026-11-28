// Every evidence photo is processed on the device before upload (owner: Cloud Run does no image work). Since VC-ADR-055 the
// device follows the system admin's photo rules (domain/media/photo-policy.js): longest side ≤ maxSide, the orientation rule,
// shorter side ≥ minSide, JPEG at the policy quality, stepping the quality (then the size) down until the file is ≤ maxBytes.
// Fixed, not settable: EXIF orientation is applied (pixels upright) and every EXIF field — GPS included — is dropped by
// re-encoding; nothing is cropped. A file the browser cannot open is refused (the raw file is never sent: it kept EXIF).
// Owner (live, phone) earlier: phone photos are 3–6 MB; resized they are typically 150–400 KB.
import { DEFAULT_PHOTO_POLICY, photoShapeProblem, targetSize } from '../../domain/media/photo-policy.js'

export const MAX_SOURCE_BYTES = 25_000_000
const MIN_QUALITY = 0.5, QUALITY_STEP = 0.08, SIZE_STEP = 0.85, MIN_ENCODED_SIDE = 320, MAX_ATTEMPTS = 14

export function sourceImageProblem(file) {
  if (!file) return 'ยังไม่ได้เลือกภาพ'
  if (!/^image\//.test(file.type || '')) return 'ไฟล์นี้ไม่ใช่รูปภาพ'
  if (file.size < 1 || file.size > MAX_SOURCE_BYTES) return 'ไฟล์ใหญ่เกิน 25 MB'
  return ''
}

const fail = (code) => Object.assign(new Error(code), { code })

function toBase64(bytes) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
  return btoa(binary)
}

// The browser codec: decode with EXIF orientation applied; encode a JPEG of the given size and quality.
export const browserCodec = Object.freeze({
  async decode(file) {
    if (typeof document === 'undefined') throw fail('INVALID_MEDIA')
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* fall back to <img>, which also applies EXIF */ }
    }
    const url = URL.createObjectURL(file)
    try { const img = new Image(); img.src = url; await img.decode(); return img } finally { URL.revokeObjectURL(url) }
  },
  async encode(image, width, height, quality) {
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    canvas.getContext('2d').drawImage(image, 0, 0, width, height)
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  },
})

async function decoded(file, codec) {
  if (sourceImageProblem(file)) throw fail('INVALID_MEDIA')
  try { return await codec.decode(file) } catch { throw fail('INVALID_MEDIA') }
}

// At pick time: '' when the photo fits the rules, else the problem code (the page shows photoProblemText).
export async function inspectPhoto(file, policy = DEFAULT_PHOTO_POLICY, codec = browserCodec) {
  let image
  try { image = await decoded(file, codec) } catch (e) { return e.code || 'INVALID_MEDIA' }
  try { return photoShapeProblem(image.width, image.height, policy) } finally { image.close?.() }
}

// Returns { base64Image, mimeType, bytes, width, height }. Throws {code}: INVALID_MEDIA | PHOTO_ORIENTATION_INVALID |
// PHOTO_TOO_SMALL | PHOTO_TOO_LARGE (could not reach maxBytes without breaking minSide).
export async function compressForUpload(file, policy = DEFAULT_PHOTO_POLICY, codec = browserCodec) {
  const image = await decoded(file, codec)
  try {
    const problem = photoShapeProblem(image.width, image.height, policy)
    if (problem) throw fail(problem)
    let { width, height } = targetSize(image.width, image.height, policy)
    let quality = policy.quality
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const blob = await codec.encode(image, width, height, quality)
      if (!blob) throw fail('INVALID_MEDIA')
      if (blob.size <= policy.maxBytes) {
        const bytes = new Uint8Array(await blob.arrayBuffer())
        return { base64Image: toBase64(bytes), mimeType: 'image/jpeg', bytes: bytes.length, width, height, quality }
      }
      if (quality - QUALITY_STEP >= MIN_QUALITY - 1e-9) { quality = Math.round((quality - QUALITY_STEP) * 100) / 100; continue }
      const w = Math.round(width * SIZE_STEP), h = Math.round(height * SIZE_STEP)
      if (Math.min(w, h) < Math.max(policy.minSide || 0, MIN_ENCODED_SIDE)) break
      width = w; height = h
    }
    throw fail('PHOTO_TOO_LARGE')
  } finally { image.close?.() }
}
