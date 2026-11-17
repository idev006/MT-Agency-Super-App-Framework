import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {createOneTimeAdminPasswordReset} from '../src/infrastructure/security/AdminPasswordReset.js';
import {createGasSecurity} from '../src/infrastructure/security/GasSecurity.js';

const SHEET='synthetic-approved-sheet';
const BACKUP='synthetic-private-backup';
const ACCOUNT='synthetic-admin-user';
const PEPPER='synthetic-test-pepper-not-for-any-real-app-00001';
const PASSWORD='Synthetic-Reset-Unique-2026!';
// This fixture deliberately contains neither production credentials nor any real user ID.
const OLD_HASH='pbkdf2-sha256$150000$'+'a'.repeat(32)+'$'+'b'.repeat(64);
const TABLES=['vc_users','vc_user_roles','vc_sessions','vc_change_audit'];
const bytes=b=>[...b].map(x=>x>127?x-256:x);
function environment({password=PASSWORD,permission=true,approved=true,backup=true,failOnTable=null}={}){
 const tables={};
 const row=(name,data)=>DATABASE_SCHEMA.tables[name].columns.map(c=>data[c.name]??'');
 for(const name of TABLES)tables[name]=[DATABASE_SCHEMA.tables[name].columns.map(c=>c.name)];
 tables.vc_users.push(row('vc_users',{user_id:ACCOUNT,username_normalized:'admin',
  display_name:'Synthetic administrator',status:'ACTIVE',password_change_required:true,
  password_hash:OLD_HASH,created_at:'2026-11-17T12:00:00.000Z'}));
 tables.vc_user_roles.push(row('vc_user_roles',{assignment_id:'role-1',user_id:ACCOUNT,role_id:'SYSTEM_ADMIN',status:'ACTIVE'}));
 tables.vc_sessions.push(row('vc_sessions',{session_id:'old-session-1',user_id:ACCOUNT,status:'ACTIVE',revoked_at:''}));
 tables.vc_sessions.push(row('vc_sessions',{session_id:'old-session-2',user_id:ACCOUNT,status:'REVOKED',revoked_at:'prior'}));
 const state=new Map([
  ['VEHICLE_SHEET_ID',SHEET],
  ['VEHICLE_AUTH_PEPPER',PEPPER],
  ['VEHICLE_ADMIN_RESET_EXPECTED_SHEET_ID',SHEET],
  ['VEHICLE_ADMIN_RESET_EXPECTED_USER_ID',ACCOUNT],
  ['VEHICLE_ADMIN_RESET_BACKUP_FILE_ID',BACKUP],
  ['VEHICLE_ADMIN_RESET_NEW_PASSWORD',password]
 ]);
 if(approved)state.set('VEHICLE_ADMIN_RESET_APPROVAL','RESET_ADMIN_ONCE');
 const p={
  getProperty:k=>state.get(k)??null,
  setProperty:(k,v)=>{state.set(k,v);},
  deleteProperty:k=>{state.delete(k);}
 };
 const propertiesService={getScriptProperties:()=>p};
 const sheet=(name)=>({
  getLastRow(){return tables[name].length;},
  getLastColumn(){return tables[name][0].length;},
  getRange(r,c,h,w){return {
   getValues(){return tables[name].slice(r-1,r-1+h).map(items=>items.slice(c-1,c-1+w));},
   setValues(values){
    if(name===failOnTable)throw Error('SIMULATED_WRITE_FAILURE');
    for(let i=0;i<h;i++)for(let j=0;j<w;j++)tables[name][r-1+i][c-1+j]=values[i][j];
   }
  };},
  appendRow(row){tables[name].push([...row]);}
 });
 const spreadsheetApp={openById(id){
  assert.equal(id,SHEET);
  return{getSheetByName:name=>tables[name]?sheet(name):null};
 },flush(){}};
 let locks=0,releases=0;
 const lockService={getScriptLock(){return{
  tryLock(){locks++;return true;},releaseLock(){releases++;}
 }}};
 const utilities={
  newBlob(v){return{getBytes(){return bytes(Buffer.from(v,'utf8'));}};},
  computeDigest(_,v){return bytes(createHash('sha256').update(String(v)).digest());},
  computeHmacSha256Signature(v,key){
   return bytes(createHmac('sha256',Buffer.from(key)).update(typeof v==='string'?Buffer.from(v):Buffer.from(v)).digest());
  },
  getUuid(){return randomUUID();},
  Charset:{UTF_8:'UTF_8'},DigestAlgorithm:{SHA_256:'SHA_256'}
 };
 const driveApp={getFileById(id){
  if(!backup||id!==BACKUP)throw Error('NOT_FOUND');
  return{getId:()=>id,getMimeType:()=> 'application/vnd.google-apps.spreadsheet'};
 }};
 const create=()=>createOneTimeAdminPasswordReset({
  spreadsheetApp,lockService,utilities,propertiesService,driveApp,
  clock:()=> '2026-11-18T01:00:00.000Z'
 });
 const record=(name,idx=1)=>Object.fromEntries(tables[name][0].map((k,i)=>[k,tables[name][idx]?.[i]]));
 return {create,tables,state,record,utilities,propertiesService,
  locks:()=>locks,releases:()=>releases};
}

test('preflight is read-only and never exposes secret material',()=>{
 const env=environment();const old=JSON.stringify(env.tables);
 const output=env.create().inspect();
 assert.equal(output.status,'READY_FOR_EXPLICIT_EDITOR_RESET');
 assert.equal(output.sessionsToRevoke,1);
 assert.equal(output.dataModified,false);
 assert.equal(JSON.stringify(env.tables),old);
 const text=JSON.stringify(output);
 for(const secret of [PASSWORD,PEPPER,OLD_HASH,ACCOUNT,SHEET,BACKUP])
  assert.ok(!text.includes(secret),'preflight leaked restricted material');
 assert.equal(env.locks(),0);
});
test('one-time reset requires explicit approval',()=>{
 const env=environment({approved:false});assert.throws(()=>env.create().apply(),/RESET_EXPLICIT_APPROVAL_REQUIRED/);
 assert.equal(env.record('vc_users').password_hash,OLD_HASH);
 assert.equal(env.state.has('VEHICLE_ADMIN_RESET_STATE'),false);
});
test('a mismatched spreadsheet or user ID is fail-closed',()=>{
 const env=environment();
 env.state.set('VEHICLE_ADMIN_RESET_EXPECTED_SHEET_ID','wrong');
 assert.throws(()=>env.create().inspect(),/RESET_TARGET_OR_BACKUP_NOT_CONFIRMED/);
 env.state.set('VEHICLE_ADMIN_RESET_EXPECTED_SHEET_ID',SHEET);
 env.state.set('VEHICLE_ADMIN_RESET_EXPECTED_USER_ID','wrong');
 assert.throws(()=>env.create().apply(),/RESET_ADMIN_IDENTITY_MISMATCH/);
 assert.equal(env.record('vc_users').password_hash,OLD_HASH);
});
test('requires backup, existing active admin and SYSTEM_ADMIN assignment',()=>{
 const a=environment({backup:false});
 assert.throws(()=>a.create().inspect(),/RESET_BACKUP_NOT_ACCESSIBLE/);
 const b=environment();
 b.tables.vc_user_roles[1][2]='STAFF';
 assert.throws(()=>b.create().inspect(),/RESET_ADMIN_ROLE_MISMATCH/);
 const c=environment();
 c.tables.vc_users[1][6]='SUSPENDED';
 assert.throws(()=>c.create().apply(),/RESET_ADMIN_IDENTITY_MISMATCH/);
});
test('reject weak reset password before any write',()=>{
 const env=environment({password:'weak-password'});
 assert.throws(()=>env.create().apply(),/RESET_NEW_PASSWORD_POLICY_FAILED/);
 assert.equal(env.record('vc_users').password_hash,OLD_HASH);
});
test('approved Editor reset changes only hash, sessions and redacted audit once',()=>{
 const env=environment();const before=env.record('vc_users');
 const output=env.create().apply();
 assert.deepEqual({...output},{status:'DONE',account:'admin',sessionsRevoked:1,
  mustChangePassword:true,auditRecorded:true,dataModified:true});
 const after=env.record('vc_users');
 assert.equal(after.user_id,before.user_id);
 assert.equal(after.username_normalized,'admin');
 assert.equal(after.status,'ACTIVE');
 assert.equal(after.created_at,before.created_at);
 assert.equal(after.password_change_required,true);
 assert.notEqual(after.password_hash,OLD_HASH);
 const security=createGasSecurity({
  utilities:env.utilities,propertiesService:env.propertiesService,
  clock:()=> '2026-11-18T01:00:00.000Z'
 });
 assert.equal(security.verifyPassword(PASSWORD,after.password_hash),true);
 assert.equal(env.record('vc_sessions',1).status,'REVOKED');
 assert.equal(env.record('vc_sessions',2).status,'REVOKED');
 assert.equal(env.tables.vc_change_audit.length,2);
 assert.equal(env.record('vc_change_audit').action,'EDITOR_ADMIN_PASSWORD_RESET');
 assert.ok(env.state.get('VEHICLE_ADMIN_RESET_STATE').startsWith('DONE:'));
 assert.equal(env.state.has('VEHICLE_ADMIN_RESET_NEW_PASSWORD'),false);
 assert.equal(env.state.has('VEHICLE_ADMIN_RESET_APPROVAL'),false);
 assert.equal(env.locks(),env.releases());
 for(const forbidden of [PASSWORD,PEPPER,OLD_HASH,ACCOUNT,SHEET,BACKUP])
  assert.ok(!JSON.stringify(output).includes(forbidden),'reset log leaked restricted material');
 assert.throws(()=>env.create().apply(),/RESET_EXPLICIT_APPROVAL_REQUIRED|RESET_ALREADY_STARTED_OR_COMPLETED/);
 assert.equal(env.tables.vc_change_audit.length,2);
});
test('injected Sheet write failure marks recovery required and forbids retry',()=>{
 const env=environment({failOnTable:'vc_users'});
 assert.throws(()=>env.create().apply(),/SIMULATED_WRITE_FAILURE/);
 assert.equal(env.record('vc_users').password_hash,OLD_HASH);
 assert.equal(env.record('vc_sessions',1).status,'REVOKED'); // Safe partial revocation
 assert.ok(env.state.get('VEHICLE_ADMIN_RESET_STATE').startsWith('RECOVERY_REQUIRED:'));
 assert.equal(env.state.has('VEHICLE_ADMIN_RESET_NEW_PASSWORD'),false);
 assert.equal(env.state.has('VEHICLE_ADMIN_RESET_APPROVAL'),false);
 assert.equal(env.locks(),env.releases());
 env.state.set('VEHICLE_ADMIN_RESET_APPROVAL','RESET_ADMIN_ONCE');
 env.state.set('VEHICLE_ADMIN_RESET_NEW_PASSWORD',PASSWORD);
 assert.throws(()=>env.create().apply(),/RESET_ALREADY_STARTED_OR_COMPLETED/);
});
console.log('One-time admin reset: synthetic authorization, safety, lifecycle and failure tests completed');
