// Adapter-agnostic contract for the persistence "black box" (store port) — ONE contract for every store, synchronous
// (legacy engine) or asynchronous (Node core, VC-ADR-046 phase 2b). Moved here from store-port-contract.test.mjs.
import {DATABASE_SCHEMA} from '../../src/domain/ports/SchemaRepository.js';

const COLS=DATABASE_SCHEMA.tables.vc_users.columns.map(c=>c.name);
function row(id,over={}){
  const base={user_id:id,username_normalized:'user-'+id,display_name:'User '+id,status:'ACTIVE',
    created_at:'2026-11-22T00:00:00.000Z',updated_at:'2026-11-22T00:00:00.000Z'};
  const r={};for(const c of COLS)r[c]=over[c]!==undefined?over[c]:(base[c]!==undefined?base[c]:'');
  return r;
}

// Reusable across adapters: a future Firestore adapter test imports this and
// runs it against createFirestoreStore, proving drop-in interchangeability.
// sync store: every call returns a value; async store: a promise. `await` handles both; `fails` checks a throw or a rejection.
// options.transactions=false: the store has no sequence() yet (the core's async store until phase 3).
export async function runStorePortContract(a,store,{transactions=true}={}){
  const fails=async(fn,re,msg)=>{let err=null;try{await fn();}catch(e){err=e;}a.ok(err&&re.test(err.message),msg+' (got '+(err&&err.message)+')');};
  // one: null when absent
  a.equal(await store.one('vc_users',{user_id:'absent'}),null,'one returns null when no match');
  // insert + read back
  const u1=await store.insert('vc_users',row('u1'));
  a.equal(u1.user_id,'u1','insert returns the record');
  a.equal((await store.one('vc_users',{user_id:'u1'})).username_normalized,'user-u1','persisted value reads back');
  // primary-key uniqueness
  await fails(()=>store.insert('vc_users',row('u1')),/DUPLICATE_KEY/,'duplicate primary key rejected');
  // required-field validation
  await fails(()=>store.insert('vc_users',row('u2',{user_id:''})),/REQUIRED_FIELD/,'missing required field rejected');
  // reads return copies, never the mutable cached row
  const c=await store.one('vc_users',{user_id:'u1'});c.status='HACKED';
  a.equal((await store.one('vc_users',{user_id:'u1'})).status,'ACTIVE','reads expose copies, not internal state');
  // list preserves insertion order
  await store.insert('vc_users',row('u2'));
  a.deepEqual((await store.list('vc_users')).map(r=>r.user_id),['u1','u2'],'list is oldest-first insertion order');
  // bounded windows
  a.deepEqual((await store.list('vc_users',{},1)).map(r=>r.user_id),['u1'],'list limit takes the oldest window');
  a.deepEqual((await store.listNewest('vc_users',{},1)).map(r=>r.user_id),['u2'],'listNewest limit takes the newest window');
  // limit guards
  for(const bad of [0,5001,1.5]){
    await fails(()=>store.list('vc_users',{},bad),/INVALID_LIMIT/,'list rejects invalid limit '+bad);
    await fails(()=>store.listNewest('vc_users',{},bad),/INVALID_LIMIT/,'listNewest rejects invalid limit '+bad);
  }
  // filter is equality conjunction; one fails closed on ambiguity
  await store.insert('vc_users',row('u3'));
  a.equal((await store.list('vc_users',{status:'ACTIVE'})).length,3,'filter matches all equal rows');
  await fails(()=>store.one('vc_users',{status:'ACTIVE'}),/DUPLICATE_KEY/,'one fails closed on multiple matches');
  // update merges and persists
  const up=await store.update('vc_users',{user_id:'u1'},{status:'SUSPENDED'});
  a.equal(up.status,'SUSPENDED','update returns merged record');
  a.equal((await store.one('vc_users',{user_id:'u1'})).status,'SUSPENDED','update persisted');
  await fails(()=>store.update('vc_users',{user_id:'absent'},{status:'X'}),/NOT_FOUND/,'update requires exactly one match');
  await fails(()=>store.update('vc_users',{user_id:'u2'},{not_a_column:'x'}),/INVALID_PATCH/,'update rejects unknown patch keys');
  // remove deletes exactly one
  a.equal(await store.remove('vc_users',{user_id:'u2'}),true,'remove returns true');
  a.equal(await store.one('vc_users',{user_id:'u2'}),null,'removed row is gone');
  await fails(()=>store.remove('vc_users',{user_id:'absent'}),/NOT_FOUND/,'remove requires exactly one match');
  // concurrency / transaction seams
  a.equal(await store.withLock(()=>'locked-ok'),'locked-ok','withLock runs and returns the callback result');
  if(transactions)a.equal(await store.sequence(()=>'seq-ok'),'seq-ok','sequence runs and returns the callback result');
  // unknown logical table fails closed
  await fails(()=>store.one('vc_missing',{}),/UNKNOWN_TABLE/,'unknown table rejected');
}

