// L4 Drive SSOT audit: offline proof with a fake DriveApp + in-memory rows.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditDrivePhotos} from '../src/infrastructure/media/DrivePhotoAudit.js';

function fakeDrive(files,folderId){
  const iter=a=>{let i=0;return{hasNext:()=>i<a.length,next:()=>a[i++]};};
  const mk=f=>({getId:()=>f.id,isTrashed:()=>!!f.trashed,getMimeType:()=>f.mime,getSize:()=>f.size,getParents:()=>iter([{getId:()=>f.folder||folderId}])});
  return {getFileById(id){const f=files.find(x=>x.id===id);if(!f)throw new Error('not found');return mk(f);},
    getFolderById(){return {getFiles:()=>iter(files.filter(f=>(f.folder||folderId)===folderId).map(mk))};}};
}
const store=(photos,staging)=>({list:t=>t==='vc_vehicle_photos'?photos:staging});

test('PASS when every live row has its file (right folder, mime, size); orphans are reported, not failed',()=>{
  const files=[{id:'f1',mime:'image/png',size:70},{id:'f2',mime:'image/png',size:70},{id:'orphan1',mime:'image/png',size:5}];
  const r=auditDrivePhotos({store:store([{photo_id:'p1',storage_ref:'f1',status:'ACTIVE',mime_type:'image/png',size_bytes:70}],
    [{photo_id:'p1',storage_ref:'f1',status:'CLAIMED',mime_type:'image/png',size_bytes:70},{photo_id:'p2',storage_ref:'f2',status:'STAGED',mime_type:'image/png',size_bytes:70}]),
    driveApp:fakeDrive(files,'FOLDER'),folderId:'FOLDER'});
  assert.equal(r.status,'PASS');assert.equal(r.folder.unreferencedFiles,1);
});
test('FAIL on missing, trashed, wrong folder, mime/size mismatch and staging→photo ref drift',()=>{
  const files=[{id:'t',mime:'image/png',size:1,trashed:true},{id:'w',mime:'image/png',size:1,folder:'OTHER'},{id:'m',mime:'image/jpeg',size:1},{id:'s',mime:'image/png',size:2},{id:'x',mime:'image/png',size:1}];
  const row=(id,ref)=>({photo_id:id,storage_ref:ref,status:'ACTIVE',mime_type:'image/png',size_bytes:1});
  const r=auditDrivePhotos({store:store([row('a','gone'),row('b','t'),row('c','w'),row('d','m'),row('e','s'),row('f','x')],[{photo_id:'f',storage_ref:'other',status:'REVOKED'}]),
    driveApp:fakeDrive(files,'FOLDER'),folderId:'FOLDER'});
  assert.equal(r.status,'FAIL');
  assert.deepEqual(r.issues,{missing:1,trashed:1,wrongFolder:1,mimeMismatch:1,sizeMismatch:1,stagingRefMismatch:1});
});

test('photos.replace history (version 2, old file trashed, CLAIMED staging on the old file) is NOT a defect',()=>{
  const files=[{id:'old',mime:'image/png',size:1,trashed:true},{id:'new',mime:'image/png',size:2}];
  const r=auditDrivePhotos({store:store([{photo_id:'p1',storage_ref:'new',status:'ACTIVE',version:2,mime_type:'image/png',size_bytes:2}],
    [{photo_id:'p1',storage_ref:'old',status:'CLAIMED',mime_type:'image/png',size_bytes:1}]),driveApp:fakeDrive(files,'FOLDER'),folderId:'FOLDER'});
  assert.equal(r.status,'PASS');assert.equal(r.checked.replacedPhotos,1);
});
