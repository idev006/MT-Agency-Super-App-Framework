// F3b-1 offline proof: dual-write keeps Sheets as system of record, mirrors every write
// best-effort to the Firestore shadow, journals divergence (vc_operation_journal binding),
// and replays sequence() write logs only AFTER the primary commits. Reads never touch the
// shadow. Selector + Container dispatch prove the VEHICLE_FIRESTORE_DUALWRITE flag routes
// real traffic; the wrapped store still satisfies the identical F1 store-port contract.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {createSheetStore} from '../src/infrastructure/persistence/sheets/SheetStore.js';
import {createFirestoreStore} from '../src/infrastructure/persistence/firestore/FirestoreStore.js';
import {createFirestoreRestGateway} from '../src/infrastructure/persistence/firestore/FirestoreRestGateway.js';
import {createDualWriteStore} from '../src/infrastructure/persistence/firestore/DualWriteStore.js';
import {createStoreForBackend} from '../src/composition/StoreSelector.js';
import {createApplication} from '../src/composition/Container.js';
import {runStorePortContract} from './store-port-contract.test.mjs';
import {createFakeFirestoreRest,makeFakeUtilities,fakeServiceAccountKey,PROJECT,DATABASE} from './fake-firestore-rest-server.mjs';

const COLS=DATABASE_SCHEMA.tables.vc_users.columns.map(c=>c.name);
function rec(id,over={}){
  const base={user_id:id,username_normalized:'user-'+id,display_name:'User '+id,status:'ACTIVE',
    created_at:'2026-11-22T00:00:00.000Z',updated_at:'2026-11-22T00:00:00.000Z'};
  const r={};for(const c of COLS)r[c]=over[c]!==undefined?over[c]:(base[c]!==undefined?base[c]:'');
  return r;
}
const CLOCK=()=>'2026-11-22T00:00:00.000Z';
function makeFsStore(fake){
  const key=fakeServiceAccountKey();
  const gw=createFirestoreRestGateway({utilities:makeFakeUtilities(),urlFetchApp:fake,
    clientEmail:key.client_email,privateKey:key.private_key,projectId:PROJECT,databaseId:DATABASE,clock:CLOCK});
  return createFirestoreStore({firestore:gw});
}
function makeSheets(tableNames){
  const tables={};const state={opens:0};
  for(const name of tableNames){
    const cols=DATABASE_SCHEMA.tables[name].columns.map(c=>c.name);
    const rows=[cols.slice()];
    const sheet={
      getLastRow(){return rows.length;},getLastColumn(){return cols.length;},
      getRange(r,c,h,w){return{
        getValues(){return rows.slice(r-1,r-1+h).map(x=>x.slice());},
        setValues(next){next.forEach((v,i)=>rows[r-1+i]=v.slice());},
        setNumberFormats(){}
      };},
      deleteRow(r){rows.splice(r-1,1);}
    };
    tables[name]={cols,rows,sheet};
  }
  const spreadsheetApp={openById(){state.opens++;return{getSheetByName:n=>tables[n]?tables[n].sheet:null};},flush(){}};
  const lockService={getScriptLock(){return{tryLock(){return true;},releaseLock(){}};}};
  return {spreadsheetApp,lockService,state,tables};
}
function sheetRows(tables,name){
  const {cols,rows}=tables[name];
  return rows.slice(1).map(r=>Object.fromEntries(cols.map((c,i)=>[c,r[i]])));
}
function makeDual(primary,secondary,journal){return createDualWriteStore({primary,secondary,journal,clock:CLOCK});}
const KEY_JSON=JSON.stringify(fakeServiceAccountKey());
function makeProps(map){return {getProperty:k=>(k in map?map[k]:null)};}

test('DW-01 reads and withLock never touch the shadow',()=>{
  const sheets=makeSheets(['vc_users']);
  const fake=createFakeFirestoreRest();
  const store=makeDual(createSheetStore({spreadsheetApp:sheets.spreadsheetApp,spreadsheetId:'s',lockService:sheets.lockService}),
    makeFsStore(fake),{record:()=>{throw new Error('journal must not be called on reads');}});
  store.insert('vc_users',rec('u1'));
  const requests=fake.state.requests.length,tokens=fake.state.tokenCount;
  assert.equal(store.one('vc_users',{user_id:'u1'}).user_id,'u1');
  assert.equal(store.list('vc_users').length,1);
  assert.equal(store.listNewest('vc_users',{},5).length,1);
  store.withLock(()=>store.one('vc_users',{user_id:'u1'}));
  assert.equal(fake.state.requests.length,requests,'shadow queried on a read path');
  assert.equal(fake.state.tokenCount,tokens);
});

test('DW-02 insert/update/remove mirror to the shadow; primary result is returned',()=>{
  const sheets=makeSheets(['vc_users']);
  const fake=createFakeFirestoreRest();
  const primary=createSheetStore({spreadsheetApp:sheets.spreadsheetApp,spreadsheetId:'s',lockService:sheets.lockService});
  const store=makeDual(primary,makeFsStore(fake),{record:()=>{throw new Error('no divergence expected');}});
  const inserted=store.insert('vc_users',rec('u1'));
  assert.equal(inserted.user_id,'u1');
  const updated=store.update('vc_users',{user_id:'u1'},{display_name:'Patched'});
  assert.equal(updated.display_name,'Patched');
  store.insert('vc_users',rec('u2'));
  assert.equal(store.remove('vc_users',{user_id:'u2'}),true);
  const shadow=fake.state.plain('vc_users','u1');
  const {_seq,...canonical}=shadow;
  assert.deepEqual(canonical,primary.one('vc_users',{user_id:'u1'}),'shadow diverged from SoR');
  assert.equal(fake.state.plain('vc_users','u2'),null,'remove not mirrored');
  assert.equal(sheetRows(sheets.tables,'vc_users').length,1);
});

test('DW-03 shadow failure journals divergence; primary write and result survive',()=>{
  const sheets=makeSheets(['vc_users']);
  const fake=createFakeFirestoreRest();
  const journal=[];
  const brokenSecondary={...makeFsStore(fake),insert(){throw new Error('FIRESTORE_503');}};
  const store=makeDual(createSheetStore({spreadsheetApp:sheets.spreadsheetApp,spreadsheetId:'s',lockService:sheets.lockService}),
    brokenSecondary,{record:e=>journal.push(e)});
  const r=store.insert('vc_users',rec('u1'));
  assert.equal(r.user_id,'u1','primary result must survive shadow failure');
  assert.equal(sheetRows(sheets.tables,'vc_users').length,1,'SoR write lost');
  assert.equal(journal.length,1);
  const e=journal[0];
  assert.equal(e.operation,'dualwrite.divergence');
  assert.equal(e.entity_id,'vc_users:u1');
  assert.equal(e.status,'OPEN');
  assert.equal(e.created_at,CLOCK());
  const detail=JSON.parse(e.detail_json);
  assert.equal(detail.op,'insert');
  assert.equal(detail.error,'FIRESTORE_503');
  assert.equal(detail.args[0],'vc_users');
});

test('DW-04 sequence replays the write log to the shadow only AFTER primary commit, in order',()=>{
  const fakeA=createFakeFirestoreRest(),fakeB=createFakeFirestoreRest();
  const journal=[];
  const store=makeDual(makeFsStore(fakeA),makeFsStore(fakeB),{record:e=>journal.push(e)});
  const result=store.sequence(tx=>{
    tx.insert('vc_users',rec('u1'));
    assert.equal(fakeB.state.plain('vc_users','u1'),null,'shadow written before primary commit');
    tx.update('vc_users',{user_id:'u1'},{display_name:'Patched'});
    tx.insert('vc_users',rec('u2'));
    assert.equal(tx.one('vc_users',{user_id:'u1'}).display_name,'Patched','read-your-writes on primary tx');
    return 'done';
  });
  assert.equal(result,'done');
  assert.equal(fakeB.state.plain('vc_users','u1').display_name,'Patched');
  assert.equal(fakeB.state.plain('vc_users','u1')._seq,1,'replay order must match capture order');
  assert.equal(fakeB.state.plain('vc_users','u2')._seq,2);
  assert.equal(journal.length,0);
});

test('DW-05 primary sequence throw mirrors nothing and journals nothing',()=>{
  const fakeA=createFakeFirestoreRest(),fakeB=createFakeFirestoreRest();
  const journal=[];
  const store=makeDual(makeFsStore(fakeA),makeFsStore(fakeB),{record:e=>journal.push(e)});
  assert.throws(()=>store.sequence(tx=>{tx.insert('vc_users',rec('u1'));throw new Error('BOOM');}),/BOOM/);
  assert.equal(fakeB.state.tokenCount,0,'shadow contacted after primary rollback');
  assert.equal(fakeB.state.plain('vc_users','u1'),null);
  assert.equal(journal.length,0);
});

test('DW-06 shadow failure during sequence replay journals divergence; primary result returned',()=>{
  const fakeA=createFakeFirestoreRest(),fakeB=createFakeFirestoreRest();
  const journal=[];
  const brokenSecondary={...makeFsStore(fakeB),update(){throw new Error('FIRESTORE_503');}};
  const store=makeDual(makeFsStore(fakeA),brokenSecondary,{record:e=>journal.push(e)});
  const result=store.sequence(tx=>{
    tx.insert('vc_users',rec('u1'));
    tx.update('vc_users',{user_id:'u1'},{display_name:'Patched'});
    return 'ok';
  });
  assert.equal(result,'ok');
  assert.equal(fakeA.state.plain('vc_users','u1').display_name,'Patched','primary commit lost');
  assert.equal(fakeB.state.plain('vc_users','u1').display_name,'User u1','insert mirrored, update failed');
  assert.equal(journal.length,1);
  assert.equal(JSON.parse(journal[0].detail_json).op,'update');
  assert.equal(journal[0].entity_id,'vc_users:{"user_id":"u1"}');
});

test('DW-07 journal failure is swallowed (backfill read-back audit is the safety net)',()=>{
  const sheets=makeSheets(['vc_users']);
  const fake=createFakeFirestoreRest();
  const brokenSecondary={...makeFsStore(fake),insert(){throw new Error('FIRESTORE_503');}};
  const store=makeDual(createSheetStore({spreadsheetApp:sheets.spreadsheetApp,spreadsheetId:'s',lockService:sheets.lockService}),
    brokenSecondary,{record(){throw new Error('JOURNAL_DOWN');}});
  assert.equal(store.insert('vc_users',rec('u1')).user_id,'u1','journal failure must not break the SoR write');
});

test('DW-08 Sheets-primary sequence (fn called with NO tx arg) still captures and replays',()=>{
  const sheets=makeSheets(['vc_users']);
  const fake=createFakeFirestoreRest();
  const store=makeDual(createSheetStore({spreadsheetApp:sheets.spreadsheetApp,spreadsheetId:'s',lockService:sheets.lockService}),
    makeFsStore(fake),{record:()=>{throw new Error('no divergence expected');}});
  const result=store.sequence(tx=>{
    tx.insert('vc_users',rec('s1'));
    return tx.one('vc_users',{user_id:'s1'}).user_id;
  });
  assert.equal(result,'s1');
  assert.equal(sheetRows(sheets.tables,'vc_users').length,1);
  assert.equal(fake.state.plain('vc_users','s1').user_id,'s1');
});

test('DW-09 selector dual-write mode: both stores written; divergence journaled to vc_operation_journal; fail-closed without key',()=>{
  const sheets=makeSheets(['vc_users','vc_operation_journal']);
  const fake=createFakeFirestoreRest();
  const services={spreadsheetApp:sheets.spreadsheetApp,lockService:sheets.lockService,utilities:makeFakeUtilities(),urlFetchApp:fake};
  const props=makeProps({VEHICLE_SHEET_ID:'s',VEHICLE_FIRESTORE_DUALWRITE:'true',VEHICLE_FIRESTORE_SA_KEY:KEY_JSON});
  const store=createStoreForBackend({backend:'sheets',props,services,clock:CLOCK});
  store.insert('vc_users',rec('u1'));
  assert.equal(sheetRows(sheets.tables,'vc_users').length,1);
  assert.equal(fake.state.plain('vc_users','u1').user_id,'u1','shadow not written in dual-write mode');
  const broken=createFakeFirestoreRest({tokenFails:true});
  const store2=createStoreForBackend({backend:'sheets',props,services:{...services,urlFetchApp:broken},clock:CLOCK});
  store2.insert('vc_users',rec('u2'));
  assert.equal(sheetRows(sheets.tables,'vc_users').length,2,'SoR write lost on shadow outage');
  const entries=sheetRows(sheets.tables,'vc_operation_journal').filter(r=>r.operation==='dualwrite.divergence');
  assert.equal(entries.length,1);
  assert.equal(entries[0].entity_id,'vc_users:u2');
  assert.equal(entries[0].status,'OPEN');
  assert.equal(entries[0].actor_id,'SYSTEM');
  assert.ok(entries[0].event_id,'journal event_id missing');
  assert.throws(()=>createStoreForBackend({backend:'sheets',
    props:makeProps({VEHICLE_SHEET_ID:'s',VEHICLE_FIRESTORE_DUALWRITE:'true'}),services,clock:CLOCK}),/STORAGE_NOT_CONFIGURED/);
  const plainFake=createFakeFirestoreRest();
  const plain=createStoreForBackend({backend:'sheets',props:makeProps({VEHICLE_SHEET_ID:'s'}),
    services:{...services,urlFetchApp:plainFake},clock:CLOCK});
  plain.insert('vc_users',rec('u3'));
  assert.equal(plainFake.state.tokenCount,0,'flag unset must keep zero REST traffic');
});

test('DW-10 Container dispatch in dual-write mode reaches BOTH stores; cleared flag retires mirroring at cutover',()=>{
  const login={apiVersion:'v1',group:'auth',action:'login',payload:{username:'nobody',password:'wrong-pass'}};
  const baseProps={VEHICLE_API_ENABLED:'true',VEHICLE_SHEET_ID:'s',VEHICLE_AUTH_PEPPER:'unit-test-pepper-0123456789abcdef',
    VEHICLE_FIRESTORE_DUALWRITE:'true',VEHICLE_FIRESTORE_SA_KEY:KEY_JSON};
  const sheets=makeSheets(['vc_users','vc_security_events','vc_operation_journal']);
  const fake=createFakeFirestoreRest();
  const deps={spreadsheetApp:sheets.spreadsheetApp,lockService:sheets.lockService,utilities:makeFakeUtilities(),urlFetchApp:fake,driveApp:null};
  const app=createApplication({...deps,propertiesService:{getScriptProperties:()=>makeProps(baseProps)}});
  const r=app.dispatch(login,'POST');
  assert.equal(r.ok,false,'unknown user still fails closed');
  assert.ok(sheets.state.opens>=1,'SoR not consulted in dual-write mode');
  assert.ok(fake.state.tokenCount>=1,'shadow not reached in dual-write mode');
  assert.ok(sheetRows(sheets.tables,'vc_security_events').length>=1,'failed-attempt event lost from SoR');
  assert.ok(fake.state.plain('vc_security_events',sheetRows(sheets.tables,'vc_security_events')[0].event_id),'failed-attempt event not mirrored');
  const opensBefore=sheets.state.opens;
  const cut=createApplication({...deps,propertiesService:{getScriptProperties:()=>makeProps({...baseProps,
    VEHICLE_PERSISTENCE_BACKEND:'firestore',VEHICLE_FIRESTORE_DUALWRITE:'false'})}});
  const r2=cut.dispatch(login,'POST');
  assert.equal(r2.ok,false);
  assert.equal(sheets.state.opens,opensBefore,'cleared flag must retire mirroring once backend=firestore');
});

test('DW-12 reverse dual-write after cutover keeps Sheets warm for rollback (E1 §5.5)',()=>{
  const login={apiVersion:'v1',group:'auth',action:'login',payload:{username:'nobody',password:'wrong-pass'}};
  const props=makeProps({VEHICLE_API_ENABLED:'true',VEHICLE_SHEET_ID:'s',VEHICLE_AUTH_PEPPER:'unit-test-pepper-0123456789abcdef',
    VEHICLE_PERSISTENCE_BACKEND:'firestore',VEHICLE_FIRESTORE_DUALWRITE:'true',VEHICLE_FIRESTORE_SA_KEY:KEY_JSON});
  const sheets=makeSheets(['vc_users','vc_security_events','vc_operation_journal']);
  const fake=createFakeFirestoreRest();
  const deps={spreadsheetApp:sheets.spreadsheetApp,lockService:sheets.lockService,utilities:makeFakeUtilities(),urlFetchApp:fake,driveApp:null};
  const app=createApplication({...deps,propertiesService:{getScriptProperties:()=>props}});
  const r=app.dispatch(login,'POST');
  assert.equal(r.ok,false);
  const events=sheetRows(sheets.tables,'vc_security_events');
  assert.ok(events.length>=1,'Sheets shadow not warmed after cutover (rollback would lose writes)');
  assert.ok(fake.state.plain('vc_security_events',events[0].event_id),'primary Firestore event missing');
  const brokenSheets={spreadsheetApp:{openById(){throw new Error('SHEETS_DOWN');},flush(){}},
    lockService:sheets.lockService,utilities:makeFakeUtilities(),urlFetchApp:fake};
  const store=createStoreForBackend({backend:'firestore',props,services:brokenSheets,clock:CLOCK});
  store.insert('vc_users',rec('r1'));
  assert.equal(fake.state.plain('vc_users','r1').user_id,'r1','primary write must survive shadow outage');
  const divergence=store.list('vc_operation_journal',{operation:'dualwrite.divergence'});
  assert.equal(divergence.length,1,'reverse divergence not journaled to the PRIMARY store');
  assert.equal(divergence[0].entity_id,'vc_users:r1');
  assert.equal(divergence[0].actor_id,'SYSTEM');
});

test('DW-11 dual-write wrapper satisfies the identical F1 store-port contract',()=>{
  const journal=[];
  const store=makeDual(makeFsStore(createFakeFirestoreRest()),makeFsStore(createFakeFirestoreRest()),{record:e=>journal.push(e)});
  runStorePortContract(assert,store);
  assert.equal(journal.length,0,'healthy shadow must not journal divergence');
});