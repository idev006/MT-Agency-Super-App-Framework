// registrations.photo: reviewer-only evidence read with request-snapshot ownership and access audit.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAcceptanceHarness,assertOk,assertError} from './acceptance-fixture.mjs';
import {createDrivePhotos} from '../src/infrastructure/media/DrivePhotos.js';

function pendingRegistration(h){
 const org=h.createOrganization(),camp=h.createCampaign(),photos=h.stagePhotos(camp.campaignToken);
 const submitted=assertOk(assert,h.call('registrations.submit',h.registrationPayload(camp.campaignToken,org,photos)),'submit');
 return {submitted,photos};
}

test('PHOTO-01 reviewer reads all five snapshot photos; bytes match staged media; no storage ref leaks',()=>{
 const h=createAcceptanceHarness(),{submitted,photos}=pendingRegistration(h);
 for(const staged of photos){
  const data=assertOk(assert,h.as('reg','registrations.photo',{requestId:submitted.requestId,photoId:staged.photoId}),'photo '+staged.slot);
  assert.equal(data.photoId,staged.photoId);
  assert.equal(data.slot,staged.slot);
  assert.equal(data.mimeType,'image/png');
  assert.equal(data.base64Image,'AAAA-binary-fake');
  assert.equal(Object.hasOwn(data,'storageRef'),false,'Drive file id must never reach the client');
 }
 const audits=h.read('vc_change_audit').filter(a=>a.action==='REGISTRATION_PHOTO_VIEWED');
 assert.equal(audits.length,5);
 assert.ok(audits.every(a=>a.entity_id===submitted.requestId&&a.actor_id==='u-reg'));
});

test('PHOTO-02 default deny: anonymous UNAUTHENTICATED, other roles FORBIDDEN, no extra payload fields',()=>{
 const h=createAcceptanceHarness(),{submitted,photos}=pendingRegistration(h);
 const payload={requestId:submitted.requestId,photoId:photos[0].photoId};
 assertError(assert,h.call('registrations.photo',payload),'UNAUTHENTICATED','anonymous');
 for(const actor of ['staff','owner','worker'])
  assertError(assert,h.as(actor,'registrations.photo',payload),'FORBIDDEN',actor);
 assertError(assert,h.as('reg','registrations.photo',{...payload,role:'SYSTEM_ADMIN'}),'INVALID_REQUEST','field allowlist');
 assert.equal(h.read('vc_change_audit').filter(a=>a.action==='REGISTRATION_PHOTO_VIEWED').length,0,'denied calls must not audit as viewed');
});

test('PHOTO-03 ownership: unknown request NOT_FOUND; photo outside the request snapshot PHOTO_NOT_FOUND',()=>{
 const h=createAcceptanceHarness(),{submitted,photos}=pendingRegistration(h);
 assertError(assert,h.as('reg','registrations.photo',{requestId:'f'.repeat(64),photoId:photos[0].photoId}),'NOT_FOUND','unknown request');
 assertError(assert,h.as('reg','registrations.photo',{requestId:submitted.requestId,photoId:'f'.repeat(64)}),'PHOTO_NOT_FOUND','foreign photo');
 const camp2=h.createCampaign(),org2=h.createOrganization(),other=h.stagePhotos(camp2.campaignToken);
 assertError(assert,h.as('reg','registrations.photo',{requestId:submitted.requestId,photoId:other[0].photoId}),'PHOTO_NOT_FOUND','photo staged for another campaign');
});

test('PHOTO-04 real DrivePhotos.read enforces ref/mime/size guards and returns base64 bytes',()=>{
 const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
 const files=new Map([['ok-png',{bytes:[...png],mime:'image/png'}],['pdf',{bytes:[...png],mime:'application/pdf'}],
  ['tiny',{bytes:[1,2,3],mime:'image/png'}],['huge',{bytes:new Array(5*1024*1024+1).fill(0),mime:'image/png'}]]);
 const utilities={base64Encode:bytes=>Buffer.from(bytes).toString('base64')};
 const drive={getFileById(id){const f=files.get(id);if(!f)throw new Error('DRIVE_FILE_NOT_FOUND');
  return{getBlob:()=>({getContentType:()=>f.mime,getBytes:()=>f.bytes})};}};
 const adapter=createDrivePhotos({driveApp:drive,utilities,folderId:'private-sandbox-folder'});
 const result=adapter.read('ok-png');
 assert.equal(result.mime_type,'image/png');
 assert.equal(result.size_bytes,png.length);
 assert.equal(result.base64Image,png.toString('base64'));
 assert.throws(()=>adapter.read(''),/INVALID_STORAGE_REF/);
 assert.throws(()=>adapter.read('x'.repeat(151)),/INVALID_STORAGE_REF/);
 assert.throws(()=>adapter.read('pdf'),/INVALID_MIME/);
 assert.throws(()=>adapter.read('tiny'),/INVALID_IMAGE_SIZE/);
 assert.throws(()=>adapter.read('huge'),/INVALID_IMAGE_SIZE/);
});