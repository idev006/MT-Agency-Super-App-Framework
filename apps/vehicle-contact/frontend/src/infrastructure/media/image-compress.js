// Owner (live, phone): "ไม่สามารถลงทะเบียนรถได้ / ระบบช้ามาก". Phone photos are 3–6 MB; sent raw they
// hit the 5 MB / Worker body limits and each took many seconds through GAS. Every evidence photo is
// now resized on the device (longest side 1600 px, JPEG ~0.82, EXIF orientation applied) before it
// is base64-encoded: typically 150–400 KB, i.e. 10–20× less to send.
export const MAX_SOURCE_BYTES = 25_000_000
export const MAX_UPLOAD_BYTES = 4_500_000 // stays under backend 5 MB and Worker 7 M-char base64 limits
const MAX_SIDE = 1600
const QUALITY = 0.82
const PASSTHROUGH_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function sourceImageProblem(file) {
  if (!file) return 'ยังไม่ได้เลือกภาพ'
  if (!/^image\//.test(file.type || '')) return 'ไฟล์นี้ไม่ใช่รูปภาพ'
  if (file.size < 1 || file.size > MAX_SOURCE_BYTES) return 'ไฟล์ใหญ่เกิน 25 MB'
  return ''
}

function toBase64(bytes) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
  return btoa(binary)
}

async function decode(file) {
  if (typeof document === 'undefined') throw new Error('no DOM')
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* fall back */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally { URL.revokeObjectURL(url) }
}

// Returns { base64Image, mimeType, bytes, width, height }. Throws INVALID_MEDIA if the browser
// cannot decode the file or the result is still too large.
export async function compressForUpload(file, { maxSide = MAX_SIDE, quality = QUALITY } = {}) {
  if (sourceImageProblem(file)) throw Object.assign(new Error('invalid image'), { code: 'INVALID_MEDIA' })
  let image
  try { image = await decode(file) } catch {
    // Cannot decode here (rare browser / format): send the original if it is already acceptable.
    if (PASSTHROUGH_MIME.has(file.type) && file.size <= MAX_UPLOAD_BYTES) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      return { base64Image: toBase64(bytes), mimeType: file.type, bytes: bytes.length, width: 0, height: 0, compressed: false }
    }
    throw Object.assign(new Error('decode failed'), { code: 'INVALID_MEDIA' })
  }
  const w0 = image.width, h0 = image.height
  const scale = Math.min(1, maxSide / Math.max(w0, h0))
  const width = Math.max(1, Math.round(w0 * scale)), height = Math.max(1, Math.round(h0 * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  canvas.getContext('2d').drawImage(image, 0, 0, width, height)
  image.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob || blob.size > MAX_UPLOAD_BYTES) throw Object.assign(new Error('still too large'), { code: 'INVALID_MEDIA' })
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return { base64Image: toBase64(bytes), mimeType: 'image/jpeg', bytes: bytes.length, width, height, compressed: true }
}
