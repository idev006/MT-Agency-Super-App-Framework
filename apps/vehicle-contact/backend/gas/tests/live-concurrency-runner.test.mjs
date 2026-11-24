// G7 runner: offline proof of the pass/fail logic and the safety gates (no network).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateSubmitRace,evaluateApproveRace,runConcurrency} from '../scripts/run-live-concurrency.mjs';

const ok=data=>({ok:true,data}),err=code=>({ok:false,error:{code}});
const goodSubmitData={requests:1,idempotency:1,submittedCount:1,photosClaimed:5};
const goodApproveData={vehicles:1,activeQr:1,photos:5,contacts:1,appliedJournals:1};

test('C1 passes only when every OK response is the same request AND the data has exactly one of everything',()=>{
  const same=[ok({requestId:'r1'}),ok({requestId:'r1'}),ok({requestId:'r1'})];
  assert.equal(evaluateSubmitRace(same,goodSubmitData).status,'PASS');
  assert.equal(evaluateSubmitRace([ok({requestId:'r1'}),ok({requestId:'r2'})],goodSubmitData).status,'FAIL','two different requests = duplicate');
  assert.equal(evaluateSubmitRace(same,{...goodSubmitData,requests:2}).status,'FAIL','API OK is not data proof');
  assert.equal(evaluateSubmitRace(same,{...goodSubmitData,submittedCount:2}).status,'FAIL','quota double-counted');
  assert.equal(evaluateSubmitRace([...same,err('OPERATION_FAILED')],goodSubmitData).status,'FAIL','unexpected error');
});

test('C2 passes when OK responses agree, losers only see INVALID_REQUEST_STATE, and exactly one vehicle/QR exists',()=>{
  const a=ok({vehicleId:'v1',qrId:'q1',qrToken:'t1'});
  assert.equal(evaluateApproveRace([a,err('INVALID_REQUEST_STATE'),err('INVALID_REQUEST_STATE')],goodApproveData).status,'PASS');
  assert.equal(evaluateApproveRace([a,a],goodApproveData).status,'PASS','idempotent replay returns the same vehicle/QR');
  assert.equal(evaluateApproveRace([a,ok({vehicleId:'v1',qrId:'q2',qrToken:'t2'})],goodApproveData).status,'FAIL','two QRs issued');
  assert.equal(evaluateApproveRace([a],{...goodApproveData,activeQr:2}).status,'FAIL');
  assert.equal(evaluateApproveRace([a,err('OPERATION_FAILED')],goodApproveData).status,'FAIL');
});

test('gates: no write gate, no probe gate or a bad URL → BLOCKED before any network call',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;throw new Error('must not be called');};
  const base={P6VC_ALLOW_OWNER_DEV_WRITES:'RUN_SYNTHETIC_OWNER_DEV',P6VC_ALLOW_FIRESTORE_DEV_PROBE:'RUN_SYNTHETIC_FIRESTORE_PROBE',
    GOOGLE_APPLICATION_CREDENTIALS:'x',P6VC_GAS_EXEC_URL:'https://script.google.com/macros/s/abc/exec',P6VC_ADMIN_USER:'a',P6VC_ADMIN_PASS:'b'};
  for(const [patch,reason] of [[{P6VC_ALLOW_OWNER_DEV_WRITES:''},'MISSING_WRITE_GATE'],[{P6VC_ALLOW_FIRESTORE_DEV_PROBE:''},'MISSING_FIRESTORE_PROBE_GATE'],
    [{P6VC_GAS_EXEC_URL:'http://evil.example/exec'},'INVALID_EXEC_URL'],[{P6VC_ADMIN_PASS:''},'MISSING_ADMIN_CREDENTIALS']]){
    const r=await runConcurrency({env:{...base,...patch},fetchImpl,persist:false});
    assert.equal(r.status,'BLOCKED');assert.equal(r.reason,reason);
  }
  assert.equal(calls,0);
});
