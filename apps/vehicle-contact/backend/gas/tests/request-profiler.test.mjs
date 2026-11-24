// Profiler: only "prof_*" requests get serverTiming; it holds durations/counts only (no data).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import vm from 'node:vm';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {createFirestoreStore} from '../src/infrastructure/persistence/firestore/FirestoreStore.js';
import {createFirestoreRestGateway} from '../src/infrastructure/persistence/firestore/FirestoreRestGateway.js';
import {createGasSecurity} from '../src/infrastructure/security/GasSecurity.js';
import {createFakeFirestoreRest,makeFakeUtilities,fakeServiceAccountKey,PROJECT,DATABASE} from './fake-firestore-rest-server.mjs';
import {createRequestProfiler,isProfiled} from '../src/infrastructure/profiling/RequestProfiler.js';

const root=resolve(import.meta.dirname,'..'),NOW=new Date().toISOString(),PEPPER='synthetic-vm-pepper-0123456789-abcdefghijklmn',PASSWORD='Synthetic-Vm-Passw0rd-2026!';
const row=(t,o)=>Object.fromEntries(DATABASE_SCHEMA.tables[t].columns.map(c=>[c.name,o[c.name]!==undefined?o[c.name]:'']));

test('PROF-01 isProfiled only for requestId prefix prof_',()=>{
  assert.equal(isProfiled({requestId:'prof_abc'}),true);
  assert.equal(isProfiled({requestId:'req_abc'}),false);
  assert.equal(isProfiled({}),false);
});

test('PROF-02 report counts fetch rounds, cache hits and phases without any payload data',()=>{
  let t=0;const p=createRequestProfiler(()=>t);
  const u=p.wrapUrlFetch({fetch:()=>{t+=5;return 'r';},fetchAll:rs=>{t+=7;return rs.map(()=>'r');}});
  const c=p.wrapCache({get:k=>k==='hit'?'v':null,put(){},remove(){}});
  p.phase('authorize',()=>{u.fetch('https://firestore.googleapis.com/v1/x/documents:runQuery');c.get('hit');c.get('miss');});
  u.fetchAll([{url:'https://x/documents:runQuery'},{url:'https://x/documents:commit'}]);
  const r=p.report();
  assert.equal(r.fetch.rounds,2);assert.equal(r.fetch.requests,3);
  assert.deepEqual(r.fetch.calls.map(x=>x.kind),['runQuery','fetchAll[runQuery,commit]']);
  assert.equal(r.cache.gets,2);assert.equal(r.cache.hits,1);
  assert.equal(r.phases.authorize,5);
  assert.ok(!JSON.stringify(r).includes('documents/'),'no document names or data');
});

test('PROF-03 compiled bundle: only a prof_ request carries serverTiming; normal requests are unchanged',()=>{
  const fake=createFakeFirestoreRest(),utilities=makeFakeUtilities(),key=fakeServiceAccountKey();
  const values={VEHICLE_API_ENABLED:'true',VEHICLE_AUTH_PEPPER:PEPPER,VEHICLE_FIRESTORE_SA_KEY:JSON.stringify(key),VEHICLE_FIRESTORE_PROJECT_ID:PROJECT,VEHICLE_FIRESTORE_DATABASE_ID:DATABASE};
  const propsApi={getProperty:k=>values[k]??null,getProperties:()=>({...values}),setProperty(){},deleteProperty(){}};
  const gw=createFirestoreRestGateway({utilities,urlFetchApp:fake,clientEmail:key.client_email,privateKey:key.private_key,projectId:PROJECT,databaseId:DATABASE});
  const store=createFirestoreStore({firestore:gw});
  const sec=createGasSecurity({utilities,propertiesService:{getScriptProperties:()=>propsApi},clock:()=>NOW});
  store.insert('vc_settings',row('vc_settings',{key:'idle_timeout_minutes',value:'30',updated_by:'vm',updated_at:NOW}));
  store.insert('vc_users',row('vc_users',{user_id:'u-vm',username_normalized:'vm_admin',display_name:'VM',password_hash:sec.hashPassword(PASSWORD),password_change_required:false,status:'ACTIVE',created_at:NOW,updated_at:NOW}));
  store.insert('vc_user_roles',row('vc_user_roles',{assignment_id:'r-vm',user_id:'u-vm',role_id:'SYSTEM_ADMIN',status:'ACTIVE'}));
  const ctx=vm.createContext({console,Logger:{log(){}},ContentService:{MimeType:{JSON:'JSON'},createTextOutput(v){return {value:v,setMimeType(){return this;}};}},
    PropertiesService:{getScriptProperties:()=>propsApi},UrlFetchApp:{fetch:fake.fetch,fetchAll:fake.fetchAll},Utilities:utilities});
  for(const f of readdirSync(join(root,'dist')).filter(f=>f.endsWith('.gs')).sort())new vm.Script(readFileSync(join(root,'dist',f),'utf8'),{filename:f}).runInContext(ctx);
  const post=(group,action,payload,requestId,sessionToken)=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify({apiVersion:'v1',group,action,payload,requestId,...(sessionToken?{sessionToken}:{})})}}).value);
  const token=post('auth','login',{username:'vm_admin',password:PASSWORD},'login_1').data.sessionToken;
  const normal=post('users','list',{},'req_1',token);
  assert.equal(normal.ok,true);assert.equal('serverTiming' in normal,false);
  const prof=post('users','list',{},'prof_1',token);
  assert.equal(prof.ok,true);
  assert.ok(prof.serverTiming&&prof.serverTiming.totalMs>=0);
  assert.ok(prof.serverTiming.fetch.rounds>=1);
  assert.ok('authorize' in prof.serverTiming.phases&&'controller' in prof.serverTiming.phases);
});
