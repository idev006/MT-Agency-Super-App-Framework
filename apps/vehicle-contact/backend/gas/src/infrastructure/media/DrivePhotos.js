// Google Drive upload adapter. Parent-folder sharing is a documented public-link risk.
export function createDrivePhotos({driveApp,utilities,folderId}) {
 if(!driveApp||!utilities||!folderId)throw new Error('DRIVE_NOT_CONFIGURED');
 function upload(base64,mime){
  if(typeof base64!=='string'||base64.length>7000000||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw new Error('INVALID_MEDIA');
  if(!['image/jpeg','image/png','image/webp'].includes(mime))throw new Error('INVALID_MIME');
  const bytes=utilities.base64Decode(base64);
  if(bytes.length<20||bytes.length>5*1024*1024)throw new Error('INVALID_IMAGE_SIZE');
  const b=Array.from(bytes.slice(0,12),x=>x&255);
  const jpeg=b[0]===255&&b[1]===216&&b[2]===255;
  const png=b.slice(0,8).join(',')==='137,80,78,71,13,10,26,10';
  const webp=String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';
  if(mime==='image/jpeg'&&!jpeg||mime==='image/png'&&!png||mime==='image/webp'&&!webp)throw new Error('IMAGE_SIGNATURE_MISMATCH');
  const suffix=mime==='image/jpeg'?'jpg':mime==='image/png'?'png':'webp';
  const name=utilities.getUuid()+'.'+suffix;
  const blob=utilities.newBlob(bytes,mime,name);
  const file=driveApp.getFolderById(folderId).createFile(blob);
  return {storage_ref:file.getId(),mime_type:mime,size_bytes:bytes.length};
 }
 function read(storageRef){
  if(typeof storageRef!=='string'||!storageRef||storageRef.length>150)throw new Error('INVALID_STORAGE_REF');
  const blob=driveApp.getFileById(storageRef).getBlob();
  const mime=blob.getContentType();
  if(!['image/jpeg','image/png','image/webp'].includes(mime))throw new Error('INVALID_MIME');
  const bytes=blob.getBytes();
  if(bytes.length<20||bytes.length>5*1024*1024)throw new Error('INVALID_IMAGE_SIZE');
  return {base64Image:utilities.base64Encode(bytes),mime_type:mime,size_bytes:bytes.length};
 }
 function trash(storageRef){
  if(typeof storageRef!=='string'||!storageRef||storageRef.length>150)throw new Error('INVALID_STORAGE_REF');
  driveApp.getFileById(storageRef).setTrashed(true);return true;
 }
 // VC-ADR-039 system reset: move every file of the photo folder to the Drive trash (30-day undo), within a
 // time budget (GAS / Cloud Run limits); more=true when files remain (call again).
 function trashAll(budgetMs=25000){
  const start=Date.now(),files=driveApp.getFolderById(folderId).getFiles();let trashed=0;
  while(files.hasNext()){if(Date.now()-start>budgetMs)return {trashed,more:true};files.next().setTrashed(true);trashed++;}
  return {trashed,more:false};
 }
 // VC-ADR-046 phase 2c: one page of the photo folder for housekeeping (the core asks through the bridge). Paged with Drive's
 // continuation token so no single call runs long. Id, creation time, trash state, mime type and size — never file content
 // (housekeeping + the photo audit).
 function list(pageToken=null,pageSize=500){
  if(pageToken!==null&&(typeof pageToken!=='string'||!pageToken||pageToken.length>4000))throw new Error('INVALID_PAGE_TOKEN');
  const size=Math.min(Math.max(1,Math.floor(Number(pageSize))||500),1000);
  const it=pageToken?driveApp.continueFileIterator(pageToken):driveApp.getFolderById(folderId).getFiles();
  const files=[];
  while(files.length<size&&it.hasNext()){
   const f=it.next();
   files.push({id:f.getId(),createdMs:f.getDateCreated?new Date(f.getDateCreated()).getTime()||0:0,trashed:f.isTrashed(),
    mime:f.getMimeType?f.getMimeType():'',size:f.getSize?Number(f.getSize()):0});
  }
  return {files,nextPageToken:it.hasNext()?it.getContinuationToken():null};
 }
 // VC-ADR-050: put a vehicle's photos in its own folder, named by side, shared "anyone with the link can view".
 // req: {folderId?, path:[top, province, vehicle], files:[{ref, name}]} (names computed by the caller: domain/policies/PhotoLayout.js).
 // Idempotent: an existing folder is reused (by id, else by name under its parent); a file already in place is only renamed.
 // Moving keeps each file's Drive id. → {folderId}
 const okName=s=>typeof s==='string'&&s.length>0&&s.length<=120&&!/[\\/]/.test(s);
 function childFolder(parent,name){const it=parent.getFoldersByName(name);return it.hasNext()?it.next():parent.createFolder(name);}
 function organize(req){
  const r=req||{};
  if(!Array.isArray(r.path)||r.path.length!==3||!r.path.every(okName)||!Array.isArray(r.files)||!r.files.length||r.files.length>10
   ||r.files.some(f=>!f||typeof f.ref!=='string'||!f.ref||f.ref.length>150||!okName(f.name)))throw new Error('INVALID_PHOTO_LAYOUT');
  let folder=null;
  if(typeof r.folderId==='string'&&r.folderId){try{folder=driveApp.getFolderById(r.folderId);if(folder.isTrashed())folder=null;}catch(_){folder=null;}}
  if(!folder)folder=childFolder(childFolder(childFolder(driveApp.getFolderById(folderId),r.path[0]),r.path[1]),r.path[2]);
  else if(folder.getName()!==r.path[2])folder.setName(r.path[2]); // e.g. the plate was corrected
  folder.setSharing(driveApp.Access.ANYONE_WITH_LINK,driveApp.Permission.VIEW);
  for(const f of r.files){
   const file=driveApp.getFileById(f.ref);
   file.moveTo(folder);
   if(file.getName()!==f.name)file.setName(f.name);
   file.setSharing(driveApp.Access.ANYONE_WITH_LINK,driveApp.Permission.VIEW);
  }
  return {folderId:folder.getId()};
 }
 // VC-ADR-050: metadata of files by id (the photo audit; files no longer all sit in the photos folder). Never content.
 function stat(refs){
  if(!Array.isArray(refs)||refs.length>100||refs.some(x=>typeof x!=='string'||!x||x.length>150))throw new Error('INVALID_STORAGE_REF');
  return {files:refs.map(ref=>{
   try{const f=driveApp.getFileById(ref);return {id:ref,exists:true,trashed:f.isTrashed(),mime:f.getMimeType?f.getMimeType():'',size:f.getSize?Number(f.getSize()):0};}
   catch(_){return {id:ref,exists:false,trashed:false,mime:'',size:0};}
  })};
 }
 return Object.freeze({upload,read,trash,trashAll,list,organize,stat});
}
