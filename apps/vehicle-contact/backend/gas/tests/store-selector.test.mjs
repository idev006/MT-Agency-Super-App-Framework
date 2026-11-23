// Slice G offline proof (VC-ADR-026): runtime persistence is Firestore-only. The API dispatch
// path never opens the Spreadsheet (even when VEHICLE_SHEET_ID is present), routes writes to
// the REST gateway, and fails closed on missing/malformed service-account credentials before
// any network call. SheetStore survives only for admin maintenance tools, not runtime dispatch.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {createRuntimeStore} from '../src/composition/StoreSelector.js';
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

test('SEL-01 runtime store routes writes to REST and never opens the Spreadsheet',()=>{
  const fake=createFakeFirestoreRest();
  const {spreadsheetApp,state}=makeSpreadsheet();
  const store=createRuntimeStore({props:makeProps({VEHICLE_SHEET_ID:'sheet-1',VEHICLE_FIRESTORE_SA_KEY:KEY_JSON}),
    services:makeServices(spreadsheetApp,fake),clock:()=>'2026-11-22T00:00:00.000Z'});
  store.insert('vc_users',rec('u1'));
  assert.equal(fake.state.plain('vc_users','u1').user_id,'u1','doc persisted via REST');
  assert.equal(state.opens,0,'Spreadsheet must not be opened on the Firestore-only runtime');
  assert.ok(fake.state.tokenCount>=1);
});

test('SEL-02 fail-closed: missing key and malformed key, no network on rejected config',()=>{
  const fake=createFakeFirestoreRest();
  const {spreadsheetApp}=makeSpreadsheet();
  const services=makeServices(spreadsheetApp,fake);
  const clock=()=>'2026-11-22T00:00:00.000Z';
  assert.throws(()=>createRuntimeStore({props:makeProps({}),services,clock}),/STORAGE_NOT_CONFIGURED/);
  assert.throws(()=>createRuntimeStore({props:makeProps({VEHICLE_FIRESTORE_SA_KEY:'{bad'}),services,clock}),/INVALID_FIRESTORE_SA_KEY/);
  assert.equal(fake.state.requests.length,0,'no network on rejected config');
});

test('SEL-03 Container dispatch reaches REST and fails closed on missing credentials',()=>{
  const login={apiVersion:'v1',group:'auth',action:'login',payload:{username:'nobody',password:'wrong-pass'}};
  const baseProps={VEHICLE_API_ENABLED:'true',VEHICLE_SHEET_ID:'sheet-1',VEHICLE_AUTH_PEPPER:'unit-test-pepper-0123456789abcdef'};
  const fake=createFakeFirestoreRest();
  const {spreadsheetApp,state}=makeSpreadsheet();
  const deps={spreadsheetApp,lockService,utilities:makeFakeUtilities(),urlFetchApp:fake,driveApp:null};
  const appFs=createApplication({...deps,propertiesService:{getScriptProperties:()=>makeProps({...baseProps,
    VEHICLE_FIRESTORE_SA_KEY:KEY_JSON})}});
  const r1=appFs.dispatch(login,'POST');
  assert.equal(r1.ok,false,'unknown user still fails closed');
  assert.ok(fake.state.tokenCount>=1,'Firestore-only dispatch must reach REST');
  assert.equal(state.opens,0,'dispatch must not open the Spreadsheet');
  const appBroken=createApplication({...deps,propertiesService:{getScriptProperties:()=>makeProps(baseProps)}});
  const r2=appBroken.dispatch(login,'POST');
  assert.equal(r2.ok,false);
  assert.equal(r2.error.code,'SERVICE_UNAVAILABLE','missing credentials fail closed at the composition root');
});