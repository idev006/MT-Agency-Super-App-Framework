// C6 (2026-11-24): changes.review must be atomic, version-guarded and idempotent.
// Runs the real VehicleOperations on the real Firestore adapter + REST gateway over the fake
// server, which enforces per-document updateTime preconditions like live Firestore.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFirestoreStore} from '../src/infrastructure/persistence/firestore/FirestoreStore.js';
import {createFirestoreRestGateway} from '../src/infrastructure/persistence/firestore/FirestoreRestGateway.js';
import {createVehicleOperations} from '../src/application/use-cases/VehicleOperations.js';
import {createFakeFirestoreRest,makeFakeUtilities,fakeServiceAccountKey,PROJECT,DATABASE} from './fake-firestore-rest-server.mjs';

const AT='2026-11-24T00:00:00.000Z';
function boot(){
  const fake=createFakeFirestoreRest(),key=fakeServiceAccountKey();
  const gw=createFirestoreRestGateway({utilities:makeFakeUtilities(),urlFetchApp:fake,clientEmail:key.client_email,
    privateKey:key.private_key,projectId:PROJECT,databaseId:DATABASE,clock:()=>AT});
  const store=createFirestoreStore({firestore:gw});
  let n=0;
  const security={now:()=>AT,secretToken:()=>'t'+String(++n).padStart(63,'0'),sha256:v=>'h'+String(v).length,deriveSecret:p=>'d:'+p};
  // The adapter is frozen; the use case gets a view whose readMany a test can swap (race simulation).
  const hooks={readMany:reqs=>store.readMany(reqs)};
  const ops=createVehicleOperations({store:{...store,readMany:reqs=>hooks.readMany(reqs)},security,campaigns:{},references:{}});
  store.insert('vc_vehicles',{vehicle_id:'v1',plate_normalized:'TST1',province_code:'10',vehicle_type:'CAR',make:'M',model:'Old',color:'W',
    status:'ACTIVE',version:1,created_at:AT,updated_at:AT,created_by:'x',updated_by:'x',plate_type:'P',organization_id:'o'});
  store.insert('vc_vehicle_contacts',{contact_id:'k1',vehicle_id:'v1',display_name:'Old Name',phone_e164:'+66810000001',relationship:'OWNER',
    is_primary:true,status:'ACTIVE',verified_at:AT,created_at:AT,updated_at:AT});
  const change=(id,delta)=>store.insert('vc_change_requests',{change_id:id,vehicle_id:'v1',proposed_delta:JSON.stringify(delta),
    status:'PENDING',submitted_by:'owner',submitted_at:AT,reviewed_by:'',reviewed_at:''});
  return {fake,store,ops,change,hooks};
}
const review=(ops,requestId,decision,user='rev1')=>ops['changes.review']({requestId,decision},{userId:user,permissions:['vehicle.change.approve']});

// Simulate the live race: the first `count` readMany calls of the next review return a snapshot
// captured BEFORE a competing review committed (stale rows AND stale versions).
function staleReads({store,hooks},count){
  const real=reqs=>store.readMany(reqs),snapshots=[];
  return {
    capture(reqs){snapshots.push(real(reqs));},
    arm(){let i=0;hooks.readMany=reqs=>(i<count&&snapshots[i]?snapshots[i++]:real(reqs));},
    restore(){hooks.readMany=real;}
  };
}

test('C6-01 approve writes vehicle, contact, request and audit in ONE commit, version +1 exactly once',()=>{
  const {fake,store,ops,change}=boot();
  change('c1',{model:'New',contactPhone:'+66819999999'});
  const commitsBefore=fake.state.requests.filter(r=>/:commit$/.test(r.url)).length;
  assert.deepEqual(review(ops,'c1','APPROVE'),{requestId:'c1',status:'APPROVE'});
  assert.equal(fake.state.requests.filter(r=>/:commit$/.test(r.url)).length-commitsBefore,1,'exactly one commit');
  const v=store.one('vc_vehicles',{vehicle_id:'v1'});
  assert.equal(v.model,'New');assert.equal(Number(v.version),2);
  assert.equal(store.one('vc_vehicle_contacts',{contact_id:'k1'}).phone_e164,'+66819999999');
  assert.equal(store.one('vc_change_requests',{change_id:'c1'}).status,'APPROVED');
  assert.equal(store.list('vc_change_audit',{entity_id:'c1'}).length,1);
});

test('C6-02 a repeated same decision replays (idempotent, no second write); a different decision is refused',()=>{
  const {store,ops,change}=boot();
  change('c1',{model:'New'});
  review(ops,'c1','APPROVE');
  assert.deepEqual(review(ops,'c1','APPROVE'),{requestId:'c1',status:'APPROVE',replayed:true});
  assert.equal(Number(store.one('vc_vehicles',{vehicle_id:'v1'}).version),2,'not applied twice');
  assert.equal(store.list('vc_change_audit',{entity_id:'c1'}).length,1,'no second audit');
  assert.throws(()=>review(ops,'c1','REJECT'),/INVALID_REQUEST_STATE/);
});

test('C6-03 race: two approvals of ONE request that both read PENDING → applied once, loser replays',()=>{
  const ctx=boot(),{store,ops,change}=ctx;
  change('c1',{model:'New'});
  const race=staleReads(ctx,2);
  // Loser reads request + vehicle (both PENDING / version 1) ...
  race.capture([{kind:'versioned',name:'vc_change_requests',filter:{change_id:'c1'}}]);
  race.capture([{kind:'versioned',name:'vc_vehicles',filter:{vehicle_id:'v1'}}]);
  // ... the winner commits ...
  review(ops,'c1','APPROVE','winner');
  // ... then the loser writes with its stale versions.
  race.arm();
  const out=review(ops,'c1','APPROVE','loser');
  race.restore();
  assert.equal(out.replayed,true,'loser re-reads after WRITE_CONFLICT and replays');
  const v=store.one('vc_vehicles',{vehicle_id:'v1'});
  assert.equal(Number(v.version),2,'version +1 exactly once (the old code reached 3)');
  assert.equal(v.updated_by,'winner');
  assert.equal(store.list('vc_change_audit',{entity_id:'c1'}).length,1);
});

test('C6-04 race: APPROVE vs REJECT on one request → exactly one outcome, consistent data',()=>{
  const ctx=boot(),{store,ops,change}=ctx;
  change('c1',{model:'New'});
  const race=staleReads(ctx,1);
  race.capture([{kind:'versioned',name:'vc_change_requests',filter:{change_id:'c1'}}]);
  review(ops,'c1','APPROVE','approver');
  race.arm();
  assert.throws(()=>review(ops,'c1','REJECT','rejecter'),/INVALID_REQUEST_STATE/);
  race.restore();
  assert.equal(store.one('vc_change_requests',{change_id:'c1'}).status,'APPROVED');
  assert.equal(store.one('vc_vehicles',{vehicle_id:'v1'}).model,'New');
});

test('C6-05 race: two DIFFERENT change requests on one vehicle → both apply, no lost update, version +2',()=>{
  const ctx=boot(),{store,ops,change}=ctx;
  change('c1',{model:'New'});change('c2',{color:'Red'});
  const race=staleReads(ctx,2);
  race.capture([{kind:'versioned',name:'vc_change_requests',filter:{change_id:'c2'}}]);
  race.capture([{kind:'versioned',name:'vc_vehicles',filter:{vehicle_id:'v1'}}]);
  review(ops,'c1','APPROVE','a');
  race.arm();
  assert.deepEqual(review(ops,'c2','APPROVE','b'),{requestId:'c2',status:'APPROVE'},'stale vehicle version → conflict → fresh retry');
  race.restore();
  const v=store.one('vc_vehicles',{vehicle_id:'v1'});
  assert.equal(v.model,'New','first change kept (the old code could overwrite it with a stale row)');
  assert.equal(v.color,'Red');
  assert.equal(Number(v.version),3);
});

test('C6-06 a failing write leaves NOTHING applied (no vehicle change while the request stays PENDING)',()=>{
  const {store,ops,change}=boot();
  change('c1',{model:'New',contactName:'New Name'});
  store.remove('vc_vehicle_contacts',{contact_id:'k1'});
  assert.throws(()=>review(ops,'c1','APPROVE'),/CONTACT_NOT_FOUND/);
  assert.equal(store.one('vc_vehicles',{vehicle_id:'v1'}).model,'Old');
  assert.equal(Number(store.one('vc_vehicles',{vehicle_id:'v1'}).version),1);
  assert.equal(store.one('vc_change_requests',{change_id:'c1'}).status,'PENDING');
});
