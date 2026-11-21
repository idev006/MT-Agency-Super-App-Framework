// B2 — operation-journal reconciliation + partial-write failure evidence (D-SEQ-05 / D-SEQ-09).
// Synthetic in-memory harness only; no live data, credentials, or tokens. Timeout aftermath is
// seeded directly because a caught injected failure would run registrationSubmit's compensation,
// whereas an abrupt GAS timeout/restart does NOT — leaving PREPARED + partial rows unreconciled.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAcceptanceHarness,assertOk,assertError} from './acceptance-fixture.mjs';

function submitContext(h){
 const org=h.createOrganization(),campaign=h.createCampaign(),photos=h.stagePhotos(campaign.campaignToken);
 const payload=h.registrationPayload(campaign.campaignToken,org,photos);
 const idemKey=h.security.sha256('registration:'+campaign.campaignId+':'+payload.idempotencyKey);
 return {org,campaign,photos,payload,idemKey};
}
function seedPartialSubmit(h,ctx,{requestId,vehicleId,eventId,claimPhotos,quota}){
 const snapshot={plate_normalized:'กข 1234',province_code:'10',
  photos:ctx.photos.map(p=>({photoId:p.photoId,slot:p.slot,storageRef:'synthetic-ref',mimeType:'image/png',sizeBytes:10}))};
 h.seed('vc_operation_journal',[{event_id:eventId,operation:'registrations.submit',entity_id:requestId,
  actor_id:'PUBLIC_CAMPAIGN',status:'PREPARED',created_at:h.now(),
  detail_json:JSON.stringify({operation:'registrations.submit',requestId,vehicleId,campaignId:ctx.campaign.campaignId,idempotencyKey:ctx.idemKey,requestDigest:'synthetic'})}]);
 h.seed('vc_registration_requests',[{request_id:requestId,vehicle_id:vehicleId,campaign_id:ctx.campaign.campaignId,
  status:'PENDING_APPROVAL',submitted_at:h.now(),reviewed_by:'',reviewed_at:'',application_json:JSON.stringify(snapshot),idempotency_key:ctx.idemKey}]);
 if(claimPhotos)for(const p of ctx.photos)h.store.update('vc_photo_staging',{photo_id:p.photoId},{status:'CLAIMED',used_at:h.now()});
 if(quota)h.store.update('vc_campaigns',{campaign_id:ctx.campaign.campaignId},{submitted_count:1});
}
const journalOf=(h,requestId)=>h.read('vc_operation_journal').find(j=>j.entity_id===requestId);

test('RECOVERY-01 timeout after request+photos+quota (no idempotency commit) reconciles on retry',()=>{
 const h=createAcceptanceHarness(),ctx=submitContext(h);
 seedPartialSubmit(h,ctx,{requestId:'req-timeout-01',vehicleId:'veh-timeout-01',eventId:'evt-timeout-01',claimPhotos:true,quota:true});
 // Retry after the "restart": orphan application removed, photos restored then re-claimed, retry proceeds.
 const result=assertOk(assert,h.call('registrations.submit',ctx.payload),'retry after partial-timeout reconciliation');
 assert.notEqual(result.requestId,'req-timeout-01','retry must create a fresh application, not reuse the orphan');
 assert.equal(h.read('vc_registration_requests').length,1,'orphan application removed; only the new one remains');
 assert.equal(h.read('vc_registration_requests')[0].request_id,result.requestId);
 const oldJournal=journalOf(h,'req-timeout-01');
 assert.equal(oldJournal.status,'RECOVERY_REQUIRED','ambiguous quota flagged for the manual runbook');
 const recovery=JSON.parse(oldJournal.detail_json).recovery;
 assert.equal(recovery.quotaCheck,'MANUAL');assert.equal(recovery.requestRemoved,true);
 assert.equal(recovery.photosRestored.length,5);
 assert.equal(journalOf(h,result.requestId).status,'APPLIED','new attempt committed cleanly');
 assert.equal(h.read('vc_photo_staging').every(p=>p.status==='CLAIMED'),true,'photos re-claimed by the new application');
 assert.equal(h.read('vc_idempotency').length,1,'idempotency committed for the new attempt');
 // Honest residual: the partial attempt incremented quota and the retry increments again -> +1 drift
 // flagged RECOVERY_REQUIRED/quotaCheck=MANUAL for the runbook (state alone cannot prove the increment).
 assert.equal(h.read('vc_campaigns').find(c=>c.campaign_id===ctx.campaign.campaignId).submitted_count,2,'quota drift documented for manual verification');
});

test('RECOVERY-02 timeout after idempotency commit leaves stale PREPARED journal; replay marks APPLIED',()=>{
 const h=createAcceptanceHarness(),ctx=submitContext(h);
 const first=assertOk(assert,h.call('registrations.submit',ctx.payload),'initial submit');
 // Simulate a timeout between the idempotency commit and the journal APPLIED update.
 const j=journalOf(h,first.requestId);
 h.store.update('vc_operation_journal',{event_id:j.event_id},{status:'PREPARED'});
 const replay=assertOk(assert,h.call('registrations.submit',ctx.payload),'idempotent replay after commit-timeout');
 assert.equal(replay.requestId,first.requestId,'replay returns the cached result, no duplicate application');
 assert.equal(journalOf(h,first.requestId).status,'APPLIED','stale PREPARED journal reconciled to APPLIED');
 assert.equal(h.read('vc_registration_requests').length,1,'no second application created');
});

test('RECOVERY-03 reconciliation cleanup failure surfaces OPERATION_RECOVERY_REQUIRED (fail-safe)',()=>{
 const h=createAcceptanceHarness(),ctx=submitContext(h);
 seedPartialSubmit(h,ctx,{requestId:'req-timeout-03',vehicleId:'veh-timeout-03',eventId:'evt-timeout-03',claimPhotos:true,quota:true});
 h.setWriteFailure('vc_photo_staging'); // photo restore cannot complete -> manual intervention required
 assertError(assert,h.call('registrations.submit',ctx.payload),'OPERATION_RECOVERY_REQUIRED','blocked when compensation cannot complete');
 const j=journalOf(h,'req-timeout-03');
 assert.equal(j.status,'RECOVERY_REQUIRED');
 assert.ok(JSON.parse(j.detail_json).recovery.errors.length>0,'cleanup errors recorded for the runbook');
});

test('RECOVERY-04 aborted attempt before any business write (PREPARED, no orphan) does not block retry',()=>{
 const h=createAcceptanceHarness(),ctx=submitContext(h);
 // Timeout right after the PREPARED journal insert, before the application row: no orphan, no claims, no quota.
 h.seed('vc_operation_journal',[{event_id:'evt-abort-04',operation:'registrations.submit',entity_id:'req-abort-04',
  actor_id:'PUBLIC_CAMPAIGN',status:'PREPARED',created_at:h.now(),
  detail_json:JSON.stringify({operation:'registrations.submit',requestId:'req-abort-04',campaignId:ctx.campaign.campaignId,idempotencyKey:ctx.idemKey})}]);
 const result=assertOk(assert,h.call('registrations.submit',ctx.payload),'retry after clean abort');
 assert.equal(journalOf(h,result.requestId).status,'APPLIED');
 assert.equal(h.read('vc_campaigns').find(c=>c.campaign_id===ctx.campaign.campaignId).submitted_count,1,'quota incremented exactly once');
 // Known limitation: a PREPARED journal with no application row is an aborted attempt; it is inert and
 // left for the runbook / a future admin reconcile op (no per-submit cross-table scan, per latency directive).
 assert.equal(journalOf(h,'req-abort-04').status,'PREPARED','inert aborted journal flagged for runbook cleanup');
});

test('DSEQ09-01 assignRoles partial write (remove succeeds, insert fails) loses roles — no journal/compensation',()=>{
 const h=createAcceptanceHarness();
 assert.ok(h.read('vc_user_roles').some(r=>r.user_id==='u-staff'&&r.role_id==='STAFF'),'precondition: staff has a role');
 const w=h.io.writes;h.setWriteFailAfter(w+2); // +1 session last_seen touch, +1 existing-role remove, then fail the first insert
 assertError(assert,h.as('sys','users.assignRoles',{userId:'u-staff',roles:['STAFF','OWNER']}),'OPERATION_FAILED','injected insert failure');
 h.setWriteFailAfter(null);
 assert.equal(h.read('vc_user_roles').filter(r=>r.user_id==='u-staff').length,0,'GAP: roles removed but not re-inserted; manual recovery required (runbook)');
 assert.equal(h.read('vc_operation_journal').filter(j=>j.operation==='users.assignRoles').length,0,'assignRoles writes no journal');
});

test('DSEQ09-02 registrationReview partial write leaves orphan ACTIVE vehicle, request still PENDING — no compensation',()=>{
 const h=createAcceptanceHarness(),ctx=submitContext(h);
 const sub=assertOk(assert,h.call('registrations.submit',ctx.payload),'submit');
 h.setWriteFailure('vc_vehicle_contacts'); // vehicle insert succeeds, contact insert fails
 assertError(assert,h.as('reg','registrations.review',{requestId:sub.requestId,decision:'APPROVE',platePhotoVerified:true}),'OPERATION_FAILED','injected contact failure');
 h.setWriteFailure(null);
 assert.equal(h.read('vc_vehicles').filter(v=>v.vehicle_id===sub.vehicleId).length,1,'GAP: orphan vehicle inserted');
 assert.equal(h.read('vc_registration_requests').find(r=>r.request_id===sub.requestId).status,'PENDING_APPROVAL','GAP: request not advanced');
 assert.equal(h.read('vc_vehicle_contacts').filter(c=>c.vehicle_id===sub.vehicleId).length,0,'no contact written');
 assert.equal(h.read('vc_qr_tokens').filter(q=>q.vehicle_id===sub.vehicleId).length,0,'no QR issued');
});

test('DSEQ09-03 executeDeletion partial write removes photos but leaves contacts/vehicle; job DELETION_FAILED (retry required)',()=>{
 const h=createAcceptanceHarness(),ctx=submitContext(h);
 const sub=assertOk(assert,h.call('registrations.submit',ctx.payload),'submit');
 assertOk(assert,h.as('reg','registrations.review',{requestId:sub.requestId,decision:'APPROVE',platePhotoVerified:true}),'approve');
 const vid=sub.vehicleId;
 h.seed('vc_retention_jobs',[{job_id:'job-del-03',vehicle_id:vid,due_at:'2020-01-01T00:00:00.000Z',status:'DELETION_APPROVED',
  approved_by:'u-sys',approved_at:h.now(),attempts:0,last_error:'',legal_hold:false,created_at:h.now(),updated_at:h.now()}]);
 h.setWriteFailure('vc_vehicle_contacts'); // photo rows removed first, then contact removal fails
 assertError(assert,h.as('worker','retention.execute',{jobId:'job-del-03'}),'DELETION_RETRY_REQUIRED','injected contact-removal failure');
 h.setWriteFailure(null);
 assert.equal(h.read('vc_vehicle_photos').filter(p=>p.vehicle_id===vid).length,0,'GAP: photos already removed (partial deletion)');
 assert.equal(h.read('vc_vehicle_contacts').filter(c=>c.vehicle_id===vid).length,1,'GAP: contacts remain');
 assert.equal(h.read('vc_vehicles').filter(v=>v.vehicle_id===vid).length,1,'GAP: vehicle remains');
 const job=h.read('vc_retention_jobs').find(j=>j.job_id==='job-del-03');
 assert.equal(job.status,'DELETION_FAILED','job marked for retry; reconciliation is manual per runbook');
 assert.ok(job.last_error.length>0,'failure reason recorded');
});