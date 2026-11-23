// F3a offline proof: the Firestore adapter + the REAL REST gateway together satisfy the
// IDENTICAL store-port contract the Sheets adapter passes (drop-in guarantee, D-E1 Option 2),
// over a fake server enforcing the live-calibrated REST contract. No credentials/network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {createFirestoreStore} from '../src/infrastructure/persistence/firestore/FirestoreStore.js';
import {createFirestoreRestGateway} from '../src/infrastructure/persistence/firestore/FirestoreRestGateway.js';
import {createVehicleOperations} from '../src/application/use-cases/VehicleOperations.js';
import {runStorePortContract} from './store-port-contract.test.mjs';
import {createFakeFirestoreRest,makeFakeUtilities,fakeServiceAccountKey,PROJECT,DATABASE} from './fake-firestore-rest-server.mjs';

const COLS=DATABASE_SCHEMA.tables.vc_users.columns.map(c=>c.name);
function rec(id,over={}){
  const base={user_id:id,username_normalized:'user-'+id,display_name:'User '+id,status:'ACTIVE',
    created_at:'2026-11-22T00:00:00.000Z',updated_at:'2026-11-22T00:00:00.000Z'};
  const r={};for(const c of COLS)r[c]=over[c]!==undefined?over[c]:(base[c]!==undefined?base[c]:'');
  return r;
}
function makeStore(fake){
  const key=fakeServiceAccountKey();
  const gw=createFirestoreRestGateway({utilities:makeFakeUtilities(),urlFetchApp:fake,
    clientEmail:key.client_email,privateKey:key.private_key,projectId:PROJECT,databaseId:DATABASE,
    clock:()=>'2026-11-22T00:00:00.000Z'});
  return createFirestoreStore({firestore:gw});
}

test('Firestore adapter + real REST gateway satisfy the identical store port contract',()=>{
  runStorePortContract(assert,makeStore(createFakeFirestoreRest()));
});

test('insertion order persists in Firestore _seq, not adapter memory (REST path)',()=>{
  const fake=createFakeFirestoreRest();
  const a=makeStore(fake);
  a.insert('vc_users',rec('u1'));a.insert('vc_users',rec('u2'));a.insert('vc_users',rec('u3'));
  const b=makeStore(fake);
  assert.deepEqual(b.list('vc_users').map(r=>r.user_id),['u1','u2','u3']);
  assert.deepEqual(b.listNewest('vc_users',{},2).map(r=>r.user_id),['u3','u2']);
  assert.equal(Object.prototype.hasOwnProperty.call(b.one('vc_users',{user_id:'u1'}),'_seq'),false,'_seq never leaks');
  const seqs=['u1','u2','u3'].map(id=>fake.state.plain('vc_users',id)._seq);
  assert.ok(seqs.every(Number.isSafeInteger)&&seqs[0]<seqs[1]&&seqs[1]<seqs[2],'time-ordered _seq persisted server-side, strictly increasing');
});

test('sequence() over REST commits on success and rolls back on failure',()=>{
  const fake=createFakeFirestoreRest();
  const store=makeStore(fake);
  store.insert('vc_users',rec('u1'));
  const out=store.sequence(tx=>{tx.update('vc_users',{user_id:'u1'},{status:'SUSPENDED'});return tx.one('vc_users',{user_id:'u1'}).status;});
  assert.equal(out,'SUSPENDED');
  assert.equal(store.one('vc_users',{user_id:'u1'}).status,'SUSPENDED');
  assert.throws(()=>store.sequence(tx=>{tx.insert('vc_users',rec('u2'));throw new Error('boom');}),/boom/);
  assert.equal(store.one('vc_users',{user_id:'u2'}),null,'rolled back insert left no residue');
  assert.equal(fake.state.plain('__p6vc_seq','vc_users'),null,'W1a: no counter document is maintained any more');
});

test('write round-trips are minimized: insert/update/remove by PK = ONE commit each (W1a)',()=>{
  const fake=createFakeFirestoreRest();
  const store=makeStore(fake);
  store.one('vc_users',{user_id:'warm'}); // prime the cached OAuth token
  const count=()=>fake.state.requests.length;
  let n=count();
  store.insert('vc_users',rec('u1'));
  assert.equal(count()-n,1,'insert = one commit with exists:false (no counter read, no transaction)');
  assert.ok(!fake.state.requests.slice(-2).some(r=>r.url.endsWith(':beginTransaction')),'insert never calls :beginTransaction');
  n=count();
  const up=store.update('vc_users',{user_id:'u1'},{status:'SUSPENDED'});
  assert.equal(count()-n,1,'update by PK = one field-masked commit (exists:true)');
  assert.equal(up.status,'SUSPENDED','update still returns the merged record');
  n=count();
  assert.equal(store.remove('vc_users',{user_id:'u1'}),true);
  assert.equal(count()-n,1,'remove by PK = one delete commit (exists:true)');
  const verbs=fake.state.requests.slice(-4).map(r=>r.url.split('/').pop());
  assert.ok(!verbs.includes(':beginTransaction'),'standalone update/remove avoid beginTransaction');
});

function vehicleRec(id,over={}){
  const cols=DATABASE_SCHEMA.tables.vc_vehicles.columns;
  const base={vehicle_id:id,plate_normalized:'TST12345678',province_code:'10',vehicle_type:'CAR',make:'SYNTHETIC',
    model:'AUTOMATED',color:'WHITE',status:'ACTIVE',version:1,created_at:'2026-11-23T00:00:00.000Z',
    updated_at:'2026-11-23T00:00:00.000Z',created_by:'u1',updated_by:'u1',plate_type:'NORMAL',organization_id:'org1',owner_user_id:'u1'};
  const r={};for(const c of cols)r[c.name]=over[c.name]!==undefined?over[c.name]:(base[c.name]!==undefined?base[c.name]:'');
  return r;
}

test('vehicles.detail round-trips minimized: lookup audit is a plain append-only insert, not a redundant sequence() transaction (Slice F)',()=>{
  const fake=createFakeFirestoreRest();
  const store=makeStore(fake);
  const security={now:()=>'2026-11-23T00:00:00.000Z',secretToken:()=>randomUUID()};
  const ops=createVehicleOperations({store,security,campaigns:{},references:{}});
  store.insert('vc_vehicles',vehicleRec('v1'));
  store.one('vc_users',{user_id:'warm'}); // prime the cached OAuth token
  const count=()=>fake.state.requests.length;
  const actor={userId:'u1',permissions:['vehicle.lookup','vehicle.contact.read','vehicle.photos.read']};
  const n=count(),r0=fake.state.rounds;
  const result=ops['vehicles.detail']({vehicleId:'v1'},actor);
  const calls=count()-n,rounds=fake.state.rounds-r0;
  assert.equal(result.vehicleId,'v1');
  // activeVehicle runQuery(1) + lookupAudit insert(2: prefetch batchGet w/ newTransaction + commit)
  //   + contacts runQuery(1) + photos runQuery(1) = 5.
  // The removed redundant sequence() wrapper around the single insert cost 5 alone (detail was 8).
  assert.equal(calls,4,'detail = 1 vehicle read + 1 audit insert commit + 1 contacts + 1 photos');
  assert.equal(rounds,3,'T2+W1a: vehicle read → audit commit → contacts+photos in one parallel round');
  // The append-only audit is still persisted AND ordered (MediaRetention reads vc_lookup_audit via store.list).
  const audits=store.list('vc_lookup_audit',{vehicle_id:'v1'});
  assert.equal(audits.length,1,'lookup audit persisted');
  assert.equal(audits[0].result,'FOUND');
  assert.ok(Number.isSafeInteger(fake.state.plain('vc_lookup_audit',audits[0].audit_id)._seq),'_seq ordering field persisted by plain insert');
});
test('W1a writeMany: several writes in ONE commit, all-or-nothing on any precondition failure',()=>{
  const fake=createFakeFirestoreRest();
  const store=makeStore(fake);
  store.insert('vc_users',rec('u1'));
  const n=fake.state.requests.length;
  store.writeMany([
    {op:'insert',table:'vc_users',data:rec('u2')},
    {op:'update',table:'vc_users',key:{user_id:'u1'},fields:{status:'SUSPENDED'}}
  ]);
  assert.equal(fake.state.requests.length-n,1,'one commit for two writes');
  assert.equal(store.one('vc_users',{user_id:'u2'}).status,'ACTIVE');
  assert.equal(store.one('vc_users',{user_id:'u1'}).status,'SUSPENDED');
  // u2 already exists → the whole commit is rejected; the update to u1 must NOT apply.
  assert.throws(()=>store.writeMany([
    {op:'update',table:'vc_users',key:{user_id:'u1'},fields:{status:'ACTIVE'}},
    {op:'insert',table:'vc_users',data:rec('u2')}
  ]),/DUPLICATE_KEY/);
  assert.equal(store.one('vc_users',{user_id:'u1'}).status,'SUSPENDED','no partial write');
  assert.throws(()=>store.writeMany([{op:'update',table:'vc_users',key:{status:'x'},fields:{status:'y'}}]),/WRITE_REQUIRES_PRIMARY_KEY/);
  assert.throws(()=>store.writeMany([
    {op:'update',table:'vc_users',key:{user_id:'u1'},fields:{status:'A'}},
    {op:'update',table:'vc_users',key:{user_id:'u1'},fields:{display_name:'B'}}
  ]),/DUPLICATE_WRITE_TARGET/,'live Firestore rejects two writes to one doc per commit; fail early');
});

test('V57 regression: registrations.review only issues queries backed by the live composite indexes (journal = DESC)',()=>{
  const fake=createFakeFirestoreRest({strictIndexes:true});
  // The live DEV DB has the DESC journal index (listNewest) but NOT an ASC one.
  fake.state.addIndex('vc_operation_journal',[{fieldPath:'operation'},{fieldPath:'entity_id'},{fieldPath:'_seq',order:'DESCENDING'}]);
  const store=makeStore(fake);
  let n=0;
  const security={now:()=>'2026-11-23T00:00:00.000Z',secretToken:()=>'t'+String(++n).padStart(63,'0'),
    sha256:v=>'h'+String(v).length,deriveSecret:p=>'derived:'+p};
  const ops=createVehicleOperations({store,security,campaigns:{},references:{}});
  const photos=['FRONT','REAR','LEFT','RIGHT','FRONT_ANGLE'].map((slot,i)=>({photoId:'p'+i,slot,storageRef:'ref'+i,mimeType:'image/png',sizeBytes:10}));
  store.insert('vc_registration_requests',{request_id:'r1',vehicle_id:'v1',campaign_id:'c1',status:'PENDING_APPROVAL',submitted_at:'2026-11-23T00:00:00.000Z',
    reviewed_by:'',reviewed_at:'',idempotency_key:'k1',application_json:JSON.stringify({plate_normalized:'TST1',province_code:'10',plate_type:'NORMAL',
    vehicle_type:'CAR',make:'M',model:'X',color:'W',organization_id:'org1',relationship:'OWNER',contactName:'N',contactPhone:'+66810000001',photos})});
  const out=ops['registrations.review']({requestId:'r1',decision:'APPROVE',platePhotoVerified:true},{userId:'u1'});
  assert.equal(out.status,'APPROVED');
  assert.ok(out.qrToken&&out.qrId);
  assert.equal(store.one('vc_vehicles',{vehicle_id:'v1'}).status,'ACTIVE');
  // An ASC journal query (the V57 bug) is rejected by this strict fake exactly like live Firestore.
  assert.throws(()=>store.list('vc_operation_journal',{operation:'registrations.review',entity_id:'r1'}),/FAILED_PRECONDITION/);
});
