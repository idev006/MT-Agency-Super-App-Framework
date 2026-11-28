// Photo size policy (VC-ADR-049, owner 2026-11-27: "ในการอัพโหลดรูป ควรมีการ resize ก่อนเก็บ และ system admin ควรกำหนดขนาดได้").
// ONE source: the system admin sets it (system.config.update photo_policy), the public form receives it (campaigns.validate)
// so the device resizes to it, and the server checks every uploaded photo against it (photos.upload, photos.replace).
// The server never re-encodes (no image library): the device resizes; the server reads the size from the file header.
export const PHOTO_POLICY_KEY = 'photo_policy';
// VC-ADR-055 (owner 2026-11-28: "ถ้าสามารถกำหนดกฏ ให้ผู้ใช้ต้องถ่ายแนวนอน แนวตั้ง หรือ อนุญาตทั้ง 2 แบบ ก็จะดีมาก ... รูปที่อัพโหลด
// ขึ้นมาต้องมีขนาดไม่เกินเท่าใด ... การประมวลผลรูปจะเกิดที่ FE"): two more rules — orientation (ANY | LANDSCAPE | PORTRAIT;
// a square photo fits both) and minSide (the shorter side at least this many px; 0 = off). Both are optional in a stored or
// sent policy (older rows / clients keep working, with the defaults = no change).
// [min, max] of each numeric field; maxSide / maxBytes / thumbSide / minSide are whole numbers
export const PHOTO_POLICY_LIMITS = Object.freeze({maxSide: [800, 4000], quality: [0.5, 0.95], maxBytes: [100000, 4500000], thumbSide: [160, 640], minSide: [0, 2000]});
export const PHOTO_ORIENTATIONS = Object.freeze(['ANY', 'LANDSCAPE', 'PORTRAIT']);
export const DEFAULT_PHOTO_POLICY = Object.freeze({maxSide: 1600, quality: 0.82, maxBytes: 1500000, thumbSide: 320, minSide: 0, orientation: 'ANY'});
const INTEGERS = new Set(['maxSide', 'maxBytes', 'thumbSide', 'minSide']);
const OPTIONAL = new Set(['minSide', 'orientation']); // VC-ADR-055: absent → the default

// a policy from the admin (object or JSON text) → the checked policy, or INVALID_PHOTO_POLICY
export function parsePhotoPolicy(raw) {
  let v = raw;
  if (typeof raw === 'string') { try { v = JSON.parse(raw); } catch { throw new Error('INVALID_PHOTO_POLICY'); } }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('INVALID_PHOTO_POLICY');
  const keys = Object.keys(PHOTO_POLICY_LIMITS);
  if (Object.keys(v).some(k => !keys.includes(k) && k !== 'orientation')) throw new Error('INVALID_PHOTO_POLICY');
  const out = {};
  for (const k of keys) {
    if (OPTIONAL.has(k) && v[k] === undefined) { out[k] = DEFAULT_PHOTO_POLICY[k]; continue; }
    const n = v[k], [min, max] = PHOTO_POLICY_LIMITS[k];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max || (INTEGERS.has(k) && !Number.isInteger(n))) throw new Error('INVALID_PHOTO_POLICY');
    out[k] = k === 'quality' ? Math.round(n * 100) / 100 : n;
  }
  if (out.thumbSide > out.maxSide || out.minSide > out.maxSide) throw new Error('INVALID_PHOTO_POLICY');
  const o = v.orientation === undefined ? DEFAULT_PHOTO_POLICY.orientation : v.orientation;
  if (!PHOTO_ORIENTATIONS.includes(o)) throw new Error('INVALID_PHOTO_POLICY');
  out.orientation = o;
  return Object.freeze(out);
}
// the stored row → the policy in force (no row, or an unreadable one: the defaults — an upload never breaks on a bad setting)
export function readPhotoPolicy(row) {
  if (!row || !row.value) return DEFAULT_PHOTO_POLICY;
  try { return parsePhotoPolicy(row.value); } catch { return DEFAULT_PHOTO_POLICY; }
}
export const photoPolicyRead = {kind: 'one', name: 'vc_settings', filter: {key: PHOTO_POLICY_KEY}};

// ---- size of an uploaded image from its header (JPEG SOF, PNG IHDR, WebP VP8 / VP8L / VP8X) — pure JS (GAS and Node) ----
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = Object.fromEntries([...B64].map((c, i) => [c, i]));
const HEADER_CHARS = 262144; // the first ~192 KB: device-resized JPEGs carry no large EXIF, so the frame header is near the start
function decodePrefix(base64, chars) {
  const s = base64.slice(0, Math.min(base64.length, chars - (chars % 4)));
  const out = [];
  for (let i = 0; i + 3 < s.length; i += 4) {
    const a = B64_INDEX[s[i]], b = B64_INDEX[s[i + 1]], c = B64_INDEX[s[i + 2]], d = B64_INDEX[s[i + 3]];
    if (a === undefined || b === undefined) break;
    out.push(((a << 2) | (b >> 4)) & 255);
    if (c !== undefined) out.push((((b & 15) << 4) | (c >> 2)) & 255);
    if (d !== undefined) out.push((((c & 3) << 6) | d) & 255);
  }
  return out;
}
const u16be = (b, i) => (b[i] << 8) | b[i + 1], u16le = (b, i) => b[i] | (b[i + 1] << 8);
const u24le = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16), u32be = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
function dimensions(b) {
  if (b[0] === 0xff && b[1] === 0xd8) { // JPEG: walk the markers to the first start-of-frame
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = u16be(b, i + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return {height: u16be(b, i + 5), width: u16be(b, i + 7)};
      i += 2 + len;
    }
    return null;
  }
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b.length >= 24) return {width: u32be(b, 16), height: u32be(b, 20)};
  if (b.length >= 30 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') {
    const kind = String.fromCharCode(...b.slice(12, 16));
    if (kind === 'VP8 ') return {width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff};
    if (kind === 'VP8L') { const x = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return {width: (x & 0x3fff) + 1, height: ((x >>> 14) & 0x3fff) + 1}; }
    if (kind === 'VP8X') return {width: u24le(b, 24) + 1, height: u24le(b, 27) + 1};
  }
  return null;
}
// {bytes, width, height} of a base64 image; width / height 0 when the header cannot be read (the Drive adapter then
// validates the file itself, as before)
export function imageInfo(base64) {
  if (typeof base64 !== 'string') return {bytes: 0, width: 0, height: 0};
  const pad = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const bytes = Math.max(0, Math.floor(base64.length * 3 / 4) - pad);
  const d = dimensions(decodePrefix(base64, HEADER_CHARS));
  return {bytes, width: d ? d.width : 0, height: d ? d.height : 0};
}
// does a width × height photo fit the orientation rule (a square fits both; unknown size is not judged here)
export const fitsOrientation = (width, height, orientation) => !width || !height || orientation === 'ANY' || width === height
  || (orientation === 'LANDSCAPE' ? width > height : height > width);
// the server's check of an uploaded photo against the policy — reads the header only, never decodes or re-encodes:
//   PHOTO_TOO_LARGE           more bytes than maxBytes, or the longest side over maxSide
//   PHOTO_TOO_SMALL           the shorter side under minSide (VC-ADR-055; minSide 0 = off)
//   PHOTO_ORIENTATION_INVALID not the orientation the policy asks for (VC-ADR-055)
// An unreadable header (width / height 0) is judged by bytes only (the Drive adapter validates the file, as before).
export function checkPhotoSize(base64, policy) {
  const {bytes, width, height} = imageInfo(base64);
  if (bytes > policy.maxBytes || Math.max(width, height) > policy.maxSide) throw new Error('PHOTO_TOO_LARGE');
  if (width && height && policy.minSide && Math.min(width, height) < policy.minSide) throw new Error('PHOTO_TOO_SMALL');
  if (!fitsOrientation(width, height, policy.orientation || 'ANY')) throw new Error('PHOTO_ORIENTATION_INVALID');
  return {bytes, width, height};
}
