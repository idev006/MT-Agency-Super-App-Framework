// F3a offline proof: the Firestore adapter + the REAL REST gateway together satisfy the
// IDENTICAL store-port contract the Sheets adapter passes (drop-in guarantee, D-E1 Option 2),
// over a fake server enforcing the live-calibrated REST contract. No credentials/network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {createFirestoreStore} from '../src/infrastructure/persistence/firestore/FirestoreStore.js';
import {createFirestoreRestGateway} from '../src/infrastructure/persistence/firestore/FirestoreRestGateway.js';
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
  assert.equal(fake.state.plain('vc_users','u1')._seq,1,'ordering field persisted server-side');
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
  assert.equal(fake.state.plain('__p6vc_seq','vc_users').value,1,'sequence counter not advanced by rolled-back tx');
});