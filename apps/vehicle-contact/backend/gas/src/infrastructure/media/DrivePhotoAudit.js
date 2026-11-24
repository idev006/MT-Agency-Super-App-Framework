// L4 SSOT file proof (TEST_SUITE_SSOT_DESIGN_20261124, D1/D2). Editor-only, read-only.
// Cross-checks the DATA SSOT (Firestore photo rows) against the FILE SSOT (Drive) directly
// via DriveApp — NOT through the API/use-case path. Reports counters + short id prefixes only.
const LIVE_PHOTO=new Set(['ACTIVE']);
const LIVE_STAGING=new Set(['STAGED','CLAIMED']);
const MAX_FOLDER_SCAN=5000,SAMPLE=10;
const short=id=>String(id).slice(0,8);

export function auditDrivePhotos({store,driveApp,folderId}){
  if(!store||!driveApp||!folderId)throw new Error('DRIVE_AUDIT_NOT_CONFIGURED');
  const photos=store.list('vc_vehicle_photos'),staging=store.list('vc_photo_staging');
  const issues={missing:[],trashed:[],wrongFolder:[],mimeMismatch:[],sizeMismatch:[],stagingRefMismatch:[]};
  const referenced=new Set();
  function check(row,kind){
    const ref=String(row.storage_ref||'');referenced.add(ref);
    let file;
    try{file=driveApp.getFileById(ref);}catch(_){issues.missing.push(kind+':'+short(ref));return;}
    if(file.isTrashed()){issues.trashed.push(kind+':'+short(ref));return;}
    const parents=file.getParents();let inFolder=false;
    while(parents.hasNext())if(parents.next().getId()===folderId)inFolder=true;
    if(!inFolder)issues.wrongFolder.push(kind+':'+short(ref));
    if(row.mime_type&&file.getMimeType()!==row.mime_type)issues.mimeMismatch.push(kind+':'+short(ref));
    if(row.size_bytes!==''&&row.size_bytes!==undefined&&Number(file.getSize())!==Number(row.size_bytes))issues.sizeMismatch.push(kind+':'+short(ref));
  }
  const livePhotos=photos.filter(p=>LIVE_PHOTO.has(p.status));
  // photos.replace retires (trashes) the original file and bumps the photo version; the CLAIMED
  // staging row is then history pointing at the retired file. Such rows are not live files.
  // (First live run 2026-11-24 flagged exactly these 3 rows; verified as replace history.)
  const replaced=new Set(livePhotos.filter(p=>Number(p.version)>1).map(p=>p.photo_id));
  const liveStaging=staging.filter(s=>LIVE_STAGING.has(s.status)&&!(s.status==='CLAIMED'&&replaced.has(s.photo_id)));
  for(const p of livePhotos)check(p,'photo');
  for(const s of liveStaging)check(s,'staging');
  // An approved, never-replaced photo keeps the staging photo_id and file; both rows must agree.
  const stagingById=new Map(staging.map(s=>[s.photo_id,s]));
  for(const p of livePhotos){if(replaced.has(p.photo_id))continue;const s=stagingById.get(p.photo_id);if(s&&s.storage_ref!==p.storage_ref)issues.stagingRefMismatch.push('photo:'+short(p.photo_id));}
  for(const p of photos)referenced.add(String(p.storage_ref||''));
  for(const s of staging)referenced.add(String(s.storage_ref||''));
  // D2: files in the folder that no row references (storage leak inventory).
  let scanned=0,orphans=0;const orphanSample=[];
  const it=driveApp.getFolderById(folderId).getFiles();
  while(it.hasNext()&&scanned<MAX_FOLDER_SCAN){const f=it.next();scanned++;if(f.isTrashed())continue;
    if(!referenced.has(f.getId())){orphans++;if(orphanSample.length<SAMPLE)orphanSample.push(short(f.getId()));}}
  const counts=Object.fromEntries(Object.entries(issues).map(([k,v])=>[k,v.length]));
  const ok=Object.values(counts).every(n=>n===0);
  return Object.freeze({status:ok?'PASS':'FAIL',checked:{livePhotos:livePhotos.length,liveStaging:liveStaging.length,replacedPhotos:replaced.size},
    issues:counts,samples:Object.fromEntries(Object.entries(issues).filter(([,v])=>v.length).map(([k,v])=>[k,v.slice(0,SAMPLE)])),
    folder:{scanned,truncated:scanned>=MAX_FOLDER_SCAN,unreferencedFiles:orphans,unreferencedSample:orphanSample},
    note:'unreferencedFiles is a storage-leak inventory (e.g. staged-never-submitted uploads, rows wiped by the DEV re-init); it does not fail the audit'});
}
