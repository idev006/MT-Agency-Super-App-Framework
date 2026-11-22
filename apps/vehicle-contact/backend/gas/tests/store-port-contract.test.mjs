// Adapter-agnostic contract for the persistence "black box" (store port).
// The runtime API (55 ops) depends ONLY on these 8 methods, injected at the
// composition root. Any adapter — Sheets, in-memory, Firestore — MUST satisfy
// this identical suite so the engine is swappable without touching use-cases.
// D-E1 Option 2 (owner-ratified 2026-11-22): keep the Sheets adapter, add a
// Firestore adapter behind the same port. See E1_INDEXED_DATASTORE_MIGRATION_DESIGN.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {createSheetStore} from '../src/infrastructure/persistence/sheets/SheetStore.js';

const COLS=DATABASE_SCHEMA.tables.vc_users.columns.map(c=>c.name);
function row(id,over={}){
  const base={user_id:id,username_normalized:'user-'+id,display_name:'User '+id,status:'ACTIVE',
    created_at:'2026-11-22T00:00:00.000Z',updated_at:'2026-11-22T00:00:00.000Z'};
  const r={};for(const c of COLS)r[c]=over[c]!==undefined?over[c]:(base[c]!==undefined?base[c]:'');
  return r;
}

// Reusable across adapters: a future Firestore adapter test imports this and
// runs it against createFirestoreStore, proving drop-in interchangeability.
export function runStorePortContract(a,store){
  // one: null when absent
  a.equal(store.one('vc_users',{user_id:'absent'}),null,'one returns null when no match');
  // insert + read back
  const u1=store.insert('vc_users',row('u1'));
  a.equal(u1.user_id,'u1','insert returns the record');
  a.equal(store.one('vc_users',{user_id:'u1'}).username_normalized,'user-u1','persisted value reads back');
  // primary-key uniqueness
  a.throws(()=>store.insert('vc_users',row('u1')),/DUPLICATE_KEY/,'duplicate primary key rejected');
  // required-field validation
  a.throws(()=>store.insert('vc_users',row('u2',{user_id:''})),/REQUIRED_FIELD/,'missing required field rejected');
  // reads return copies, never the mutable cached row
  const c=store.one('vc_users',{user_id:'u1'});c.status='HACKED';
  a.equal(store.one('vc_users',{user_id:'u1'}).status,'ACTIVE','reads expose copies, not internal state');
  // list preserves insertion order
  store.insert('vc_users',row('u2'));
  a.deepEqual(store.list('vc_users').map(r=>r.user_id),['u1','u2'],'list is oldest-first insertion order');
  // bounded windows
  a.deepEqual(store.list('vc_users',{},1).map(r=>r.user_id),['u1'],'list limit takes the oldest window');
  a.deepEqual(store.listNewest('vc_users',{},1).map(r=>r.user_id),['u2'],'listNewest limit takes the newest window');
  // limit guards
  for(const bad of [0,5001,1.5]){
    a.throws(()=>store.list('vc_users',{},bad),/INVALID_LIMIT/,'list rejects invalid limit '+bad);
    a.throws(()=>store.listNewest('vc_users',{},bad),/INVALID_LIMIT/,'listNewest rejects invalid limit '+bad);
  }
  // filter is equality conjunction; one fails closed on ambiguity
  store.insert('vc_users',row('u3'));
  a.equal(store.list('vc_users',{status:'ACTIVE'}).length,3,'filter matches all equal rows');
  a.throws(()=>store.one('vc_users',{status:'ACTIVE'}),/DUPLICATE_KEY/,'one fails closed on multiple matches');
  // update merges and persists
  const up=store.update('vc_users',{user_id:'u1'},{status:'SUSPENDED'});
  a.equal(up.status,'SUSPENDED','update returns merged record');
  a.equal(store.one('vc_users',{user_id:'u1'}).status,'SUSPENDED','update persisted');
  a.throws(()=>store.update('vc_users',{user_id:'absent'},{status:'X'}),/NOT_FOUND/,'update requires exactly one match');
  a.throws(()=>store.update('vc_users',{user_id:'u2'},{not_a_column:'x'}),/INVALID_PATCH/,'update rejects unknown patch keys');
  // remove deletes exactly one
  a.equal(store.remove('vc_users',{user_id:'u2'}),true,'remove returns true');
  a.equal(store.one('vc_users',{user_id:'u2'}),null,'removed row is gone');
  a.throws(()=>store.remove('vc_users',{user_id:'absent'}),/NOT_FOUND/,'remove requires exactly one match');
  // concurrency / transaction seams
  a.equal(store.withLock(()=>'locked-ok'),'locked-ok','withLock runs and returns the callback result');
  a.equal(store.sequence(()=>'seq-ok'),'seq-ok','sequence runs and returns the callback result');
  // unknown logical table fails closed
  a.throws(()=>store.one('vc_missing',{}),/UNKNOWN_TABLE/,'unknown table rejected');
}

// Subject 1: the production Sheets adapter, over a bounded fake Spreadsheet.
function makeSheetStore(){
  const rows=[COLS.slice()];
  const sheet={
    getLastRow(){return rows.length;},
    getLastColumn(){return COLS.length;},
    getRange(r,c,h,w){return{
      getValues(){return rows.slice(r-1,r-1+h).map(x=>x.slice());},
      setValues(next){next.forEach((v,i)=>rows[r-1+i]=v.slice());},
      setNumberFormats(){}
    };},
    deleteRow(r){rows.splice(r-1,1);}
  };
  const spreadsheetApp={openById(){return{getSheetByName(name){return name==='vc_users'?sheet:null;}};},flush(){}};
  const lockService={getScriptLock(){return{tryLock(){return true;},releaseLock(){}};}};
  return createSheetStore({spreadsheetApp,spreadsheetId:'contract-sheet',lockService});
}

// Subject 2: an in-memory reference adapter (same shape the acceptance harness
// uses to run the full real API without Sheets). Proves the port is store-agnostic.
function makeMemoryStore(){
  const tables=new Map(Object.keys(DATABASE_SCHEMA.tables).map(t=>[t,[]]));
  const cols=t=>DATABASE_SCHEMA.tables[t].columns;
  const data=t=>{if(!tables.has(t))throw Error('UNKNOWN_TABLE:'+t);return tables.get(t);};
  const where=(r,f)=>Object.entries(f||{}).every(([k,v])=>r[k]===v);
  const copy=x=>structuredClone(x);
  const lim=l=>{if(!Number.isSafeInteger(l)||l<1||l>5000)throw Error('INVALID_LIMIT');};
  return{
    one(t,f){const h=data(t).filter(x=>where(x,f));if(h.length>1)throw Error('DUPLICATE_KEY');return h.length?copy(h[0]):null;},
    list(t,f={},l=5000){lim(l);return copy(data(t).filter(x=>where(x,f)).slice(0,l));},
    listNewest(t,f={},l=5000){lim(l);return copy(data(t).filter(x=>where(x,f)).slice(-l));},
    insert(t,r){const cs=cols(t);for(const k of cs)if(k.required&&(r[k.name]===undefined||r[k.name]===''))throw Error('REQUIRED_FIELD:'+k.name);
      const key=cs.find(k=>k.key==='primary')?.name;if(key&&data(t).some(x=>x[key]===r[key]))throw Error('DUPLICATE_KEY');
      data(t).push(copy(r));return copy(r);},
    update(t,f,p){if(Object.keys(p||{}).some(k=>!cols(t).some(c=>c.name===k)))throw Error('INVALID_PATCH');
      const h=data(t).filter(x=>where(x,f));if(h.length!==1)throw Error(h.length?'DUPLICATE_KEY':'NOT_FOUND');
      Object.assign(h[0],copy(p));return copy(h[0]);},
    remove(t,f){const h=data(t).filter(x=>where(x,f));if(h.length!==1)throw Error(h.length?'DUPLICATE_KEY':'NOT_FOUND');
      data(t).splice(data(t).indexOf(h[0]),1);return true;},
    withLock(fn){return fn();},
    sequence(fn){return fn();}
  };
}

test('Sheets adapter satisfies the store port contract',()=>runStorePortContract(assert,makeSheetStore()));
test('in-memory reference adapter satisfies the same store port contract',()=>runStorePortContract(assert,makeMemoryStore()));