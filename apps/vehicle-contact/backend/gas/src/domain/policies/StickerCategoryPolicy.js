// Person type → sticker colour + size (owner 2026-11-26: "สีของสติกเกอร์เป็นไปตามประเภทของผู้เกี่ยวข้องกับรถ" +
// "ควรตั้งค่าได้ทั้งสี และ ประเภทบุคคล"). The list is CONFIGURABLE by a system admin (vc_settings key
// 'sticker_categories', JSON) and starts from the project's proposal (EXECUTIVE_APPROVAL_PROPOSAL_V2 /
// WORKFLOW_SOP_POLICY_REVIEW). Workflow A: the registrant declares the person type → the reviewer
// confirms or changes it at approval (required) → maintenance can change it → the print uses its colour.
// The colour helps people classify; it grants NO right (not a gate or parking pass).
export const STICKER_SETTING_KEY = 'sticker_categories';
export const STICKER_SIZES = Object.freeze([5, 8]);
export const STICKER_CATEGORY_MAX = 20;
const CODE = /^[A-Z][A-Z0-9_]{1,31}$/;
const HEX = /^#[0-9a-f]{6}$/;
const freezeAll = list => Object.freeze(list.map(c => Object.freeze(c)));
export const DEFAULT_STICKER_CATEGORIES = freezeAll([
  {code: 'GENERAL_OFFICER', label: 'พล.ต.ต. ขึ้นไป', colour: 'แดง', hex: '#d71920', size: 8, active: true},
  {code: 'SENIOR_OFFICER', label: 'พ.ต.ต. – พ.ต.อ.', colour: 'น้ำเงิน', hex: '#1f3f99', size: 5, active: true},
  {code: 'JUNIOR_OFFICER', label: 'ร.ต.ต. – ร.ต.อ.', colour: 'เขียว', hex: '#138a3d', size: 5, active: true},
  {code: 'NCO', label: 'ส.ต.ต. – ด.ต.', colour: 'เหลือง', hex: '#f2c200', size: 5, active: true},
  {code: 'CO_RESIDENT', label: 'ผู้พักอาศัยร่วม', colour: 'ม่วง', hex: '#6b2fa3', size: 5, active: true},
  {code: 'PUBLIC', label: 'บุคคลทั่วไป', colour: 'ชมพู', hex: '#e75aa0', size: 5, active: true},
]);
// Legacy map shape (code → entry) of the defaults.
export const STICKER_CATEGORIES = Object.freeze(Object.fromEntries(DEFAULT_STICKER_CATEGORIES.map(({code, active, ...rest}) => [code, Object.freeze(rest)])));

// Text colour on the sticker: black or white, whichever contrasts more with the background (WCAG luminance).
export function stickerInk(hex) {
  const lin = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? '#111111' : '#ffffff';
}

const text = (v, max) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s || s.length > max || /^[=+@-]/.test(s)) throw new Error('INVALID_STICKER_CATEGORIES');
  return s;
};
// Validates a full list (from the settings row or an admin update). Codes are unique; at least one active.
export function parseStickerCategories(raw) {
  let list = raw;
  if (typeof raw === 'string') { try { list = JSON.parse(raw); } catch { throw new Error('INVALID_STICKER_CATEGORIES'); } }
  if (!Array.isArray(list) || !list.length || list.length > STICKER_CATEGORY_MAX) throw new Error('INVALID_STICKER_CATEGORIES');
  const seen = new Set();
  const out = list.map(c => {
    const code = typeof c?.code === 'string' ? c.code.trim().toUpperCase() : '';
    const hex = typeof c?.hex === 'string' ? c.hex.trim().toLowerCase() : '';
    const size = Number(c?.size);
    if (!CODE.test(code) || seen.has(code) || !HEX.test(hex) || !STICKER_SIZES.includes(size) || typeof c.active !== 'boolean')
      throw new Error('INVALID_STICKER_CATEGORIES');
    seen.add(code);
    return {code, label: text(c.label, 60), colour: text(c.colour, 30), hex, size, active: c.active};
  });
  if (!out.some(c => c.active)) throw new Error('INVALID_STICKER_CATEGORIES');
  return freezeAll(out);
}
// The stored list, or the defaults when none has been saved yet.
export function loadStickerCategories(store) {
  const row = store.one('vc_settings', {key: STICKER_SETTING_KEY});
  return row && row.value ? parseStickerCategories(row.value) : DEFAULT_STICKER_CATEGORIES;
}
// A code accepted for a vehicle / registration: well-formed (membership is checked against the live list).
export function stickerCategory(value, list = DEFAULT_STICKER_CATEGORIES) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!list.some(c => c.code === code && c.active)) throw new Error('INVALID_STICKER_CATEGORY');
  return code;
}
// What the UI and the print need for one vehicle (null when no category is set).
export function resolveSticker(code, list) {
  const c = code ? list.find(x => x.code === code) : null;
  return c ? {code: c.code, label: c.label, colour: c.colour, hex: c.hex, ink: stickerInk(c.hex), size: c.size, active: c.active} : null;
}
// Format-only check used inside the vehicle write (the decorator already checked the live list).
export function stickerCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!CODE.test(code)) throw new Error('INVALID_STICKER_CATEGORY');
  return code;
}
