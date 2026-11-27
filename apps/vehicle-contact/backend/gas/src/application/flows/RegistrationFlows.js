// Public registration path — ONE source for both engines (VC-ADR-046 phase 3 wave 2a). Rules moved unchanged from
// AdministrationOperations (getCampaign, campaigns.validate), ReferenceOperations (reference lists, enforcement mode, version,
// assertRegistration), MediaRetentionOperations (photos.upload) and the sticker decorators of StickerCategoryOperations
// (campaigns.validate / references.registration) — the person-type list is read in the SAME round as the main rows.
// deps: {now() → ISO, id() → 64 hex, sha256(text) → hex}. Effects: reads, insert, mediaUpload, mediaTrash, memoGet, memoPut.
import {STICKER_SETTING_KEY, DEFAULT_STICKER_CATEGORIES, parseStickerCategories, stickerInk} from '../../domain/policies/StickerCategoryPolicy.js';
import {PHOTO_SLOTS} from '../../domain/policies/VehicleLifecycle.js'; // the ONE list of photo slots

const stickerRead = {kind: 'one', name: 'vc_settings', filter: {key: STICKER_SETTING_KEY}};
const stickerList = row => (row && row.value ? parseStickerCategories(row.value) : DEFAULT_STICKER_CATEGORIES);
const withInk = l => l.map(c => ({...c, ink: stickerInk(c.hex)}));

// ---- campaign (the public registration code) ----
export function campaignRead(token, deps) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) throw new Error('CAMPAIGN_INVALID');
  return {kind: 'one', name: 'vc_campaigns', filter: {token_digest: deps.sha256(token.toLowerCase())}};
}
export function checkCampaign(row, deps, {requireCapacity = true} = {}) {
  const now = Date.parse(deps.now());
  if (!row || row.status !== 'ACTIVE' || row.revoked_at || Date.parse(row.starts_at) > now || Date.parse(row.ends_at) <= now
    || requireCapacity && Number(row.submitted_count) >= Number(row.max_submissions)) throw new Error('CAMPAIGN_INVALID');
  return row;
}
export function* getCampaignFlow(token, options, deps) {
  const [row] = yield {reads: [campaignRead(token, deps)]};
  return checkCampaign(row, deps, options);
}
// campaigns.validate: valid + the ACTIVE person types the public form offers
export function* campaignValidateFlow(p, deps) {
  const [row, stickerRow] = yield {reads: [campaignRead(p.campaignToken, deps), stickerRead]};
  const campaign = checkCampaign(row, deps);
  return {valid: true, campaignId: campaign.campaign_id,
    stickerCategories: withInk(stickerList(stickerRow)).filter(c => c.active).map(({code, label}) => ({code, label}))};
}

// ---- reference lists (TUNEUP R2: the 645 reference rows change only through the seed installer → a process memo; the
// organizations + the enforcement setting stay live: an org disabled now is refused now) ----
const CATALOGS = Object.freeze({PROVINCE: 'provinces', PLATE_TYPE: 'plateTypes', VEHICLE_TYPE: 'vehicleTypes', RELATIONSHIP: 'relationships',
  BRAND: 'brands', MODEL: 'models', COLOR: 'colors'});
const STRICT = Object.freeze({province: 'PROVINCE', plateType: 'PLATE_TYPE', vehicleType: 'VEHICLE_TYPE', relationship: 'RELATIONSHIP'});
const MAX_ROWS = 5000;
const clean = (value, max = 120) => {
  const out = typeof value === 'string' ? value.trim() : '';
  if (!out || out.length > max || /^[=+@-]/.test(out)) throw new Error('REFERENCE_DATA_INVALID');
  return out;
};
export function normalizeReferences(raw, orgRows, setting, sha256) {
  const empty = Object.fromEntries(Object.values(CATALOGS).map(key => [key, []]));
  if (!Array.isArray(raw) || raw.length > MAX_ROWS) throw new Error('REFERENCE_DATA_BOUNDS');
  const seenIds = new Set(), seenCodes = new Set(), rows = [];
  for (const row of raw) {
    const referenceId = clean(row.reference_id, 100), catalog = clean(row.catalog, 32).toUpperCase();
    if (!CATALOGS[catalog] || seenIds.has(referenceId)) throw new Error('REFERENCE_DATA_INVALID');
    const code = clean(row.code, 64).toUpperCase(), key = catalog + '|' + code, label = clean(row.label_th, 120);
    if (!/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(code) || seenCodes.has(key) || !['ACTIVE', 'INACTIVE'].includes(row.status))
      throw new Error('REFERENCE_DATA_INVALID');
    const sortOrder = row.sort_order === '' || row.sort_order === undefined ? 0 : Number(row.sort_order);
    if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 1000000) throw new Error('REFERENCE_DATA_INVALID');
    const parentCode = row.parent_code === undefined || String(row.parent_code).trim() === '' ? '' : clean(row.parent_code, 64).toUpperCase();
    if ((catalog === 'MODEL') === !parentCode) throw new Error('REFERENCE_DATA_INVALID');
    seenIds.add(referenceId); seenCodes.add(key); rows.push({catalog, code, label, parentCode, sortOrder, status: row.status});
  }
  const active = rows.filter(row => row.status === 'ACTIVE');
  const brands = new Set(active.filter(row => row.catalog === 'BRAND').map(row => row.code));
  if (active.some(row => row.catalog === 'MODEL' && !brands.has(row.parentCode))) throw new Error('REFERENCE_DATA_INVALID');
  active.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'th') || a.code.localeCompare(b.code));
  const lists = {...empty};
  for (const row of active) lists[CATALOGS[row.catalog]].push(Object.freeze({code: row.code, label: row.label, ...(row.parentCode ? {parentCode: row.parentCode} : {})}));
  const organizations = (orgRows || []).filter(row => row.status === 'ACTIVE').map(row => ({
    code: clean(row.organization_id, 100), label: clean(row.name, 120)
  })).sort((a, b) => a.label.localeCompare(b.label, 'th') || a.code.localeCompare(b.code));
  const organizationCodes = new Set();
  if (organizations.some(row => organizationCodes.has(row.code) || !organizationCodes.add(row.code))) throw new Error('REFERENCE_DATA_INVALID');
  const complete = organizations.length > 0 && Object.values(STRICT).every(catalog => lists[CATALOGS[catalog]].length > 0);
  const enforcement = String(setting?.value || 'ADVISORY').toUpperCase();
  const mode = complete && enforcement === 'ENFORCED' ? 'ENFORCED' : complete ? 'ADVISORY' : 'LEGACY';
  const policies = Object.fromEntries(Object.entries(CATALOGS).map(([catalog, key]) => [key,
    Object.values(STRICT).includes(catalog) && mode === 'ENFORCED' ? 'ENFORCED' : 'ADVISORY']));
  policies.organizations = mode === 'ENFORCED' ? 'ENFORCED' : 'ADVISORY';
  return {mode, version: sha256(JSON.stringify({lists, organizations, policies})), lists, organizations, policies};
}
const REFERENCE_MEMO = 'reference_values';
// the normalized lists (+ the sticker row read in the same round when asked)
export function* referencesFlow(deps, {withSticker = false} = {}) {
  const cached = yield {memoGet: REFERENCE_MEMO};
  const reqs = [{kind: 'list', name: 'vc_organizations', filter: {status: 'ACTIVE'}}, {kind: 'one', name: 'vc_settings', filter: {key: 'registration_reference_enforcement'}}];
  if (withSticker) reqs.push(stickerRead);
  if (cached === undefined) reqs.push({kind: 'list', name: 'vc_reference_values'});
  const out = yield {reads: reqs};
  const [orgRows, setting] = out, stickerRow = withSticker ? out[2] : null, fresh = out[withSticker ? 3 : 2];
  if (cached === undefined) yield {memoPut: {key: REFERENCE_MEMO, value: fresh}};
  return {refs: normalizeReferences(cached === undefined ? fresh : cached, orgRows, setting, deps.sha256), stickerRow};
}
// references.registration: the lists + every person type (with ink) for the form
export function* referencesRegistrationFlow(p, deps) {
  const {refs, stickerRow} = yield* referencesFlow(deps, {withSticker: true});
  return {...refs, stickerCategories: withInk(stickerList(stickerRow))};
}
// registration submit: the payload must match the current lists (ENFORCED) or a supplied version (ADVISORY)
export function assertRegistrationAgainst(result, payload) {
  const supplied = payload.referenceVersion;
  if (result.mode === 'LEGACY') return result;
  if (result.mode === 'ADVISORY' && !supplied) return result;
  if (typeof supplied !== 'string' || supplied !== result.version) throw new Error('REFERENCE_VERSION_STALE');
  for (const [field, catalog] of Object.entries(STRICT)) {
    const code = typeof payload[field] === 'string' ? payload[field].trim().toUpperCase() : '';
    if (!result.lists[CATALOGS[catalog]].some(row => row.code === code)) throw new Error('INVALID_REFERENCE_VALUE');
  }
  if (!result.organizations.some(row => row.code === String(payload.organizationId || '').trim())) throw new Error('ORGANIZATION_INACTIVE');
  return result;
}

// ---- photos.upload (public): the file goes to Drive first (slow), then the staging row; a failure trashes the file ----
export function* photoUploadFlow(p, deps) {
  const [first] = yield {reads: [campaignRead(p.campaignToken, deps)]};
  const campaign = checkCampaign(first, deps);
  if (!PHOTO_SLOTS.includes(p.slot)) throw new Error('INVALID_SLOT');
  const photoId = deps.id();
  const item = yield {mediaUpload: {base64: p.base64Image, mime: p.mimeType}};
  try {
    // re-check the campaign (it may have closed during the upload) and count its staged photos in ONE round
    const [current, staged] = yield {reads: [campaignRead(p.campaignToken, deps), {kind: 'count', name: 'vc_photo_staging', filter: {campaign_id: campaign.campaign_id}}]};
    checkCampaign(current, deps);
    const maxUploads = Math.min(5000, Math.max(20, Number(current.max_submissions) * 10));
    if (staged >= maxUploads) throw new Error('PHOTO_UPLOAD_LIMIT');
    yield {insert: {table: 'vc_photo_staging', row: {photo_id: photoId, campaign_id: current.campaign_id, slot: p.slot, storage_ref: item.storage_ref,
      mime_type: item.mime_type, size_bytes: item.size_bytes, status: 'STAGED', created_at: deps.now(), used_at: ''}}};
    return {photoId, slot: p.slot};
  } catch (e) {
    try { yield {mediaTrash: {ref: item.storage_ref}}; } catch { /* orphan needs operational reconciliation (housekeeping trashes it) */ }
    throw e;
  }
}
