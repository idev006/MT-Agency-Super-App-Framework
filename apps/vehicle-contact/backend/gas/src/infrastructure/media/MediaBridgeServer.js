import {createDrivePhotos} from './DrivePhotos.js';
import {MEDIA_BRIDGE_OPS,MEDIA_BRIDGE_WINDOW_MS,mediaBridgeSignature,sameSignature} from './MediaBridgeSignature.js';
// VC-ADR-034 (owner: "ยืนยันจะเก็บภาพไว้ที่ google drive"). GAS side of the media bridge: the only
// non-API request doPost accepts. Not in the public API inventory; no session; authorised solely by
// the HMAC of the shared secret VEHICLE_MEDIA_BRIDGE_SECRET. Disabled when the secret is absent.
// Errors are fixed codes (never the internal message). Drive validation is DrivePhotos (unchanged).
const SAFE=new Set(['INVALID_MEDIA','INVALID_MIME','INVALID_IMAGE_SIZE','IMAGE_SIGNATURE_MISMATCH','INVALID_STORAGE_REF','INVALID_PAGE_TOKEN','INVALID_PHOTO_LAYOUT','DRIVE_NOT_CONFIGURED']);
export function isMediaBridgeRequest(request){return Boolean(request)&&request.bridge==='media';}
export function createMediaBridgeServer({propertiesService,utilities,driveApp,now=()=>Date.now()}){
 function fail(code){return {ok:false,data:null,error:{code}};}
 function handle(request){
  const props=propertiesService.getScriptProperties();
  const secret=props.getProperty('VEHICLE_MEDIA_BRIDGE_SECRET');
  if(!secret||secret.length<32)return fail('BRIDGE_DISABLED');
  const {op,ts,args,sig}=request||{};
  if(!MEDIA_BRIDGE_OPS.includes(op)||typeof ts!=='string'||!args||typeof args!=='object'||Array.isArray(args)||typeof sig!=='string')return fail('BRIDGE_BAD_REQUEST');
  const t=Date.parse(ts);
  if(!Number.isFinite(t)||Math.abs(now()-t)>MEDIA_BRIDGE_WINDOW_MS)return fail('BRIDGE_EXPIRED');
  if(!sameSignature(sig,mediaBridgeSignature({utilities,secret,op,ts,args})))return fail('BRIDGE_UNAUTHORIZED');
  try{
   const photos=createDrivePhotos({driveApp,utilities,folderId:props.getProperty('VEHICLE_PHOTOS_FOLDER_ID')});
   if(op==='upload')return {ok:true,data:photos.upload(args.base64,args.mime),error:null};
   if(op==='read')return {ok:true,data:photos.read(args.storageRef),error:null};
   if(op==='list')return {ok:true,data:photos.list(args.pageToken===undefined?null:args.pageToken),error:null}; // phase 2c housekeeping
   if(op==='organize')return {ok:true,data:photos.organize(args),error:null}; // VC-ADR-050
   if(op==='stat')return {ok:true,data:photos.stat(args.refs),error:null};
   if(op==='trashAll')return {ok:true,data:photos.trashAll(25000),error:null}; // VC-ADR-039 system reset
   return {ok:true,data:{trashed:photos.trash(args.storageRef)},error:null};
  }catch(e){const code=String(e&&e.message||'');return fail(SAFE.has(code)?code:'BRIDGE_DRIVE_FAILED');}
 }
 return Object.freeze({handle});
}
