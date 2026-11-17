import assert from 'node:assert/strict';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {createSheetStore} from '../src/infrastructure/persistence/sheets/SheetStore.js';

const headers=DATABASE_SCHEMA.tables.vc_users.columns.map(c=>c.name);
const row=(values={})=>headers.map(c=>values[c]??'');
const rows=[headers.slice(),row({user_id:'u1',username_normalized:'admin',display_name:'Initial Admin',status:'ACTIVE'})];
const trace={open:0,reads:0,range:0,flush:0,locks:0,release:0,legacy:0};
const sheet={
 getLastRow(){return rows.length;},
 getLastColumn(){return headers.length;},
 getDataRange(){trace.legacy++;throw new Error('getDataRange must not be used with GAS Sheets');},
 getRange(r,c,h,w){
  trace.range++;
  assert.equal(c,1);assert.equal(w,headers.length);
  return {
   getValues(){trace.reads++;return rows.slice(r-1,r-1+h).map(a=>a.slice());},
   setValues(next){assert.equal(next.length,h);next.forEach((v,i)=>rows[r-1+i]=v.slice());}
  };
 },
 appendRow(v){rows.push(v.slice());},
 deleteRow(r){rows.splice(r-1,1);}
};
const spreadsheetApp={
 openById(id){trace.open++;assert.equal(id,'staging-sheet');return{getSheetByName(name){return name==='vc_users'?sheet:null}};},
 flush(){trace.flush++;}
};
const lockService={getScriptLock(){return{
 tryLock(wait){trace.locks++;assert.equal(wait,15000);return true;},
 releaseLock(){trace.release++;}
}}};
const store=createSheetStore({spreadsheetApp,spreadsheetId:'staging-sheet',lockService});
assert.equal(store.one('vc_users',{user_id:'u1'}).status,'ACTIVE');
assert.equal(store.one('vc_users',{username_normalized:'admin'}).user_id,'u1');
assert.equal(store.list('vc_users').length,1);
assert.equal(trace.open,1,'openById exactly once per GAS invocation');
assert.equal(trace.reads,1,'one Sheets data read for repeated reads of same table');
assert.equal(trace.legacy,0);
const copied=store.one('vc_users',{user_id:'u1'});
copied.status='SUSPENDED';
assert.equal(store.one('vc_users',{user_id:'u1'}).status,'ACTIVE','never expose mutable cached row');
store.update('vc_users',{user_id:'u1'},{status:'SUSPENDED'});
assert.equal(store.one('vc_users',{user_id:'u1'}).status,'SUSPENDED','invalidate cache on update');
store.insert('vc_users',{user_id:'u2',username_normalized:'testuser'});
assert.equal(store.list('vc_users').length,2,'invalidate cache on insert');
assert.throws(()=>store.insert('vc_users',{user_id:'u2'}),/DUPLICATE_KEY/);
rows[1][headers.indexOf('status')]='ACTIVE';
assert.equal(store.one('vc_users',{user_id:'u1'}).status,'SUSPENDED','cached before lock');
assert.equal(store.withLock(()=>store.one('vc_users',{user_id:'u1'}).status),'ACTIVE','fresh read after lock');
assert.equal(trace.locks,1);
assert.equal(trace.flush,1);
assert.equal(trace.release,1);
store.remove('vc_users',{user_id:'u2'});
assert.equal(store.one('vc_users',{user_id:'u2'}),null,'invalidate cache on delete');
assert.equal(store.sequence(()=>42),42);
const bad=store.insert('vc_users',{user_id:'u3',display_name:'=HYPERLINK("https://bad.invalid","x")'});
assert.equal(bad.user_id,'u3');
assert.equal(rows.at(-1)[headers.indexOf('display_name')].startsWith("'="),true,'Sheets formula injection must be escaped');
assert.throws(()=>store.one('vc_missing',{}),/UNKNOWN_TABLE/);
const cappedSheet={...sheet,getLastRow(){return 10002;}};
const cappedApp={openById(){return{getSheetByName(){return cappedSheet;}}},flush(){}};
const capped=createSheetStore({spreadsheetApp:cappedApp,spreadsheetId:'staging-sheet',lockService});
assert.throws(()=>capped.list('vc_users'),/SCAN_LIMIT_EXCEEDED/);
assert.equal(trace.legacy,0);
console.log('GAS SheetStore: one open, bounded one-read snapshot, mutation/lock invalidation, flush and safe text PASSED');
