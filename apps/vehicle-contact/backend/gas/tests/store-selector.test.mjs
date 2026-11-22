// F3a offline proof: backend selection is fail-closed and actually routes runtime traffic.
// Default stays Sheets; VEHICLE_PERSISTENCE_BACKEND=firestore opts into the REST gateway;
// unknown values / missing credentials throw before any store is used. Container-level
// dispatch proves the composition root consults the selector (observable store traffic).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {createStoreForBackend} from '../src/composition/StoreSelector.js';
import {createApplication} from '../src/composition/Container.js';
import {createFakeFirestoreRest,makeFakeUtilities,fakeServiceAccountKey} from './fake-firestore-rest-server.mjs';

const COLS=DATABASE_SCHEMA.tables.vc_users.columns.map(c=>c.name);
function rec(id){
  const base={user_id:id,username_normalized:'user-'+id,display_name:'User '+id,status:'ACTIVE',
    created_at:'2026-11-22T00:00:00.000Z',updated_at:'2026-11-22T00:00:00.000Z'};
  const r={};for(const c of COLS)r[c]=base[c]!==undefined?base[c]:'';
  return r;
}
function makeProps(map){return {getProperty:k=>(k in map?map[k]:null)};}
function makeSpreadsheet(){
  const rows=[COLS.slice()];
  const state={opens:0,rows};
  const sheet={
    getLastRow(){return rows.length;},getLastColumn(){return COLS.length;},
    getRange(r,c,h,w){return{
      getValues(){return rows.slice(r-1,r-1+h).map(x=>x.slice());},
      setValues(next){next.forEach((v,i)=>rows[r-1+i]=v.slice());},
      setNumberFormats(){}
    };},
    deleteRow(r){rows.splice(r-1,1);}
  };
  const spreadsheetApp={openById(){state.opens++;return{getSheetByName(name){return name==='vc_users'?sheet:null;}};},flush(){}};
  return {spreadsheetApp,state};
}
const lockService={getScriptLock(){return{tryLock(){return true;},releaseLock(){}};}};
function makeServices(spreadsheetApp,fake){
  return {spreadsheetApp,lockService,utilities:makeFakeUtilities(),urlFetchApp:fake};
}
const KEY_JSON=JSON.stringify(fakeServiceAccountKey());

test('SEL-01 default and explicit sheets keep using the Spreadsheet (zero REST traffic)',()=>{
  for(const backend of [undefined,'sheets']){
    const fake=createFakeFirestoreRest();
    const {spreadsheetApp,state}=makeSpreadsheet();
    const store=createStoreForBackend({backend,props:makeProps({VEHICLE_SHEET_ID:'sheet-1'}),
      services:makeServices(spreadsheetApp,fake),clock:()=>'2026-11-22T00:00:00.000Z'});
    store.insert('vc_users',rec('u1'));
    assert.equal(state.rows.length,2,'row landed in the sheet');
    assert.equal(fake.state.tokenCount,0,'Firestore contacted on sheets backend');
  }
});

test('SEL-02 firestore backend routes writes to REST, never touches the Spreadsheet',()=>{
  const fake=createFakeFirestoreRest();
  const {spreadsheetApp,state}=makeSpreadsheet();
  const store=createStoreForBackend({backend:'firestore',
    props:makeProps({VEHICLE_SHEET_ID:'sheet-1',VEHICLE_FIRESTORE_SA_KEY:KEY_JSON}),
    services:makeServices(spreadsheetApp,fake),clock:()=>'2026-11-22T00:00:00.000Z'});
  store.insert('vc_users',rec('u1'));
  assert.equal(fake.state.plain('vc_users','u1').user_id,'u1','doc persisted via REST');
  assert.equal(state.opens,0,'Spreadsheet opened on firestore backend');
  assert.ok(fake.state.tokenCount>=1);
});

test('SEL-03 fail-closed: unknown backend, missing key, malformed key',()=>{
  const fake=createFakeFirestoreRest();
  const {spreadsheetApp}=makeSpreadsheet();
  const services=makeServices(spreadsheetApp,fake);
  const clock=()=>'2026-11-22T00:00:00.000Z';
  assert.throws(()=>createStoreForBackend({backend:'mysql',props:makeProps({}),services,clock}),/UNKNOWN_PERSISTENCE_BACKEND:mysql/);
  assert.throws(()=>createStoreForBackend({backend:'firestore',props:makeProps({}),services,clock}),/STORAGE_NOT_CONFIGURED/);
  assert.throws(()=>createStoreForBackend({backend:'firestore',props:makeProps({VEHICLE_FIRESTORE_SA_KEY:'{bad'}),services,clock}),/INVALID_FIRESTORE_SA_KEY/);
  assert.equal(fake.state.requests.length,0,'no network on rejected config');
});

test('SEL-04 Container dispatch consults the selector (observable backend traffic)',()=>{
  const login={apiVersion:'v1',group:'auth',action:'login',payload:{username:'nobody',password:'wrong-pass'}};
  const baseProps={VEHICLE_API_ENABLED:'true',VEHICLE_SHEET_ID:'sheet-1',VEHICLE_AUTH_PEPPER:'unit-test-pepper-0123456789abcdef'};
  const fake=createFakeFirestoreRest();
  const {spreadsheetApp,state}=makeSpreadsheet();
  const deps={spreadsheetApp,lockService,utilities:makeFakeUtilities(),urlFetchApp:fake,driveApp:null};
  const appSheets=createApplication({...deps,propertiesService:{getScriptProperties:()=>makeProps(baseProps)}});
  const r1=appSheets.dispatch(login,'POST');
  assert.equal(r1.ok,false);
  assert.ok(state.opens>=1,'sheets backend must open the Spreadsheet');
  assert.equal(fake.state.tokenCount,0);
  const appFs=createApplication({...deps,propertiesService:{getScriptProperties:()=>makeProps({...baseProps,
    VEHICLE_PERSISTENCE_BACKEND:'firestore',VEHICLE_FIRESTORE_SA_KEY:KEY_JSON})}});
  const r2=appFs.dispatch(login,'POST');
  assert.equal(r2.ok,false,'unknown user still fails closed');
  assert.ok(fake.state.tokenCount>=1,'firestore backend must reach REST');
  const opensAfterSheets=state.opens;
  assert.equal(state.opens,opensAfterSheets,'firestore dispatch must not open the Spreadsheet');
  const appBroken=createApplication({...deps,propertiesService:{getScriptProperties:()=>makeProps({...baseProps,
    VEHICLE_PERSISTENCE_BACKEND:'firestore'})}});
  const r3=appBroken.dispatch(login,'POST');
  assert.equal(r3.ok,false);
  assert.equal(r3.error.code,'SERVICE_UNAVAILABLE','missing credentials fail closed at the composition root');
});