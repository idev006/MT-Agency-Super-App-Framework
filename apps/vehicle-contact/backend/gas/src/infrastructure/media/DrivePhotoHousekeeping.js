// Drive photo housekeeping (owner 2026-11-25: "ต้องการให้ลบไฟล์ใน Drive" + the unclaimed-upload rule).
// Runs on GAS as the owner (the files live in the owner's Drive folder, VC-ADR-034). Two rules:
//  1. an upload left STAGED (never used by a registration) for more than STAGING_TTL_DAYS: its file
//     is trashed and its staging row removed;
//  2. a file in the photos folder that no photo/staging row references and that is older than
//     MIN_ORPHAN_AGE_HOURS (so an upload in flight is never touched) is trashed.
// Files go to the Drive TRASH (recoverable for 30 days), never a permanent delete. Dry run by default.
// Reports counters + short id prefixes only.
export const STAGING_TTL_DAYS=7;
export const MIN_ORPHAN_AGE_HOURS=24;
const MAX_FOLDER_SCAN=5000,MAX_TRASH_PER_RUN=1000,SAMPLE=10;
const short=id=>String(id).slice(0,8);

export function housekeepDrivePhotos({store,driveApp,folderId,apply=false,nowMs=Date.now()}){
  if(!store||!driveApp||!folderId)throw new Error('DRIVE_HOUSEKEEPING_NOT_CONFIGURED');
  const out={mode:apply?'APPLY':'DRY_RUN',expiredStaging:0,expiredStagingRemoved:0,orphanFiles:0,trashed:0,trashFailed:0,
    scanned:0,truncated:false,sample:[],rule:{stagingTtlDays:STAGING_TTL_DAYS,minOrphanAgeHours:MIN_ORPHAN_AGE_HOURS}};
  let budget=MAX_TRASH_PER_RUN;
  const trash=ref=>{
    if(budget<=0)return false;
    if(!apply){budget--;return true;}
    try{const f=driveApp.getFileById(ref);if(!f.isTrashed())f.setTrashed(true);budget--;out.trashed++;return true;}
    catch(_){out.trashFailed++;return false;}
  };
  // Rule 1: abandoned uploads.
  const staging=store.list('vc_photo_staging');
  const cutoff=nowMs-STAGING_TTL_DAYS*86400000;
  const expired=staging.filter(s=>s.status==='STAGED'&&Date.parse(s.created_at)<cutoff);
  out.expiredStaging=expired.length;
  const removed=new Set();
  for(const s of expired){
    if(s.storage_ref&&!trash(String(s.storage_ref)))continue; // keep the row while its file could not be trashed
    if(apply){store.remove('vc_photo_staging',{photo_id:s.photo_id});out.expiredStagingRemoved++;}
    removed.add(s.photo_id);
  }
  // Rule 2: files no row references.
  const referenced=new Set();
  for(const p of store.list('vc_vehicle_photos'))referenced.add(String(p.storage_ref||''));
  for(const s of staging)if(!removed.has(s.photo_id))referenced.add(String(s.storage_ref||''));
  const minCreated=nowMs-MIN_ORPHAN_AGE_HOURS*3600000;
  const it=driveApp.getFolderById(folderId).getFiles();
  while(it.hasNext()){
    if(out.scanned>=MAX_FOLDER_SCAN){out.truncated=true;break;}
    const f=it.next();out.scanned++;
    if(f.isTrashed()||referenced.has(f.getId()))continue;
    const created=f.getDateCreated?Date.parse(f.getDateCreated()):0;
    if(created&&created>minCreated)continue;
    out.orphanFiles++;
    if(out.sample.length<SAMPLE)out.sample.push(short(f.getId()));
    if(apply){if(budget<=0){out.truncated=true;continue;}try{f.setTrashed(true);budget--;out.trashed++;}catch(_){out.trashFailed++;}}
  }
  out.status=out.trashFailed?'PARTIAL':'PASS';
  return Object.freeze(out);
}
