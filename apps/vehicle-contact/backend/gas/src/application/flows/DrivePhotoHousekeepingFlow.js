// Drive photo housekeeping (owner 2026-11-25: "ต้องการให้ลบไฟล์ใน Drive" + the unclaimed-upload rule) as ONE shared flow
// (VC-ADR-046 phase 2c): the Node core runs it as a scheduled job through the photo bridge; until GAS is bridge-only the
// GAS editor runs the same flow on Drive directly. Rules moved unchanged from infrastructure/media/DrivePhotoHousekeeping.js:
//  1. an upload left STAGED (never used by a registration) for more than STAGING_TTL_DAYS: its file is trashed and its
//     staging row removed (the row stays while its file could not be trashed);
//  2. a file in the photos folder that no photo/staging row references and that is older than MIN_ORPHAN_AGE_HOURS (so an
//     upload in flight is never touched) is trashed.
// Files go to the Drive TRASH (recoverable for 30 days), never a permanent delete. Dry run unless apply. At most
// MAX_TRASH_PER_RUN files per run and MAX_FOLDER_SCAN files scanned. Reports counters + short id prefixes only.
// Effects (FlowRunner): reads, remove, mediaList (one page of the folder), mediaTrash.
export const STAGING_TTL_DAYS = 7;
export const MIN_ORPHAN_AGE_HOURS = 24;
export const MAX_FOLDER_SCAN = 5000;
export const MAX_TRASH_PER_RUN = 1000;
const SAMPLE = 10;
const short = id => String(id).slice(0, 8);

export function* drivePhotoHousekeepingFlow({apply = false, nowMs}) {
  if (!Number.isFinite(nowMs)) throw new Error('INVALID_CLOCK');
  const out = {mode: apply ? 'APPLY' : 'DRY_RUN', expiredStaging: 0, expiredStagingRemoved: 0, orphanFiles: 0, trashed: 0, trashFailed: 0,
    scanned: 0, truncated: false, sample: [], rule: {stagingTtlDays: STAGING_TTL_DAYS, minOrphanAgeHours: MIN_ORPHAN_AGE_HOURS}};
  let budget = MAX_TRASH_PER_RUN;
  function* trash(ref) {
    if (budget <= 0) return false;
    if (!apply) { budget--; return true; }
    try { yield {mediaTrash: {ref}}; budget--; out.trashed++; return true; } catch { out.trashFailed++; return false; }
  }
  const [staging, photos] = yield {reads: [{kind: 'list', name: 'vc_photo_staging'}, {kind: 'list', name: 'vc_vehicle_photos'}]};
  // Rule 1: abandoned uploads.
  const cutoff = nowMs - STAGING_TTL_DAYS * 86400000;
  const expired = staging.filter(s => s.status === 'STAGED' && Date.parse(s.created_at) < cutoff);
  out.expiredStaging = expired.length;
  const removed = new Set();
  for (const s of expired) {
    if (s.storage_ref && !(yield* trash(String(s.storage_ref)))) continue; // keep the row while its file could not be trashed
    if (apply) { yield {remove: {table: 'vc_photo_staging', filter: {photo_id: s.photo_id}}}; out.expiredStagingRemoved++; }
    removed.add(s.photo_id);
  }
  // Rule 2: files no row references.
  const referenced = new Set();
  for (const p of photos) referenced.add(String(p.storage_ref || ''));
  for (const s of staging) if (!removed.has(s.photo_id)) referenced.add(String(s.storage_ref || ''));
  const minCreated = nowMs - MIN_ORPHAN_AGE_HOURS * 3600000;
  let pageToken = null;
  scan: do {
    const page = yield {mediaList: {pageToken}};
    for (const f of page.files) {
      if (out.scanned >= MAX_FOLDER_SCAN) { out.truncated = true; break scan; }
      out.scanned++;
      if (f.trashed || referenced.has(f.id)) continue;
      if (f.createdMs && f.createdMs > minCreated) continue;
      out.orphanFiles++;
      if (out.sample.length < SAMPLE) out.sample.push(short(f.id));
      if (apply) {
        if (budget <= 0) { out.truncated = true; continue; }
        try { yield {mediaTrash: {ref: f.id}}; budget--; out.trashed++; } catch { out.trashFailed++; }
      }
    }
    pageToken = page.nextPageToken || null;
    if (pageToken && out.scanned >= MAX_FOLDER_SCAN) { out.truncated = true; break; }
  } while (pageToken);
  out.status = out.trashFailed ? 'PARTIAL' : 'PASS';
  return Object.freeze(out);
}
