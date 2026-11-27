import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAcceptanceHarness, assertOk, assertError, SAMPLE_PASSWORD} from './acceptance-fixture.mjs';

test('ACTOR-SYSTEM-RESET preview → phrase + password + unchanged plan → delete all but master/users; Drive to trash; one audit row (VC-ADR-039)',()=>{
 const off=createAcceptanceHarness();
 assertError(assert,off.as('sys','system.reset.preview',{}),'OPERATION_DISABLED','switched off by default');
 const h=createAcceptanceHarness({allowSystemReset:true}),org=h.createOrganization(),camp=h.createCampaign();
 const r=assertOk(assert,h.call('registrations.submit',h.registrationPayload(camp.campaignToken,org,h.stagePhotos(camp.campaignToken),{stickerCategory:'NCO'})),'submit');
 assertOk(assert,h.as('reg','registrations.review',{requestId:r.requestId,decision:'APPROVE',platePhotoVerified:true}),'approve');
 h.store.insert('vc_reference_values',{reference_id:'REF-COLOR-WHITE',catalog:'COLOR',code:'WHITE',label_th:'ขาว',parent_code:'',sort_order:1,status:'ACTIVE'});
 for(const role of ['reg','staff','owner','worker'])assertError(assert,h.as(role,'system.reset.preview',{}),'FORBIDDEN',role+' denied');
 const p=assertOk(assert,h.as('sys','system.reset.preview',{}),'preview');
 assert.equal(p.phrase,'RESET P6VC');
 assert.equal(p.deleteByTable.vc_vehicles,1);assert.ok(p.deleteByTable.vc_vehicle_photos>=5);assert.ok(p.deleteByTable.vc_campaigns>=1);
 assert.equal(p.deleteByTable.vc_users,undefined,'users kept by default');assert.ok(p.keptByTable.vc_reference_values>=1);
 assert.ok(p.driveFiles>=5);
 const before=h.read('vc_vehicles').length;
 const base={confirmation:'RESET P6VC',password:SAMPLE_PASSWORD,planDigest:p.planDigest};
 assertError(assert,h.as('sys','system.reset.execute',{...base,confirmation:'reset'}),'RESET_CONFIRMATION_INVALID','wrong phrase');
 assertError(assert,h.as('sys','system.reset.execute',{...base,password:'Wrong-Password-123456'}),'INVALID_CREDENTIALS','wrong password');
 assertError(assert,h.as('sys','system.reset.execute',{...base,planDigest:'0'.repeat(64)}),'RESET_PLAN_STALE','plan changed / not previewed');
 assert.equal(h.read('vc_vehicles').length,before,'nothing deleted by a refused call');
 const out=assertOk(assert,h.as('sys','system.reset.execute',base),'execute');
 assert.equal(out.deleteByTable.vc_vehicles,1);assert.equal(out.drive.status,'DONE');assert.ok(out.drive.trashed>=5);
 for(const t of ['vc_vehicles','vc_vehicle_photos','vc_qr_tokens','vc_registration_requests','vc_campaigns','vc_photo_staging','vc_idempotency','vc_operation_journal','vc_lookup_audit'])
  assert.equal(h.read(t).length,0,t+' empty');
 assert.equal(h.read('vc_reference_values').length,1,'master kept');assert.ok(h.read('vc_settings').length>=2,'settings kept');
 assert.equal(h.read('vc_users').length,5,'all users kept');assert.equal(h.read('vc_organizations').length,1,'organizations kept');
 const audit=h.read('vc_change_audit');assert.equal(audit.length,1);assert.equal(audit[0].action,'SYSTEM_RESET');assert.equal(audit[0].actor_id,'u-sys');
 // the admin stays signed in; everyone else signs in again
 assertOk(assert,h.as('sys','system.reset.preview',{}),'admin session kept');
 assertError(assert,h.as('reg','vehicles.list',{}),'UNAUTHENTICATED','other sessions ended');
 // keepUsers:false keeps only the admin (+ its organization)
 const p2=assertOk(assert,h.as('sys','system.reset.preview',{keepUsers:false}),'preview 2');
 assert.equal(p2.deleteByTable.vc_users,4);
 assertOk(assert,h.as('sys','system.reset.execute',{...base,planDigest:p2.planDigest,keepUsers:false}),'execute 2');
 assert.deepEqual(h.read('vc_users').map(u=>u.user_id),['u-sys']);
});
