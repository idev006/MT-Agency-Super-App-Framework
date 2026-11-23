// S1 (VC-ADR-029): editor admin tools on the runtime store (real Firestore store + REST gateway
// over the contract-enforcing fake). Replaces the Sheets-era admin-password-reset and
// reference-seed suites; every original gate is re-asserted. No real credentials or network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {createFirestoreStore} from '../src/infrastructure/persistence/firestore/FirestoreStore.js';
import {createFirestoreRestGateway} from '../src/infrastructure/persistence/firestore/FirestoreRestGateway.js';
import {createOneTimeAdminPasswordReset} from '../src/infrastructure/security/AdminPasswordReset.js';
import {createReferenceSeedInstaller} from '../src/infrastructure/reference/ReferenceSeedInstaller.js';
import {bootstrapStagingAdmin} from '../src/infrastructure/bootstrap/BootstrapAdmin.js';
import {createGasSecurity} from '../src/infrastructure/security/GasSecurity.js';
import {REFERENCE_SEED_V1} from '../src/domain/reference/ReferenceSeedV1.js';
import {createFakeFirestoreRest,makeFakeUtilities,fakeServiceAccountKey,PROJECT,DATABASE} from './fake-firestore-rest-server.mjs';

const NOW='2026-11-23T12:00:00.000Z';
const PEPPER='synthetic-test-pepper-0123456789-abcdefghij';
const NEW_PASSWORD='Synthetic-Reset-Passw0rd!';
function props(initial={}){
  const map=new Map(Object.entries({VEHICLE_AUTH_PEPPER:PEPPER,...initial}));
  const api={getProperty:k=>map.has(k)?map.get(k):null,setProperty:(k,v)=>{map.set(k,String(v));},deleteProperty:k=>{map.delete(k);},
    getProperties:()=>Object.fromEntries(map)};
  return {map,service:{getScriptProperties:()=>api}};
}
function setup(){
  const fake=createFakeFirestoreRest(),utilities=makeFakeUtilities(),key=fakeServiceAccountKey();
  const gw=createFirestoreRestGateway({utilities,urlFetchApp:fake,clientEmail:key.client_email,privateKey:key.private_key,
    projectId:PROJECT,databaseId:DATABASE,clock:()=>NOW});
  return {fake,utilities,store:createFirestoreStore({firestore:gw})};
}
const row=(table,over)=>Object.fromEntries(DATABASE_SCHEMA.tables[table].columns.map(c=>[c.name,over[c.name]!==undefined?over[c.name]:'']));

// ---------------- Admin password reset ----------------
function seedAdmin(ctx){
  const sec=createGasSecurity({utilities:ctx.utilities,propertiesService:props().service,clock:()=>NOW});
  ctx.oldHash=sec.hashPassword('Old-Synthetic-Passw0rd!');
  ctx.store.insert('vc_users',row('vc_users',{user_id:'u-admin',username_normalized:'admin',display_name:'Admin',password_hash:ctx.oldHash,
    password_change_required:false,status:'ACTIVE',created_at:NOW,updated_at:NOW}));
  ctx.store.insert('vc_user_roles',row('vc_user_roles',{assignment_id:'ra',user_id:'u-admin',role_id:'SYSTEM_ADMIN',status:'ACTIVE'}));
  for(const id of ['s1','s2'])ctx.store.insert('vc_sessions',row('vc_sessions',{session_id:id,user_id:'u-admin',token_digest:'d-'+id,status:'ACTIVE',
    issued_at:NOW,expires_at:NOW,last_seen_at:NOW,idle_timeout_minutes:30,revoked_at:''}));
}
function resetTool(ctx,extra={}){
  const p=props({VEHICLE_ADMIN_RESET_EXPECTED_PROJECT_ID:PROJECT,VEHICLE_ADMIN_RESET_EXPECTED_USER_ID:'u-admin',
    VEHICLE_ADMIN_RESET_NEW_PASSWORD:NEW_PASSWORD,...extra});
  return {p,tool:createOneTimeAdminPasswordReset({store:ctx.store,projectId:PROJECT,utilities:ctx.utilities,propertiesService:p.service,clock:()=>NOW})};
}

test('RESET-01 preflight is read-only and never exposes secret material',()=>{
  const ctx=setup();seedAdmin(ctx);
  const before=ctx.fake.state.requests.filter(r=>r.url.endsWith(':commit')).length;
  const out=resetTool(ctx).tool.inspect();
  assert.equal(out.status,'READY_FOR_EXPLICIT_EDITOR_RESET');
  assert.equal(out.sessionsToRevoke,2);
  assert.equal(ctx.fake.state.requests.filter(r=>r.url.endsWith(':commit')).length,before,'no writes');
  assert.equal(JSON.stringify(out).includes(NEW_PASSWORD),false);
});
test('RESET-02 explicit approval, matching project and user id, admin role and strong password are all required',()=>{
  const ctx=setup();seedAdmin(ctx);
  assert.throws(()=>resetTool(ctx).tool.apply(),/RESET_EXPLICIT_APPROVAL_REQUIRED/);
  assert.throws(()=>resetTool(ctx,{VEHICLE_ADMIN_RESET_APPROVAL:'RESET_ADMIN_ONCE',VEHICLE_ADMIN_RESET_EXPECTED_PROJECT_ID:'other-project'}).tool.apply(),/RESET_TARGET_NOT_CONFIRMED/);
  assert.throws(()=>resetTool(ctx,{VEHICLE_ADMIN_RESET_APPROVAL:'RESET_ADMIN_ONCE',VEHICLE_ADMIN_RESET_EXPECTED_USER_ID:'someone-else'}).tool.apply(),/RESET_ADMIN_IDENTITY_MISMATCH/);
  assert.throws(()=>resetTool(ctx,{VEHICLE_ADMIN_RESET_APPROVAL:'RESET_ADMIN_ONCE',VEHICLE_ADMIN_RESET_NEW_PASSWORD:'weak'}).tool.apply(),/RESET_NEW_PASSWORD_POLICY_FAILED/);
  ctx.store.update('vc_user_roles',{assignment_id:'ra'},{status:'REVOKED'});
  assert.throws(()=>resetTool(ctx,{VEHICLE_ADMIN_RESET_APPROVAL:'RESET_ADMIN_ONCE'}).tool.apply(),/RESET_ADMIN_ROLE_MISMATCH/);
  assert.equal(ctx.store.one('vc_users',{user_id:'u-admin'}).password_hash,ctx.oldHash,'nothing changed');
});
test('RESET-03 approved reset revokes sessions, changes only hash/flags, audits once, consumes secrets, is one-shot',()=>{
  const ctx=setup();seedAdmin(ctx);
  const {p,tool}=resetTool(ctx,{VEHICLE_ADMIN_RESET_APPROVAL:'RESET_ADMIN_ONCE'});
  const out=tool.apply();
  assert.equal(out.status,'DONE');assert.equal(out.sessionsRevoked,2);
  for(const id of ['s1','s2'])assert.equal(ctx.store.one('vc_sessions',{session_id:id}).status,'REVOKED');
  const u=ctx.store.one('vc_users',{user_id:'u-admin'});
  assert.notEqual(u.password_hash,ctx.oldHash);assert.equal(u.password_change_required,true);
  assert.equal(u.display_name,'Admin','masked write left other fields intact');
  const sec=createGasSecurity({utilities:ctx.utilities,propertiesService:props().service,clock:()=>NOW});
  assert.equal(sec.verifyPassword(NEW_PASSWORD,u.password_hash),true);
  assert.equal(ctx.store.list('vc_change_audit').filter(a=>a.action==='EDITOR_ADMIN_PASSWORD_RESET').length,1);
  assert.equal(p.map.has('VEHICLE_ADMIN_RESET_NEW_PASSWORD'),false);assert.equal(p.map.has('VEHICLE_ADMIN_RESET_APPROVAL'),false);
  assert.match(p.map.get('VEHICLE_ADMIN_RESET_STATE'),/^DONE:/);
  p.map.set('VEHICLE_ADMIN_RESET_APPROVAL','RESET_ADMIN_ONCE');p.map.set('VEHICLE_ADMIN_RESET_NEW_PASSWORD',NEW_PASSWORD);
  assert.throws(()=>tool.apply(),/RESET_ALREADY_STARTED_OR_COMPLETED/);
});
test('RESET-04 a write failure marks RECOVERY_REQUIRED and forbids a blind retry',()=>{
  const ctx=setup();seedAdmin(ctx);
  const {p,tool}=resetTool(ctx,{VEHICLE_ADMIN_RESET_APPROVAL:'RESET_ADMIN_ONCE'});
  ctx.fake.state.onRequest=(url,opts)=>{if(url.endsWith(':commit')&&String(opts.payload).includes('vc_change_audit'))throw new Error('INJECTED_NETWORK_FAILURE');};
  assert.throws(()=>tool.apply(),/INJECTED_NETWORK_FAILURE/);
  ctx.fake.state.onRequest=null;
  assert.match(p.map.get('VEHICLE_ADMIN_RESET_STATE'),/^RECOVERY_REQUIRED:/);
  assert.equal(ctx.store.one('vc_users',{user_id:'u-admin'}).password_hash,ctx.oldHash,'password+audit commit is all-or-nothing');
  assert.equal(ctx.store.one('vc_sessions',{session_id:'s1'}).status,'REVOKED','sessions were revoked first');
});

// ---------------- Reference seed ----------------
function seeder(ctx,extra={}){
  const p=props(extra);
  return {p,seed:createReferenceSeedInstaller({store:ctx.store,propertiesService:p.service,utilities:ctx.utilities,clock:()=>NOW})};
}
test('SEED-01 preview is read-only; apply needs the exact checksum, writes 645 rows, verifies, consumes approval, is idempotent',()=>{
  const ctx=setup();
  const {seed}=seeder(ctx);
  const pre=seed.preview();
  assert.equal(pre.status,'READY');assert.equal(pre.addCount,645);assert.equal(ctx.store.list('vc_reference_values').length,0);
  assert.throws(()=>seed.apply(),/REFERENCE_SEED_EXPLICIT_APPROVAL_REQUIRED/);
  const {p,seed:approved}=seeder(ctx,{VEHICLE_REFERENCE_SEED_APPROVED_SHA256:pre.checksum});
  const out=approved.apply();
  assert.equal(out.status,'APPLIED');
  assert.equal(ctx.store.list('vc_reference_values').length,645);
  assert.equal(p.map.has('VEHICLE_REFERENCE_SEED_APPROVED_SHA256'),false,'approval consumed');
  assert.equal(JSON.parse(p.map.get('VEHICLE_REFERENCE_SEED_JOURNAL')).status,'APPLIED');
  p.map.set('VEHICLE_REFERENCE_SEED_APPROVED_SHA256',pre.checksum);
  assert.equal(approved.apply().status,'ALREADY_APPLIED');
  assert.equal(ctx.store.list('vc_reference_values').length,645,'no duplicates');
});
test('SEED-02 foreign existing data blocks without overwrite; recover needs approval + recovery journal and removes only seed rows',()=>{
  const ctx=setup();
  ctx.store.insert('vc_reference_values',row('vc_reference_values',{reference_id:'CUSTOM-1',catalog:'COLOR',code:'X',label_th:'x',
    sort_order:'1',status:'ACTIVE',updated_by:'someone',updated_at:NOW}));
  const {seed}=seeder(ctx);
  assert.equal(seed.preview().status,'BLOCKED');
  const {seed:approved}=seeder(ctx,{VEHICLE_REFERENCE_SEED_APPROVED_SHA256:seed.checksum});
  assert.throws(()=>approved.apply(),/REFERENCE_SEED_CONFLICT/);
  assert.equal(ctx.store.list('vc_reference_values').length,1);
  assert.throws(()=>seeder(ctx).seed.recover(),/REFERENCE_SEED_RECOVERY_APPROVAL_REQUIRED/);
  assert.throws(()=>seeder(ctx,{VEHICLE_REFERENCE_SEED_RECOVERY_APPROVED:'true'}).seed.recover(),/REFERENCE_SEED_RECOVERY_NOT_REQUIRED/);
  const journal=JSON.stringify({status:'RECOVERY_REQUIRED'});
  assert.throws(()=>seeder(ctx,{VEHICLE_REFERENCE_SEED_RECOVERY_APPROVED:'true',VEHICLE_REFERENCE_SEED_JOURNAL:journal}).seed.recover(),/REFERENCE_SEED_RECOVERY_CONFLICT/);
  ctx.store.remove('vc_reference_values',{reference_id:'CUSTOM-1'});
  const r0=REFERENCE_SEED_V1.rows[0];
  ctx.store.insert('vc_reference_values',Object.fromEntries(Object.keys(r0).map(k=>[k,String(r0[k])])));
  const rec=seeder(ctx,{VEHICLE_REFERENCE_SEED_RECOVERY_APPROVED:'true',VEHICLE_REFERENCE_SEED_JOURNAL:journal});
  assert.equal(rec.seed.recover().clearedCount,1);
  assert.equal(ctx.store.list('vc_reference_values').length,0);
  assert.equal(JSON.parse(rec.p.map.get('VEHICLE_REFERENCE_SEED_JOURNAL')).status,'RECOVERED');
});

// ---------------- Bootstrap ----------------
test('BOOT-01 first admin + role + idle setting in ONE commit, secrets consumed, one-shot',()=>{
  const ctx=setup();
  const {p,service}=(()=>{const x=props({VEHICLE_BOOTSTRAP_STAGING_APPROVED:'true',VEHICLE_BOOTSTRAP_USERNAME:'admin',
    VEHICLE_BOOTSTRAP_TEMP_PASSWORD:'Bootstrap-Temp-Passw0rd!',VEHICLE_BOOTSTRAP_IDLE_MINUTES:'30'});return {p:x,service:x.service};})();
  const commits0=ctx.fake.state.requests.filter(r=>r.url.endsWith(':commit')).length;
  const out=bootstrapStagingAdmin({store:ctx.store,utilities:ctx.utilities,propertiesService:service});
  assert.equal(out.created,true);
  assert.equal(ctx.fake.state.requests.filter(r=>r.url.endsWith(':commit')).length-commits0,1,'one all-or-nothing commit');
  assert.equal(ctx.store.one('vc_users',{user_id:out.userId}).password_change_required,true);
  assert.equal(ctx.store.list('vc_user_roles',{user_id:out.userId})[0].role_id,'SYSTEM_ADMIN');
  assert.equal(ctx.store.one('vc_settings',{key:'idle_timeout_minutes'}).value,'30');
  assert.equal(p.map.has('VEHICLE_BOOTSTRAP_TEMP_PASSWORD'),false);assert.equal(p.map.has('VEHICLE_BOOTSTRAP_STAGING_APPROVED'),false);
  p.map.set('VEHICLE_BOOTSTRAP_STAGING_APPROVED','true');p.map.set('VEHICLE_BOOTSTRAP_TEMP_PASSWORD','Bootstrap-Temp-Passw0rd!');
  assert.throws(()=>bootstrapStagingAdmin({store:ctx.store,utilities:ctx.utilities,propertiesService:service}),/BOOTSTRAP_ALREADY_COMPLETED/);
  assert.throws(()=>bootstrapStagingAdmin({store:ctx.store,utilities:ctx.utilities,propertiesService:props().service}),/STAGING_BOOTSTRAP_NOT_APPROVED/);
});
