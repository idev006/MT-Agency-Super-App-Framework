// VC-ADR-034: photos stay in the owner's Google Drive; Cloud Run reaches them only through the
// signed GAS media bridge. Proves the round trip and that unsigned/tampered/expired/forged
// requests are refused without touching Drive and without leaking internal errors.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMediaBridgeServer,isMediaBridgeRequest} from '../src/infrastructure/media/MediaBridgeServer.js';
import {mediaBridgeSignature} from '../src/infrastructure/media/MediaBridgeSignature.js';
import {createMediaBridgePhotos} from '../../cloudrun/media-bridge-client.mjs';
import {nodeUtilities} from '../../cloudrun/runtime.mjs';

const SECRET='s'.repeat(40),FOLDER='owner-drive-folder';
const utilities=nodeUtilities();
const JPEG='/9j/'+Buffer.alloc(40,7).toString('base64');
function fakeDrive({failWith}={}){
 const files=new Map(),trashed=new Set();let n=0;const touched={count:0};
 return {files,trashed,touched,
  getFolderById(id){touched.count++;assert.equal(id,FOLDER);return {createFile(blob){if(failWith)throw new Error(failWith);const fid='drive-'+(++n);files.set(fid,blob);return {getId:()=>fid};}};},
  getFileById(id){touched.count++;if(!files.has(id))throw new Error('internal: no such file '+id);
   return {getBlob:()=>files.get(id),setTrashed:v=>{if(v)trashed.add(id);}};}};
}
function setup({secret=SECRET,clientSecret=secret,drive=fakeDrive(),serverNow=()=>Date.now()}={}){
 const props={VEHICLE_MEDIA_BRIDGE_SECRET:secret,VEHICLE_PHOTOS_FOLDER_ID:FOLDER};
 const server=createMediaBridgeServer({propertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]??null})},utilities,driveApp:drive,now:serverNow});
 const sent=[];
 const fetchSync=(url,opts)=>{sent.push(JSON.parse(opts.payload));const out=server.handle(JSON.parse(opts.payload));return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(out)};};
 const client=createMediaBridgePhotos({fetchSync,url:'https://script.google.com/macros/s/x/exec',secret:clientSecret,utilities});
 return {server,client,drive,sent};
}

test('BRIDGE-01 upload -> read -> trash round trip lands in the owner Drive folder', ()=>{
 const {client,drive,sent}=setup();
 const up=client.upload(JPEG,'image/jpeg');
 assert.match(up.storage_ref,/^drive-/);assert.equal(up.mime_type,'image/jpeg');
 assert.ok(drive.files.has(up.storage_ref));
 const back=client.read(up.storage_ref);
 assert.equal(back.base64Image,JPEG);
 assert.equal(client.trash(up.storage_ref),true);assert.ok(drive.trashed.has(up.storage_ref));
 assert.ok(sent.every(r=>isMediaBridgeRequest(r)&&/^[0-9a-f]{64}$/.test(r.sig)),'every call is signed');
 assert.ok(!JSON.stringify(sent).includes(SECRET),'the secret itself is never sent');
});

test('BRIDGE-02 wrong secret, tampered args, expired or future timestamps are refused before Drive is touched', ()=>{
 const forged=setup({clientSecret:'x'.repeat(40)});
 assert.throws(()=>forged.client.upload(JPEG,'image/jpeg'),/BRIDGE_UNAUTHORIZED/);
 assert.equal(forged.drive.touched.count,0);
 const {server,drive}=setup();
 const ts=new Date().toISOString(),args={storageRef:'drive-1'};
 const sig=mediaBridgeSignature({utilities,secret:SECRET,op:'read',ts,args});
 assert.equal(server.handle({bridge:'media',op:'read',ts,args:{storageRef:'drive-2'},sig}).error.code,'BRIDGE_UNAUTHORIZED','tampered args');
 assert.equal(server.handle({bridge:'media',op:'trash',ts,args,sig}).error.code,'BRIDGE_UNAUTHORIZED','signature bound to the op');
 const old=new Date(Date.now()-6*60e3).toISOString();
 assert.equal(server.handle({bridge:'media',op:'read',ts:old,args,sig:mediaBridgeSignature({utilities,secret:SECRET,op:'read',ts:old,args})}).error.code,'BRIDGE_EXPIRED');
 const future=new Date(Date.now()+6*60e3).toISOString();
 assert.equal(server.handle({bridge:'media',op:'read',ts:future,args,sig:mediaBridgeSignature({utilities,secret:SECRET,op:'read',ts:future,args})}).error.code,'BRIDGE_EXPIRED');
 assert.equal(server.handle({bridge:'media',op:'delete',ts,args,sig}).error.code,'BRIDGE_BAD_REQUEST');
 assert.equal(drive.touched.count,0,'no Drive access for any refused request');
});

test('BRIDGE-03 disabled without a strong secret; Drive validation errors pass through; internal errors never leak', ()=>{
 const off=setup({secret:'short',clientSecret:SECRET});
 assert.throws(()=>off.client.upload(JPEG,'image/jpeg'),/BRIDGE_DISABLED/);
 assert.equal(off.drive.touched.count,0);
 const {client}=setup();
 assert.throws(()=>client.upload('not base64!!','image/jpeg'),/INVALID_MEDIA/);
 assert.throws(()=>client.upload(JPEG,'image/png'),/IMAGE_SIGNATURE_MISMATCH/);
 assert.throws(()=>client.read('drive-404'),err=>err.message==='BRIDGE_DRIVE_FAILED'&&!/no such file/.test(err.message));
 const broken=setup({drive:fakeDrive({failWith:'quota exceeded for owner@example'})});
 assert.throws(()=>broken.client.upload(JPEG,'image/jpeg'),err=>err.message==='BRIDGE_DRIVE_FAILED');
});

test('BRIDGE-04 the Cloud Run application uses the bridge only when both bridge settings are present', async ()=>{
 const {createCloudRunApplication}=await import('../../cloudrun/runtime.mjs');
 const env={P6VC_AUTH_PEPPER:'x'.repeat(48),FIRESTORE_PROJECT_ID:'mt-iam-core-2026'};
 const reply=b=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(b)});
 assert.ok(createCloudRunApplication({env,fetchSync:()=>reply({})}),'without the bridge: photo ops fail closed (DRIVE_NOT_CONFIGURED)');
 assert.throws(()=>createCloudRunApplication({env:{...env,MEDIA_BRIDGE_URL:'https://x',P6VC_MEDIA_BRIDGE_SECRET:'short'},fetchSync:()=>reply({})}),/MEDIA_BRIDGE_NOT_CONFIGURED/);
});
