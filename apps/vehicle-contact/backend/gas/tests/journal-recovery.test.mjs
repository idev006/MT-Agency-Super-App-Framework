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
const journalOf=(h,entityId,operation='registrations.submit')=>h.read('vc_operation_journal').find(j=>j.entity_id===entityId&&j.operation===operation);

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

test('B2B-ROLE-01 assignRoles caught partial write restores prior roles and journals ROLLED_BACK',()=>{
 const h=createAcceptanceHarness();
 assert.ok(h.read('vc_user_roles').some(r=>r.user_id==='u-staff'&&r.role_id==='STAFF'),'precondition: staff has a role');
 const w=h.io.writes;h.setWriteFailAfterOnce(w+3); // session touch + PREPARED journal + existing-role remove, then fail first insert once
 assertError(assert,h.as('sys','users.assignRoles',{userId:'u-staff',roles:['STAFF','OWNER']}),'OPERATION_FAILED','injected insert failure');
 assert.deepEqual(h.read('vc_user_roles').filter(r=>r.user_id==='u-staff'&&r.status==='ACTIVE').map(r=>r.role_id),['STAFF']);
 const journal=h.read('vc_operation_journal').filter(j=>j.operation==='users.assignRoles').at(-1);
 assert.equal(journal.status,'ROLLED_BACK');
 assert.equal(h.read('vc_change_audit').filter(a=>a.action==='ROLES_CHANGED'&&a.entity_id==='u-staff').length,0);
});

test('B2B-ROLE-02 assignRoles restart converges a PREPARED partial and replay stays idempotent',()=>{
 const h=createAcceptanceHarness(),eventId='evt-role-restart',auditId='audit-role-restart';
 const old=h.read('vc_user_roles').find(r=>r.user_id==='u-staff');
 h.store.remove('vc_user_roles',{assignment_id:old.assignment_id});
 h.seed('vc_user_roles',[{assignment_id:'partial-owner-role',user_id:'u-staff',role_id:'OWNER',status:'ACTIVE'}]);
 h.seed('vc_operation_journal',[{event_id:eventId,operation:'users.assignRoles',entity_id:'u-staff',actor_id:'u-sys',status:'PREPARED',created_at:h.now(),
  detail_json:JSON.stringify({operation:'users.assignRoles',userId:'u-staff',actorId:'u-sys',beforeRoles:['STAFF'],desiredRoles:['OWNER','STAFF'],auditId,correlationId:'role-restart'})}]);
 const recovered=assertOk(assert,h.as('sys','users.assignRoles',{userId:'u-staff',roles:['STAFF','OWNER']}),'restart recovery');
 assert.deepEqual(recovered.roles,['STAFF','OWNER']);
 assert.deepEqual(h.read('vc_user_roles').filter(r=>r.user_id==='u-staff'&&r.status==='ACTIVE').map(r=>r.role_id).sort(),['OWNER','STAFF']);
 assert.equal(journalOf(h,'u-staff','users.assignRoles').status,'APPLIED');
 assert.equal(h.read('vc_change_audit').filter(a=>a.audit_id===auditId).length,1);
 const journalCount=h.read('vc_operation_journal').filter(j=>j.operation==='users.assignRoles'&&j.entity_id==='u-staff').length;
 assertOk(assert,h.as('sys','users.assignRoles',{userId:'u-staff',roles:['STAFF','OWNER']}),'idempotent replay');
 assert.equal(h.read('vc_operation_journal').filter(j=>j.operation==='users.assignRoles'&&j.entity_id==='u-staff').length,journalCount);
 assert.equal(h.read('vc_change_audit').filter(a=>a.audit_id===auditId).length,1);
});

test('B2B-REVIEW-01 (W1) a failing review write leaves NO partial state — one all-or-nothing commit, retry succeeds',()=>{
 const h=createAcceptanceHarness(),ctx=submitContext(h);
 const sub=assertOk(assert,h.call('registrations.submit',ctx.payload),'submit');
 h.setWriteFailure('vc_vehicle_contacts'); // contact write fails → the whole commit is rejected
 assertError(assert,h.as('reg','registrations.review',{requestId:sub.requestId,decision:'APPROVE',platePhotoVerified:true}),'OPERATION_FAILED','injected contact failure');
 h.setWriteFailure(null);
 assert.equal(h.read('vc_vehicles').filter(v=>v.vehicle_id===sub.vehicleId).length,0,'no vehicle written');
 assert.equal(h.read('vc_registration_requests').find(r=>r.request_id===sub.requestId).status,'PENDING_APPROVAL');
 assert.equal(h.read('vc_vehicle_contacts').filter(c=>c.vehicle_id===sub.vehicleId).length,0,'no contact written');
 assert.equal(h.read('vc_qr_tokens').filter(q=>q.vehicle_id===sub.vehicleId).length,0,'no QR issued');
 assert.equal(h.read('vc_operation_journal').filter(j=>j.operation==='registrations.review'&&j.entity_id===sub.requestId).length,0,'nothing journaled: nothing was written');
 const ok=assertOk(assert,h.as('reg','registrations.review',{requestId:sub.requestId,decision:'APPROVE',platePhotoVerified:true}),'retry succeeds cleanly');
 assert.equal(ok.status,'APPROVED');
 assert.equal(h.read('vc_vehicle_photos').filter(x=>x.vehicle_id===sub.vehicleId).length,5);
 assert.equal(h.read('vc_operation_journal').filter(j=>j.operation==='registrations.review'&&j.entity_id===sub.requestId).at(-1).status,'APPLIED');
});

test('B2B-REVIEW-02 registrationReview restart cleans a PREPARED partial and replays the same derived token',()=>{
 const h=createAcceptanceHarness(),ctx=submitContext(h),sub=assertOk(assert,h.call('registrations.submit',ctx.payload),'submit');
 const request=h.read('vc_registration_requests').find(r=>r.request_id===sub.requestId),app=JSON.parse(request.application_json);
 const eventId='evt-review-restart',auditId='audit-review-restart',qrId='qr-review-restart';
 const detail={operation:'registrations.review',requestId:sub.requestId,vehicleId:sub.vehicleId,decision:'APPROVE',actorId:'u-reg',
  contactId:'contact-review-restart',qrId,auditId,correlationId:'review-restart'};
 h.seed('vc_operation_journal',[{event_id:eventId,operation:'registrations.review',entity_id:sub.requestId,actor_id:'u-reg',status:'PREPARED',created_at:h.now(),detail_json:JSON.stringify(detail)}]);
 h.seed('vc_vehicles',[{vehicle_id:sub.vehicleId,plate_normalized:app.plate_normalized,province_code:app.province_code,vehicle_type:app.vehicle_type,
  make:app.make,model:app.model,color:app.color,status:'ACTIVE',version:1,created_at:h.now(),updated_at:h.now(),created_by:'u-reg',updated_by:'u-reg',
  plate_type:app.plate_type,organization_id:app.organization_id}]);
 const recovered=assertOk(assert,h.as('reg','registrations.review',{requestId:sub.requestId,decision:'APPROVE',platePhotoVerified:true}),'restart review recovery');
 assert.match(recovered.qrToken,/^[a-f0-9]{64}$/);assert.equal(recovered.qrId,qrId);
 assert.equal(h.read('vc_operation_journal').find(j=>j.event_id===eventId).status,'APPLIED');
 assert.equal(h.read('vc_vehicles').filter(v=>v.vehicle_id===sub.vehicleId).length,1);
 assert.equal(h.read('vc_vehicle_contacts').filter(c=>c.vehicle_id===sub.vehicleId).length,1);
 assert.equal(h.read('vc_vehicle_photos').filter(p=>p.vehicle_id===sub.vehicleId).length,5);
 assert.equal(h.read('vc_qr_tokens').find(q=>q.qr_id===qrId).token_digest,h.security.sha256(recovered.qrToken));
 const replay=assertOk(assert,h.as('reg','registrations.review',{requestId:sub.requestId,decision:'APPROVE',platePhotoVerified:true}),'review replay');
 assert.equal(replay.qrToken,recovered.qrToken);assert.equal(h.read('vc_change_audit').filter(a=>a.audit_id===auditId).length,1);
 assert.equal(h.read('vc_qr_tokens').filter(q=>q.vehicle_id===sub.vehicleId).length,1);
});

test('B2B-REVIEW-03 stale PREPARED marker after terminal writes finalizes without duplicates',()=>{
 const h=createAcceptanceHarness(),ctx=submitContext(h),sub=assertOk(assert,h.call('registrations.submit',ctx.payload),'submit');
 const first=assertOk(assert,h.as('reg','registrations.review',{requestId:sub.requestId,decision:'APPROVE',platePhotoVerified:true}),'approve');
 const journal=h.read('vc_operation_journal').filter(j=>j.operation==='registrations.review'&&j.entity_id===sub.requestId).at(-1);
 h.store.update('vc_operation_journal',{event_id:journal.event_id},{status:'PREPARED'});
 const replay=assertOk(assert,h.as('reg','registrations.review',{requestId:sub.requestId,decision:'APPROVE',platePhotoVerified:true}),'restart after terminal writes');
 assert.equal(replay.qrToken,first.qrToken);assert.equal(journalOf(h,sub.requestId,'registrations.review').status,'APPLIED');
 assert.equal(h.read('vc_vehicles').filter(v=>v.vehicle_id===sub.vehicleId).length,1);
 assert.equal(h.read('vc_qr_tokens').filter(q=>q.vehicle_id===sub.vehicleId).length,1);
});

test('B2B-REVIEW-04 mismatched retry intent fails closed without changing the pending request',()=>{
 const h=createAcceptanceHarness(),ctx=submitContext(h),sub=assertOk(assert,h.call('registrations.submit',ctx.payload),'submit');
 h.seed('vc_operation_journal',[{event_id:'evt-review-mismatch',operation:'registrations.review',entity_id:sub.requestId,actor_id:'u-reg',status:'PREPARED',created_at:h.now(),
  detail_json:JSON.stringify({operation:'registrations.review',requestId:sub.requestId,vehicleId:sub.vehicleId,decision:'APPROVE',actorId:'u-reg',contactId:'c',qrId:'q',auditId:'a',correlationId:'x'})}]);
 assertError(assert,h.as('reg','registrations.review',{requestId:sub.requestId,decision:'REJECT'}),'OPERATION_RECOVERY_REQUIRED','conflicting restart intent');
 assert.equal(h.read('vc_registration_requests').find(r=>r.request_id===sub.requestId).status,'PENDING_APPROVAL');
 assert.equal(h.read('vc_vehicles').filter(v=>v.vehicle_id===sub.vehicleId).length,0);
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

test('G7-RACE-01 a racing same-key submit that reads idempotency BEFORE the winner commits must NOT delete the winner (live bug 2026-11-24)',()=>{
 const h=createAcceptanceHarness(),ctx=submitContext(h);
 const first=assertOk(assert,h.call('registrations.submit',ctx.payload),'winner commits');
 // Simulate the live interleaving: the loser's parallel read sees NO idempotency row (stale),
 // but its orphan query already sees the winner's committed request (APPLIED journal).
 const realReadMany=h.store.readMany;
 let stale=true;
 h.store.readMany=reqs=>reqs.map(r=>{
  if(stale&&r.name==='vc_idempotency'){stale=false;return null;}
  return r.kind==='one'?h.store.one(r.name,r.filter):h.store.list(r.name,r.filter);
 });
 const loser=assertOk(assert,h.call('registrations.submit',ctx.payload),'loser replays the winner');
 h.store.readMany=realReadMany;
 assert.equal(loser.requestId,first.requestId,'same request returned');
 const rows=h.read('vc_registration_requests').filter(r=>r.idempotency_key===ctx.idemKey);
 assert.equal(rows.length,1,'winner request still exists (the bug deleted it)');
 assert.equal(rows[0].request_id,first.requestId);
 assert.equal(h.read('vc_photo_staging').filter(p=>p.status==='CLAIMED').length,5,'photos stay CLAIMED');
 assert.equal(journalOf(h,first.requestId).status,'APPLIED','winner journal untouched');
 assert.equal(h.read('vc_campaigns').find(c=>c.campaign_id===ctx.campaign.campaignId).submitted_count,1,'quota counted once');
});
