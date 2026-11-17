// P6 Vehicle Contact: synthetic end-to-end router/controller/session tests.
// No real credentials, Google Sheets, Drive, network calls or PII.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createApiRouter} from '../src/api/routes/Router.js';
import {createOperationController} from '../src/api/controllers/OperationController.js';
import {createSessionService} from '../src/application/security/SessionService.js';
const FIXED_TIME='2026-11-17T14:00:00.000Z';
const OLD_PASSWORD='Synthetic-Password-12345!';
const NEW_PASSWORD='Synthetic-New-Password-12345!';
const clone=x=>structuredClone(x);
function harness(){
 const map=new Map([
  ['vc_users',[{user_id:'u-admin',username_normalized:'admin',display_name:'Staging Admin',
    password_hash:'test-only:'+OLD_PASSWORD,password_change_required:true,status:'ACTIVE',org_id:''}]],
  ['vc_user_roles',[{assignment_id:'role-1',user_id:'u-admin',role_id:'SYSTEM_ADMIN',status:'ACTIVE'}]],
  ['vc_settings',[{key:'idle_timeout_minutes',value:'30'}]],['vc_sessions',[]],
  ['vc_user_permissions',[]],['vc_security_events',[]],['vc_change_audit',[]]
 ]);
 let current=FIXED_TIME,counter=0,lockCalls=0;
 function records(table){if(!map.has(table))map.set(table,[]);return map.get(table);}
 const match=(row,filter)=>Object.entries(filter||{}).every(([k,v])=>row[k]===v);
 const store={
  one(t,filter){const hits=records(t).filter(r=>match(r,filter));if(hits.length>1)throw Error('DUPLICATE_KEY');return hits.length?clone(hits[0]):null;},
  list(t,filter={},limit=5000){return clone(records(t).filter(r=>match(r,filter)).slice(0,limit));},
  listNewest(t,filter={},limit=5000){return clone(records(t).filter(r=>match(r,filter)).slice(-limit));},
  insert(t,row){records(t).push(clone(row));return clone(row);},
  update(t,filter,patch){const hits=records(t).filter(r=>match(r,filter));if(hits.length!==1)throw Error('NOT_FOUND');Object.assign(hits[0],clone(patch));return clone(hits[0]);},
  remove(t,filter){const hits=records(t).filter(r=>match(r,filter));if(hits.length!==1)throw Error('NOT_FOUND');records(t).splice(records(t).indexOf(hits[0]),1);return true;},
  withLock(fn){lockCalls++;return fn();},
  sequence(fn){return fn();}
 };
 const security={
  now:()=>current,
  secretToken:()=>String(++counter).padStart(64,'0'),
  sha256:v=>createHash('sha256').update(String(v),'utf8').digest('hex'),
  hashPassword:password=>{if(typeof password!=='string'||password.length<12||password.length>128)throw Error('INVALID_PASSWORD');return 'test-only:'+password;},
  verifyPassword:(password,stored)=>stored==='test-only:'+password,
  verifyGoogle:token=>{if(token!=='synthetic-valid-oidc')throw Error('INVALID_GOOGLE_TOKEN');return {sub:'sub-test-001'};}
 };
 const sessions=createSessionService({store,security});
 const fakeDrive={upload(){throw Error('NO_TEST_DRIVE_WRITE');},trash(){throw Error('NO_TEST_DRIVE_DELETE');}};
 const router=createApiRouter({createProtectedDispatcher:()=>createOperationController({
  store,security,sessions,drivePhotos:fakeDrive,allowDestructiveRetention:false
 })});
 const dispatch=(group,action,payload={},sessionToken,method='POST',extra={})=>router.dispatch(
  {apiVersion:'v1',group,action,payload,...(sessionToken?{sessionToken}:{}),...extra},method
 );
 const login=(username='admin',password=OLD_PASSWORD)=>dispatch('auth','login',{username,password});
 const activate=()=>store.update('vc_users',{user_id:'u-admin'},{password_change_required:false});
 return {map,store,security,sessions,dispatch,login,activate,setTime:t=>current=t,lockCalls:()=>lockCalls};
}
function expectCode(r,code){
 assert.equal(r.ok,false,JSON.stringify(r));
 assert.equal(r.error?.code,code,JSON.stringify(r));
 assert.equal(r.data,null);
}
test('TC-AUTH-01 valid synthetic admin login issues digest-only session and password-change flag',()=>{
 const h=harness(),r=h.login();
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.match(r.data.sessionToken,/^[0-9]{64}$/);
 assert.equal(r.data.mustChangePassword,true);
 assert.equal(h.map.get('vc_sessions').length,1);
 const row=h.map.get('vc_sessions')[0];
 assert.equal(row.token_digest,h.security.sha256(r.data.sessionToken));
 assert.ok(!JSON.stringify(row).includes(r.data.sessionToken),'raw session token must not persist');
 assert.equal(h.map.get('vc_security_events')[0].status,'SUCCESS');
});
test('TC-AUTH-02 invalid password and unknown username have indistinguishable errors and no session',()=>{
 const h=harness();
 const wrong=h.login('admin','definitely-wrong');
 const unknown=h.login('missing-user','definitely-wrong');
 expectCode(wrong,'INVALID_CREDENTIALS');
 expectCode(unknown,'INVALID_CREDENTIALS');
 assert.deepEqual(wrong.error,unknown.error);
 assert.equal(h.map.get('vc_sessions').length,0);
 assert.equal(h.map.get('vc_security_events').length,2);
});
test('TC-AUTH-03 six failures in 15 minutes block further login; no additional session',()=>{
 const h=harness();
 for(let i=0;i<6;i++)expectCode(h.login('admin','wrong-password'),'INVALID_CREDENTIALS');
 expectCode(h.login('admin',OLD_PASSWORD),'LOGIN_RATE_LIMIT');
 assert.equal(h.map.get('vc_sessions').length,0);
});
test('TC-AUTH-04 initial password-change requirement blocks permissions, allows session and password change',()=>{
 const h=harness(),token=h.login().data.sessionToken;
 expectCode(h.dispatch('system','config.get',{},token),'PASSWORD_CHANGE_REQUIRED');
 const status=h.dispatch('auth','session',{},token);
 assert.equal(status.ok,true,JSON.stringify(status));
 assert.equal(status.data.mustChangePassword,true);
 const change=h.dispatch('auth','changePassword',{oldPassword:OLD_PASSWORD,newPassword:NEW_PASSWORD},token);
 assert.equal(change.ok,true,JSON.stringify(change));
 assert.equal(change.data.reauthenticate,true);
 const user=h.store.one('vc_users',{user_id:'u-admin'});
 assert.equal(user.password_hash,'test-only:'+NEW_PASSWORD);
 assert.equal(user.password_change_required,false);
 assert.equal(h.map.get('vc_sessions')[0].status,'REVOKED');
 expectCode(h.dispatch('auth','session',{},token),'UNAUTHENTICATED');
 expectCode(h.login('admin',OLD_PASSWORD),'INVALID_CREDENTIALS');
 const next=h.login('admin',NEW_PASSWORD);
 assert.equal(next.ok,true);
 assert.equal(next.data.mustChangePassword,false);
});
test('TC-AUTH-05 wrong old password cannot change password',()=>{
 const h=harness(),token=h.login().data.sessionToken;
 expectCode(h.dispatch('auth','changePassword',{oldPassword:'incorrect',newPassword:NEW_PASSWORD},token),'INVALID_CREDENTIALS');
 assert.equal(h.store.one('vc_users',{user_id:'u-admin'}).password_hash,'test-only:'+OLD_PASSWORD);
});
test('TC-SESS-01 expire, idle timeout, revoked and malformed tokens fail closed',()=>{
 for(const scenario of ['expired','idle','revoked','malformed']){
  const h=harness();h.activate();
  const token=h.login().data.sessionToken;
  if(scenario==='expired')h.setTime('2026-11-17T22:00:00.000Z');
  if(scenario==='idle')h.setTime('2026-11-17T14:30:00.000Z');
  if(scenario==='revoked')h.store.update('vc_sessions',{user_id:'u-admin'},{status:'REVOKED'});
  const result=h.dispatch('system','config.get',{},scenario==='malformed'?'spoofed':token);
  expectCode(result,scenario==='expired'?'SESSION_EXPIRED':scenario==='idle'?'SESSION_IDLE_EXPIRED':'UNAUTHENTICATED');
 }
});
test('TC-SESS-02 successful access refreshes last_seen_at; logout revokes session',()=>{
 const h=harness();h.activate();
 const token=h.login().data.sessionToken;
 h.setTime('2026-11-17T14:04:00.000Z');
 assert.equal(h.dispatch('system','config.get',{},token).ok,true);
 assert.equal(h.store.one('vc_sessions',{user_id:'u-admin'}).last_seen_at,'2026-11-17T14:04:00.000Z');
 assert.equal(h.dispatch('auth','logout',{},token).ok,true);
 expectCode(h.dispatch('system','config.get',{},token),'UNAUTHENTICATED');
});
test('TC-RBAC-01 admin has settings permissions but not implicit vehicle lookup; fake role in body cannot escalate',()=>{
 const h=harness();h.activate();
 const token=h.login().data.sessionToken;
 assert.equal(h.dispatch('system','config.get',{},token).ok,true);
 expectCode(h.dispatch('vehicles','lookup',{plate:'TEST1',province:'TH-10'},token),'FORBIDDEN');
 expectCode(h.dispatch('system','config.update',{values:{idle_timeout_minutes:31},role:'SYSTEM_ADMIN'},token),'INVALID_REQUEST');
 const settings=h.dispatch('system','config.get',{},token);
 assert.equal(settings.data.idle_timeout_minutes,'30');
 assert.equal(h.map.get('vc_settings').length,1);
});
test('TC-RBAC-02 STAFF role does not gain admin permission or destructive retention from spoofed fields',()=>{
 const h=harness();h.activate();
 h.store.update('vc_user_roles',{assignment_id:'role-1'},{role_id:'STAFF'});
 const token=h.login().data.sessionToken;
 expectCode(h.dispatch('system','config.get',{},token),'FORBIDDEN');
 expectCode(h.dispatch('retention','execute',{jobId:'job-synthetic'},token),'FORBIDDEN');
 expectCode(h.dispatch('audit','query',{},token),'FORBIDDEN');
 expectCode(h.dispatch('users','list',{},token),'FORBIDDEN');
});
test('TC-RBAC-03 suspended user rejected even if previous session exists',()=>{
 const h=harness();h.activate();
 const token=h.login().data.sessionToken;
 h.store.update('vc_users',{user_id:'u-admin'},{status:'SUSPENDED'});
 expectCode(h.dispatch('system','config.get',{},token),'UNAUTHENTICATED');
});
test('TC-API-01 schema/unknown method/unknown operation and missing credentials fail closed',()=>{
 const h=harness();
 assert.equal(h.dispatch('system','health',{},undefined,'GET').ok,true);
 expectCode(h.dispatch('vehicles','lookup',{plate:'TEST1',province:'TH-10'}),'UNAUTHENTICATED');
 expectCode(h.dispatch('system','config.get',{}),'UNAUTHENTICATED');
 expectCode(h.dispatch('vehicle','get',{}),'NOT_FOUND');
 expectCode(h.dispatch('auth','login',{username:'admin',password:OLD_PASSWORD},undefined,'GET'),'METHOD_NOT_ALLOWED');
 expectCode(h.dispatch('auth','login',{username:'admin',password:OLD_PASSWORD},undefined,'POST',{apiVersion:'v9'}),'BAD_REQUEST');
 expectCode(h.dispatch('auth','login',{username:'admin',password:OLD_PASSWORD,permissions:['*']}),'INVALID_REQUEST');
});
test('TC-API-02 no leaked secrets in failures or API status',()=>{
 const h=harness();
 const r=h.login('admin','wrong-sensitive-synthetic-string');
 expectCode(r,'INVALID_CREDENTIALS');
 assert.ok(!JSON.stringify(r).includes('wrong-sensitive'));
 assert.equal(r.requestId,null);
});
