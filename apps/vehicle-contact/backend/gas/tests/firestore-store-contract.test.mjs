// F2 offline proof: the Firestore adapter is a drop-in for the SAME store-port contract
// the Sheets adapter passes (D-E1 Option 2). Runs against an in-memory fake of the
// Firestore document gateway — no live GCP project, credentials or network needed.
// The real REST + service-account-OAuth gateway (UrlFetchApp) is F3a
// (FirestoreRestGateway.js), proven offline in firestore-store-rest-contract.test.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {createFirestoreStore} from '../src/infrastructure/persistence/firestore/FirestoreStore.js';
import {runStorePortContract} from './store-port-contract.test.mjs';

const COLS=DATABASE_SCHEMA.tables.vc_users.columns.map(c=>c.name);
function rec(id,over={}){
  const base={user_id:id,username_normalized:'user-'+id,display_name:'User '+id,status:'ACTIVE',
    created_at:'2026-11-22T00:00:00.000Z',updated_at:'2026-11-22T00:00:00.000Z'};
  const r={};for(const c of COLS)r[c]=over[c]!==undefined?over[c]:(base[c]!==undefined?base[c]:'');
  return r;
}

// In-memory Firestore document gateway. Mirrors the semantics the adapter relies on:
// create-if-absent (ALREADY_EXISTS), equality where, orderBy+limit, and an atomic
// runTransaction (clone -> apply -> commit, rollback on throw). The base gateway reads
// the live db dynamically so a committed transaction is visible to subsequent reads.
function createFakeFirestore(){
  let db=new Map();
  const clone=src=>new Map([...src].map(([k,v])=>[k,new Map([...v].map(([id,f])=>[id,{...f}]))]));
  function makeGateway(getState,setState){
    const coll=name=>{const s=getState();if(!s.has(name))s.set(name,new Map());return s.get(name);};
    const fail=(msg,code)=>{throw Object.assign(new Error(msg),{code});};
    const gw={
      get(name,id){const f=coll(name).get(id);return f?{...f}:null;},
      create(name,id,fields){const m=coll(name);if(m.has(id))fail('ALREADY_EXISTS','ALREADY_EXISTS');m.set(id,{...fields});return id;},
      update(name,id,fields){const m=coll(name);if(!m.has(id))fail('NOT_FOUND','NOT_FOUND');m.set(id,{...m.get(id),...fields});},
      delete(name,id){const m=coll(name);if(!m.has(id))fail('NOT_FOUND','NOT_FOUND');m.delete(id);},
      query(name,{where=[],orderBy,limit}={}){
        let docs=[...coll(name).entries()].map(([id,fields])=>({id,fields:{...fields}}));
        for(const w of where)docs=docs.filter(d=>d.fields[w.field]===w.value);
        if(orderBy)docs.sort((a,b)=>{const av=a.fields[orderBy.field],bv=b.fields[orderBy.field];const r=av<bv?-1:av>bv?1:0;return orderBy.direction==='desc'?-r:r;});
        if(limit!==undefined)docs=docs.slice(0,limit);
        return docs;
      },
      runTransaction(fn){
        const txState=clone(getState());
        const tx=makeGateway(()=>txState,()=>{});
        tx.runTransaction=nested=>nested(tx); // already inside a transaction
        const result=fn(tx);                  // throws => db untouched (atomic rollback)
        setState(txState);
        return result;
      }
    };
    return gw;
  }
  return makeGateway(()=>db,s=>{db=s;});
}

test('Firestore adapter satisfies the identical store port contract (offline fake gateway)',()=>{
  runStorePortContract(assert,createFirestoreStore({firestore:createFakeFirestore()}));
});

test('Firestore insertion order is persisted in the backend, not adapter memory',()=>{
  const firestore=createFakeFirestore();
  const a=createFirestoreStore({firestore});
  a.insert('vc_users',rec('u1'));a.insert('vc_users',rec('u2'));a.insert('vc_users',rec('u3'));
  const b=createFirestoreStore({firestore}); // fresh adapter instance, same backend
  assert.deepEqual(b.list('vc_users').map(r=>r.user_id),['u1','u2','u3'],'oldest-first survives a new adapter');
  assert.deepEqual(b.listNewest('vc_users',{},2).map(r=>r.user_id),['u3','u2'],'newest window survives a new adapter');
  assert.equal(b.one('vc_users',{user_id:'u1'}).status,'ACTIVE','canonical fields read back without the internal ordering field');
  assert.equal(Object.prototype.hasOwnProperty.call(b.one('vc_users',{user_id:'u1'}),'_seq'),false,'internal _seq never leaks');
});

test('Firestore sequence() is a real transaction: commits on success, rolls back on failure',()=>{
  const store=createFirestoreStore({firestore:createFakeFirestore()});
  store.insert('vc_users',rec('u1'));
  const out=store.sequence(tx=>{tx.update('vc_users',{user_id:'u1'},{status:'SUSPENDED'});return tx.one('vc_users',{user_id:'u1'}).status;});
  assert.equal(out,'SUSPENDED','transactional read sees its own write');
  assert.equal(store.one('vc_users',{user_id:'u1'}).status,'SUSPENDED','committed write persists');
  assert.throws(()=>store.sequence(tx=>{tx.insert('vc_users',rec('u2'));throw new Error('boom');}),/boom/);
  assert.equal(store.one('vc_users',{user_id:'u2'}),null,'failed transaction rolled back the insert');
  assert.equal(store.one('vc_users',{user_id:'u1'}).status,'SUSPENDED','rollback left prior committed state intact');
});