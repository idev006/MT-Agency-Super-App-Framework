// Offline proof of the SSOT scenario verdicts and gates (no network).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verdict,runScenarios} from '../scripts/run-live-ssot-scenarios.mjs';

test('verdicts fail on any SSOT inconsistency even when the API said OK',()=>{
  assert.equal(verdict.c3b({activeVehiclesForPlate:1,secondApprovalCode:'DUPLICATE_VEHICLE'}),true);
  assert.equal(verdict.c3b({activeVehiclesForPlate:2,secondApprovalCode:'OK'}),false,'two vehicles for one plate');
  assert.equal(verdict.c4({status:'APPROVED',vehicles:1}),true);
  assert.equal(verdict.c4({status:'REJECTED',vehicles:0}),true);
  assert.equal(verdict.c4({status:'REJECTED',vehicles:1}),false,'rejected request with a live vehicle');
  assert.equal(verdict.c5({max:2,okResponses:2,submittedCount:2,requestRows:2}),true);
  assert.equal(verdict.c5({max:2,okResponses:3,submittedCount:3,requestRows:3}),false,'over capacity');
  assert.equal(verdict.c5({max:2,okResponses:2,submittedCount:2,requestRows:1}),false,'OK response without a row');
  assert.equal(verdict.s1({codes:['FORBIDDEN','FORBIDDEN'],rowsBefore:3,rowsAfter:3}),true);
  assert.equal(verdict.s1({codes:['FORBIDDEN','OK'],rowsBefore:3,rowsAfter:4}),false);
  assert.equal(verdict.s2({code:'UNAUTHENTICATED',sessionStatus:'REVOKED'}),true);
  assert.equal(verdict.s3({activeSessions:1,oldTokenCode:'UNAUTHENTICATED'}),false,'a session survived');
  assert.equal(verdict.s4({vehicleDisclosedBefore:true,vehicleDisclosedAfterRevoke:false,qrStatus:'REVOKED'}),true);
  assert.equal(verdict.s4({vehicleDisclosedBefore:true,vehicleDisclosedAfterRevoke:true,qrStatus:'REVOKED'}),false,'revoked QR disclosed a vehicle');
  assert.equal(verdict.s5({auditDelta:2}),false,'double audit');
});
test('gates block before any network call',async()=>{
  let calls=0;const r=await runScenarios({env:{},fetchImpl:async()=>{calls++;},persist:false});
  assert.equal(r.status,'BLOCKED');assert.equal(calls,0);
});

test('C6 verdict: both changes applied once, version +2 exactly, one audit row each', () => {
  const good={codes:['OK','OK','OK'],statusA:'APPROVED',statusB:'APPROVED',versionDelta:2,modelApplied:true,colorApplied:true,auditA:1,auditB:1};
  assert.equal(verdict.c6(good),true);
  assert.equal(verdict.c6({...good,codes:['OK','BUSY','OK']}),true,'BUSY after 4 conflicts is an honest refusal');
  assert.equal(verdict.c6({...good,versionDelta:3}),false,'same change applied twice (the old bug)');
  assert.equal(verdict.c6({...good,colorApplied:false}),false,'lost update: change B overwritten by a stale row');
  assert.equal(verdict.c6({...good,auditA:2}),false,'double audit = double apply');
  assert.equal(verdict.c6({...good,codes:['OK','INVALID_REQUEST_STATE','OK']}),false,'duplicate same-decision call must replay, not fail');
  assert.equal(verdict.c6({...good,statusB:'PENDING'}),false);
});
