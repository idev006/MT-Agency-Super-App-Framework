import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAcceptanceHarness,assertOk,assertError,PHOTO_SLOTS} from './acceptance-fixture.mjs';
import {createDrivePhotos} from '../src/infrastructure/media/DrivePhotos.js';
const submitted=(h,override={})=>{
 const org=h.createOrganization(),campaign=h.createCampaign(),photos=h.stagePhotos(campaign.campaignToken);
 const payload=h.registrationPayload(campaign.campaignToken,org,photos,override);
 const result=assertOk(assert,h.call('registrations.submit',payload),'precondition submit');
 return {org,campaign,photos,payload,result};
};
test('EDGE-01 incomplete five photos denied before any quota consumption',()=>{
 const h=createAcceptanceHarness(),org=h.createOrganization(),camp=h.createCampaign();
 const p=h.registrationPayload(camp.campaignToken,org,PHOTO_SLOTS.slice(0,4).map(slot=>({slot,photoId:'fake'})));
 assertError(assert,h.call('registrations.submit',p),'INVALID_REQUEST','missing fifth photo');
 assert.equal(h.read('vc_registration_requests').length,0);
 assert.equal(h.read('vc_campaigns')[0].submitted_count,0);
});
test('EDGE-02 registration rejection creates no active vehicle or QR, does not automatically refund campaign quota',()=>{
 const h=createAcceptanceHarness(),{result,campaign}=submitted(h);
 const reject=assertOk(assert,h.as('reg','registrations.review',{requestId:result.requestId,decision:'REJECT'}),'reject registration');
 assert.equal(reject.status,'REJECTED');
 assert.equal(h.read('vc_qr_tokens').length,0);
 assert.equal(h.read('vc_vehicles').length,0);
 assert.equal(h.read('vc_campaigns')[0].submitted_count,1);
 assertError(assert,h.as('reg','registrations.review',{requestId:result.requestId,decision:'APPROVE',platePhotoVerified:true}),'INVALID_REQUEST_STATE','already reviewed');
});
test('EDGE-03 same idempotency key with changed body denied; duplicate pending business key denied',()=>{
 const h=createAcceptanceHarness(),{payload}=submitted(h);
 assertError(assert,h.call('registrations.submit',{...payload,color:'Red'}),'IDEMPOTENCY_CONFLICT','idempotency mismatch');
 assertError(assert,h.call('registrations.submit',{...payload,idempotencyKey:'another-key'}),'DUPLICATE_VEHICLE','pending duplicate');
 assert.equal(h.read('vc_registration_requests').length,1);
});
test('EDGE-04 quota is consumed at successfully submitted application and then rejects another unique submission',()=>{
 const h=createAcceptanceHarness(),org=h.createOrganization();
 const camp=assertOk(assert,h.as('sys','campaigns.create',{startsAt:'2026-11-17T00:00:00.000Z',endsAt:'2026-11-20T00:00:00.000Z',maxSubmissions:1}),'quota 1');
 const photos1=h.stagePhotos(camp.campaignToken);
 const r=assertOk(assert,h.call('registrations.submit',h.registrationPayload(camp.campaignToken,org,photos1)),'first accepted');
 assert.equal(r.status,'PENDING_APPROVAL');
 const second=h.registrationPayload(camp.campaignToken,org,photos1,{plate:'กข 8888',idempotencyKey:'different'});
 assertError(assert,h.call('registrations.submit',second),'CAMPAIGN_INVALID','full campaign');
 assert.equal(h.read('vc_campaigns')[0].submitted_count,1);
});
test('EDGE-05 invalid/revoked/expired campaign cannot stage files or submit records',()=>{
 const h=createAcceptanceHarness(),org=h.createOrganization(),camp=h.createCampaign();
 assertError(assert,h.call('photos.upload',{campaignToken:'invalid',slot:'FRONT',base64Image:'AAAA',mimeType:'image/png'}),'CAMPAIGN_INVALID','invalid campaign');
 assertOk(assert,h.as('sys','campaigns.revoke',{campaignId:camp.campaignId}),'revoke');
 assertError(assert,h.call('registrations.submit',h.registrationPayload(camp.campaignToken,org,PHOTO_SLOTS.map(slot=>({slot,photoId:'unused'})))),'CAMPAIGN_INVALID','revoked submission');
 assertError(assert,h.call('photos.upload',{campaignToken:camp.campaignToken,slot:'FRONT',base64Image:'AAAA',mimeType:'image/png'}),'CAMPAIGN_INVALID','revoked upload');
 const h2=createAcceptanceHarness(),other=h2.createCampaign();
 h2.setTime('2026-11-21T12:00:00.000Z');
 assertError(assert,h2.call('campaigns.validate',{campaignToken:other.campaignToken}),'CAMPAIGN_INVALID','expired campaign');
});
test('EDGE-06 QR invalid token, unknown valid-shaped token and multiple-active QR protect identity',()=>{
 const h=createAcceptanceHarness(),{result}=submitted(h);
 const approved=assertOk(assert,h.as('reg','registrations.review',{requestId:result.requestId,decision:'APPROVE',platePhotoVerified:true}),'approve');
 assertError(assert,h.as('staff','qr.resolve',{token:'bad'}),'INVALID_QR','invalid QR syntax');
 assert.equal(assertOk(assert,h.as('staff','qr.resolve',{token:'f'.repeat(64)}),'unregistered QR'),null);
 h.seed('vc_qr_tokens',[{qr_id:'qr-duplicate-test',vehicle_id:approved.vehicleId,token_digest:'invalid-digest-synthetic',
  status:'ACTIVE',issued_at:h.now(),revoked_at:'',issued_by:'u-reg',reason:'FAULT_TEST'}]);
 assertError(assert,h.as('reg','qr.replace',{vehicleId:approved.vehicleId}),'MULTIPLE_ACTIVE_QR','two active QR rows');
});
test('EDGE-07 legal hold prevents retention approval even after due',()=>{
 const h=createAcceptanceHarness();
 h.seed('vc_retention_jobs',[{job_id:'job-legal-hold',vehicle_id:'synthetic-vehicle',due_at:'2026-11-01T00:00:00.000Z',
   status:'WAITING_RETENTION',approved_by:'',approved_at:'',attempts:0,last_error:'',legal_hold:true,
   created_at:h.now(),updated_at:h.now()}]);
 assert.equal(assertOk(assert,h.as('sys','retention.listDue',{}),'due excludes holds').length,0);
 assertError(assert,h.as('sys','retention.approve',{jobId:'job-legal-hold'}),'RETENTION_NOT_APPROVABLE','approval must fail');
 assert.equal(h.store.one('vc_retention_jobs',{job_id:'job-legal-hold'}).status,'WAITING_RETENTION');
});
test('EDGE-08 photo upload failure after Drive write triggers compensation trash; does not persist metadata',()=>{
 const h=createAcceptanceHarness(),camp=h.createCampaign();
 h.setWriteFailure('vc_photo_staging');
 assertError(assert,h.call('photos.upload',{campaignToken:camp.campaignToken,slot:'FRONT',base64Image:'AAAA',mimeType:'image/png'}),'OPERATION_FAILED','injected Sheets write failure');
 assert.equal(h.io.driveUploads,1);
 assert.equal(h.io.driveDeletes,1);
 assert.equal(h.read('vc_photo_staging').length,0);
 assert.equal(h.driveState.size,0);
});
test('EDGE-09 observed non-atomic registration gap is captured as BLOCKER, not misreported as transactional rollback',()=>{
 const h=createAcceptanceHarness(),org=h.createOrganization(),camp=h.createCampaign(),photos=h.stagePhotos(camp.campaignToken);
 h.setWriteFailure('vc_idempotency');
 const payload=h.registrationPayload(camp.campaignToken,org,photos);
 assertError(assert,h.call('registrations.submit',payload),'OPERATION_FAILED','injected final idempotency failure');
 const pending=h.read('vc_registration_requests'),journal=h.read('vc_operation_journal');
 // Observable discrepancy: records and quota consumed although request returned failure.
 assert.equal(pending.length,1,'partial application persists without idempotency row');
 assert.equal(h.read('vc_idempotency').length,0);
 assert.equal(h.read('vc_campaigns')[0].submitted_count,1);
 assert.equal(journal.some(j=>j.operation==='registrations.submit'&&j.status==='PREPARED'),true);
 console.log('BLOCKER-REG-PARTIAL-WRITE: Registration needs resumable operation-journal reconciliation before production-ready label');
});
test('EDGE-10 real DrivePhotos adapter validates content signature/size/mime before file creation',()=>{
 const blobs=[],trashed=[],png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
 const utilities={getUuid:()=> 'dummy-uuid',base64Decode:x=>[...Buffer.from(x,'base64')],newBlob:(bytes,mime,name)=>({bytes,mime,name})};
 const drive={getFolderById(id){assert.equal(id,'private-sandbox-folder');return{createFile(blob){blobs.push(blob);return{getId(){return'fake-file-'+blobs.length;}};}};},
  getFileById(id){return{setTrashed(t){trashed.push([id,t]);}}}};
 const adapter=createDrivePhotos({driveApp:drive,utilities,folderId:'private-sandbox-folder'});
 assert.equal(adapter.upload(png.toString('base64'),'image/png').mime_type,'image/png');
 assert.equal(blobs.length,1);
 assert.throws(()=>adapter.upload('not-valid-base64!','image/png'),/INVALID_MEDIA/);
 assert.throws(()=>adapter.upload(png.toString('base64'),'application/pdf'),/INVALID_MIME/);
 assert.throws(()=>adapter.upload(Buffer.alloc(4).toString('base64'),'image/png'),/INVALID_IMAGE_SIZE/);
 assert.throws(()=>adapter.upload(Buffer.alloc(40).toString('base64'),'image/png'),/IMAGE_SIGNATURE_MISMATCH/);
 assert.equal(blobs.length,1,'rejected uploads must never create Drive files');
 assert.equal(adapter.trash('fake-file-1'),true);assert.deepEqual(trashed,[['fake-file-1',true]]);
});
