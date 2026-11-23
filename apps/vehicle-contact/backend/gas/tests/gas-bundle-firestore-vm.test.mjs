// S1 (VC-ADR-029): replaces the Sheets-era compiled-GAS VM acceptance. Loads the REAL built
// dist/*.gs bundle into a VM with GAS-shaped globals and drives doPost end-to-end against the
// contract-enforcing fake Firestore REST server. No SpreadsheetApp global exists at all.
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

const root=resolve(import.meta.dirname,'..');
const NOW=new Date().toISOString();
const PEPPER='synthetic-vm-pepper-0123456789-abcdefghijklmn';
const PASSWORD='Synthetic-Vm-Passw0rd-2026!';
const row=(t,o)=>Object.fromEntries(DATABASE_SCHEMA.tables[t].columns.map(c=>[c.name,o[c.name]!==undefined?o[c.name]:'']));

function boot(){
  const fake=createFakeFirestoreRest(),utilities=makeFakeUtilities(),key=fakeServiceAccountKey();
  const values={VEHICLE_API_ENABLED:'true',VEHICLE_AUTH_PEPPER:PEPPER,VEHICLE_FIRESTORE_SA_KEY:JSON.stringify(key),
    VEHICLE_FIRESTORE_PROJECT_ID:PROJECT,VEHICLE_FIRESTORE_DATABASE_ID:DATABASE};
  const propsApi={getProperty:k=>values[k]??null,getProperties:()=>({...values}),setProperty(){},deleteProperty(){}};
  // Seed through the real adapter (same doc shape the runtime writes).
  const gw=createFirestoreRestGateway({utilities,urlFetchApp:fake,clientEmail:key.client_email,privateKey:key.private_key,projectId:PROJECT,databaseId:DATABASE});
  const store=createFirestoreStore({firestore:gw});
  const sec=createGasSecurity({utilities,propertiesService:{getScriptProperties:()=>propsApi},clock:()=>NOW});
  store.insert('vc_settings',row('vc_settings',{key:'idle_timeout_minutes',value:'30',updated_by:'vm',updated_at:NOW}));
  store.insert('vc_users',row('vc_users',{user_id:'u-vm-admin',username_normalized:'vm_admin',display_name:'VM Admin',
    password_hash:sec.hashPassword(PASSWORD),password_change_required:false,status:'ACTIVE',created_at:NOW,updated_at:NOW}));
  store.insert('vc_user_roles',row('vc_user_roles',{assignment_id:'r-vm',user_id:'u-vm-admin',role_id:'SYSTEM_ADMIN',status:'ACTIVE'}));
  const context=vm.createContext({
    console,Logger:{log(){}},
    ContentService:{MimeType:{JSON:'JSON'},createTextOutput(v){return {value:v,setMimeType(){return this;}};}},
    PropertiesService:{getScriptProperties:()=>propsApi},
    UrlFetchApp:{fetch:fake.fetch,fetchAll:fake.fetchAll},
    Utilities:utilities
  });
  const files=readdirSync(join(root,'dist')).filter(f=>f.endsWith('.gs')).sort();
  for(const f of files)new vm.Script(readFileSync(join(root,'dist',f),'utf8'),{filename:f}).runInContext(context);
  const post=(group,action,payload={},sessionToken)=>JSON.parse(context.doPost({postData:{contents:JSON.stringify(
    {apiVersion:'v1',group,action,payload,requestId:'vm'+Math.random().toString(36).slice(2,10),...(sessionToken?{sessionToken}:{})})}}).value);
  return {context,fake,post,store};
}

test('VM-01 compiled bundle: health, login, authorized call, logout → revoked token rejected (Firestore only)',()=>{
  const {context,post,store}=boot();
  assert.equal(typeof context.SpreadsheetApp,'undefined');
  assert.equal(JSON.parse(context.doGet({}).value).data.persistence.engine,'firestore');
  const bad=post('auth','login',{username:'vm_admin',password:'Wrong-Passw0rd-123!'});
  assert.equal(bad.ok,false);
  const login=post('auth','login',{username:'vm_admin',password:PASSWORD});
  assert.equal(login.ok,true,JSON.stringify(login.error||{}));
  const token=login.data.sessionToken;
  const users=post('users','list',{},token);
  assert.equal(users.ok,true,JSON.stringify(users.error||{}));
  assert.ok((users.data.items||users.data).some(u=>u.userId==='u-vm-admin'));
  assert.equal(post('vehicles','lookup',{plate:'x',province:'y'}).ok,false,'protected op without a session is denied');
  assert.equal(post('auth','logout',{},token).ok,true);
  const after=post('users','list',{},token);
  assert.equal(after.ok,false);assert.equal(after.error.code,'UNAUTHENTICATED');
  assert.equal(store.list('vc_sessions',{user_id:'u-vm-admin'})[0].status,'REVOKED','read-back: session revoked in Firestore');
});

test('VM-02 compiled bundle: organization create/list round-trip persists in Firestore',()=>{
  const {post,store}=boot();
  const token=post('auth','login',{username:'vm_admin',password:PASSWORD}).data.sessionToken;
  const created=post('organizations','create',{name:'VM Synthetic Org',type:'POLICE'},token);
  assert.equal(created.ok,true,JSON.stringify(created.error||{}));
  const saved=store.one('vc_organizations',{organization_id:created.data.organizationId});
  assert.equal(saved.name,'VM Synthetic Org','independent read-back');
});
