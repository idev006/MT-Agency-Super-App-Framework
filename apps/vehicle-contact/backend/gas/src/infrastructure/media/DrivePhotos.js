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
 function trash(storageRef){
  if(typeof storageRef!=='string'||!storageRef||storageRef.length>150)throw new Error('INVALID_STORAGE_REF');
  driveApp.getFileById(storageRef).setTrashed(true);return true;
 }
 return Object.freeze({upload,trash});
}
