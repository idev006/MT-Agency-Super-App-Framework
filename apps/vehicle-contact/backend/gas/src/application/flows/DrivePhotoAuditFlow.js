// L4 SSOT file proof (TEST_SUITE_SSOT_DESIGN_20261124, D1/D2) as ONE shared flow (VC-ADR-046 phase 2c-3): read-only. Cross-checks
// the DATA SSOT (Firestore photo rows) against the FILE SSOT (Drive) — not through the API/use-case path. The Node core runs it
// as the job drive-photo-audit through the photo bridge; the GAS editor runs the same flow on Drive directly.
// VC-ADR-050: approved photos live in per-vehicle folders, so every referenced file is checked BY ITS ID (bridge op stat:
// exists, trashed, mime, size); the photos folder listing is used only for the unreferenced-file inventory (uploads left in
// the root). Reports counters + short id prefixes only. Effects (FlowRunner): reads, mediaStat, mediaList.
const LIVE_PHOTO = new Set(['ACTIVE']);
const LIVE_STAGING = new Set(['STAGED', 'CLAIMED']);
export const AUDIT_MAX_FOLDER_SCAN = 5000;
const STAT_BATCH = 100;
const SAMPLE = 10;
const short = id => String(id).slice(0, 8);

export function* drivePhotoAuditFlow() {
  const [photos, staging] = yield {reads: [{kind: 'list', name: 'vc_vehicle_photos'}, {kind: 'list', name: 'vc_photo_staging'}]};
  // the photo folder, page by page
  const files = new Map();
  let scanned = 0, truncated = false, pageToken = null;
  scan: do {
    const page = yield {mediaList: {pageToken}};
    for (const f of page.files) {
      if (scanned >= AUDIT_MAX_FOLDER_SCAN) { truncated = true; break scan; }
      scanned++; files.set(String(f.id), f);
    }
    pageToken = page.nextPageToken || null;
    if (pageToken && scanned >= AUDIT_MAX_FOLDER_SCAN) { truncated = true; break; }
  } while (pageToken);

  const issues = {missing: [], trashed: [], mimeMismatch: [], sizeMismatch: [], stagingRefMismatch: []};
  const livePhotosAll = photos.filter(p => LIVE_PHOTO.has(p.status));
  const replacedAll = new Set(livePhotosAll.filter(p => Number(p.version) > 1).map(p => p.photo_id));
  const checkedRefs = [...new Set([...livePhotosAll, ...staging.filter(s => LIVE_STAGING.has(s.status) && !(s.status === 'CLAIMED' && replacedAll.has(s.photo_id)))]
    .map(r => String(r.storage_ref || '')).filter(Boolean))];
  const stats = new Map();
  for (let i = 0; i < checkedRefs.length; i += STAT_BATCH) {
    const page = yield {mediaStat: checkedRefs.slice(i, i + STAT_BATCH)};
    for (const f of page.files) stats.set(String(f.id), f);
  }
  function check(row, kind) {
    const ref = String(row.storage_ref || '');
    const f = stats.get(ref);
    if (!f || !f.exists) { issues.missing.push(kind + ':' + short(ref)); return; }
    if (f.trashed) { issues.trashed.push(kind + ':' + short(ref)); return; }
    if (row.mime_type && f.mime !== row.mime_type) issues.mimeMismatch.push(kind + ':' + short(ref));
    if (row.size_bytes !== '' && row.size_bytes !== undefined && Number(f.size) !== Number(row.size_bytes)) issues.sizeMismatch.push(kind + ':' + short(ref));
  }
  const livePhotos = photos.filter(p => LIVE_PHOTO.has(p.status));
  // photos.replace retires (trashes) the original file and bumps the photo version; the CLAIMED staging row is then history
  // pointing at the retired file. Such rows are not live files. (First live run 2026-11-24 flagged exactly these 3 rows.)
  const replaced = new Set(livePhotos.filter(p => Number(p.version) > 1).map(p => p.photo_id));
  const liveStaging = staging.filter(s => LIVE_STAGING.has(s.status) && !(s.status === 'CLAIMED' && replaced.has(s.photo_id)));
  for (const p of livePhotos) check(p, 'photo');
  for (const s of liveStaging) check(s, 'staging');
  // An approved, never-replaced photo keeps the staging photo_id and file; both rows must agree.
  const stagingById = new Map(staging.map(s => [s.photo_id, s]));
  for (const p of livePhotos) {
    if (replaced.has(p.photo_id)) continue;
    const s = stagingById.get(p.photo_id);
    if (s && s.storage_ref !== p.storage_ref) issues.stagingRefMismatch.push('photo:' + short(p.photo_id));
  }
  // D2: files in the folder that no row references (storage-leak inventory; does not fail the audit).
  const referenced = new Set([...photos, ...staging].map(r => String(r.storage_ref || '')));
  let orphans = 0; const orphanSample = [];
  for (const f of files.values()) {
    if (f.trashed || referenced.has(String(f.id))) continue;
    orphans++; if (orphanSample.length < SAMPLE) orphanSample.push(short(f.id));
  }
  const counts = Object.fromEntries(Object.entries(issues).map(([k, v]) => [k, v.length]));
  const ok = Object.values(counts).every(n => n === 0); // a truncated folder scan only shortens the inventory now
  return Object.freeze({status: ok ? 'PASS' : 'FAIL', checked: {livePhotos: livePhotos.length, liveStaging: liveStaging.length, replacedPhotos: replaced.size},
    issues: counts, samples: Object.fromEntries(Object.entries(issues).filter(([, v]) => v.length).map(([k, v]) => [k, v.slice(0, SAMPLE)])),
    folder: {scanned, truncated, unreferencedFiles: orphans, unreferencedSample: orphanSample},
    note: 'missing = the Drive file does not exist (checked by id); unreferencedFiles = files left in the photos folder root that no row references (storage-leak inventory, never fails the audit)'});
}
