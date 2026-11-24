// Speed slice (owner: "ระบบช้ามาก"; session cache owner-approved 2026-11-24).
// Proves: the Firestore token is reused across executions; the session snapshot saves round trips;
// revocation (logout / revokeUser) is still immediate; the password hash is never cached; ops that
// verify the password read live rows; last_seen is written at most once per minute.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFirestoreStore} from '../src/infrastructure/persistence/firestore/FirestoreStore.js';
import {createFirestoreRestGateway} from '../src/infrastructure/persistence/firestore/FirestoreRestGateway.js';
import {createSessionService} from '../src/application/security/SessionService.js';
import {createFakeFirestoreRest,makeFakeUtilities,fakeServiceAccountKey,PROJECT,DATABASE} from './fake-firestore-rest-server.mjs';

function memoryCache(){const m=new Map();return {m,get:k=>m.has(k)?m.get(k):null,put:(k,v)=>m.set(k,v),remove:k=>m.delete(k)};}
const key=fakeServiceAccountKey();
function gw(fake,tokenCache){return createFirestoreRestGateway({utilities:makeFakeUtilities(),urlFetchApp:fake,clientEmail:key.client_email,
  privateKey:key.private_key,projectId:PROJECT,databaseId:DATABASE,clock:()=>new Date().toISOString(),tokenCache});}
const tokenCalls=fake=>fake.state.requests.filter(r=>/oauth2\.googleapis\.com\/token/.test(r.url)).length;

test('SPEED-01 the Firestore access token is minted once and reused by later executions',()=>{
  const fake=createFakeFirestoreRest(),cache=memoryCache();
  createFirestoreStore({firestore:gw(fake,cache)}).one('vc_users',{user_id:'x'});
  createFirestoreStore({firestore:gw(fake,cache)}).one('vc_users',{user_id:'y'}); // a "new execution"
  assert.equal(tokenCalls(fake),1,'second execution reused the cached token');
  const noCache=createFakeFirestoreRest();
  createFirestoreStore({firestore:gw(noCache,null)}).one('vc_users',{user_id:'x'});
  createFirestoreStore({firestore:gw(noCache,null)}).one('vc_users',{user_id:'y'});
  assert.equal(tokenCalls(noCache),2,'without the cache every execution paid the exchange (old behaviour)');
});

function setup(){
  const fake=createFakeFirestoreRest(),cache=memoryCache();
  let now=Date.parse('2026-11-24T10:00:00.000Z');
  const security={now:()=>new Date(now).toISOString(),sha256:v=>'d'+String(v).slice(0,10),secretToken:()=>'s'+Math.random().toString(16).slice(2)};
  const store=createFirestoreStore({firestore:gw(fake,cache)});
  const at=new Date(now).toISOString();
  store.insert('vc_users',{user_id:'u1',username_normalized:'u1',display_name:'U1',password_hash:'SECRET-HASH',password_change_required:false,status:'ACTIVE',created_at:at,updated_at:at});
  store.insert('vc_user_roles',{assignment_id:'a1',user_id:'u1',role_id:'STAFF',status:'ACTIVE'});
  const token='a'.repeat(64);
  store.insert('vc_sessions',{session_id:'s1',user_id:'u1',token_digest:security.sha256(token),status:'ACTIVE',issued_at:at,
    expires_at:new Date(now+8*3600e3).toISOString(),last_seen_at:at,idle_timeout_minutes:30,revoked_at:''});
  const sessions=createSessionService({store,security,cache});
  return {fake,cache,store,sessions,token,advance:ms=>{now+=ms;}};
}

test('SPEED-02 a cached session skips the session/user/role reads and never stores the password hash',()=>{
  const {fake,cache,sessions,token}=setup();
  const n0=fake.state.requests.length;
  const first=sessions.authorize(token,'vehicle.lookup');
  const n1=fake.state.requests.length;
  const second=sessions.authorize(token,'vehicle.lookup');
  assert.equal(fake.state.requests.length,n1,'second call: zero Firestore requests');
  assert.ok(n1-n0>=2,'first call read session + user/roles');
  assert.equal(second.userId,'u1');assert.deepEqual(second.permissions,first.permissions);
  for(const v of cache.m.values())assert.ok(!String(v).includes('SECRET-HASH'),'no password hash in the cache');
  assert.equal(second.user.password_hash,undefined);
});

test('SPEED-03 logout and revokeUser drop the snapshot: the very next call is UNAUTHENTICATED',()=>{
  const a=setup();
  const actor=a.sessions.authorize(a.token,'vehicle.lookup');
  a.sessions.endSession(actor);
  assert.throws(()=>a.sessions.authorize(a.token,'vehicle.lookup'),/UNAUTHENTICATED/,'logout is immediate');
  const b=setup();
  b.sessions.authorize(b.token,'vehicle.lookup');
  b.sessions.revokeUser('u1'); // password change / suspend / reset / role change all use this
  assert.throws(()=>b.sessions.authorize(b.token,'vehicle.lookup'),/UNAUTHENTICATED/,'revocation is immediate');
});

test('SPEED-04 password-verifying ops read live rows (with the hash); others get the stripped snapshot',()=>{
  const {sessions,token}=setup();
  sessions.authorize(token,'vehicle.lookup');
  const fresh=sessions.authorize(token,'session.authenticated',{fresh:true});
  assert.equal(fresh.user.password_hash,'SECRET-HASH','change password / link Google can verify the hash');
});

test('SPEED-05 last_seen is written at most once per minute, and idle/expiry checks still apply to the snapshot',()=>{
  const {fake,sessions,token,advance,store}=setup();
  sessions.authorize(token,'vehicle.lookup');
  const commits=()=>fake.state.requests.filter(r=>/:commit$/.test(r.url)).length;
  const c0=commits();
  advance(20e3);sessions.authorize(token,'vehicle.lookup');
  assert.equal(commits(),c0,'no write within the minute');
  advance(50e3);sessions.authorize(token,'vehicle.lookup');
  assert.equal(commits(),c0+1,'one write after a minute');
  assert.notEqual(store.one('vc_sessions',{session_id:'s1'}).last_seen_at,'2026-11-24T10:00:00.000Z');
  advance(31*60e3);
  assert.throws(()=>sessions.authorize(token,'vehicle.lookup'),/SESSION_IDLE_EXPIRED/);
});

test('SPEED-06 queries + an append-only insert share ONE parallel round; a duplicate insert still fails atomically',()=>{
  const fake=createFakeFirestoreRest(),store=createFirestoreStore({firestore:gw(fake,memoryCache())});
  store.insert('vc_users',{user_id:'u9',username_normalized:'u9',display_name:'U9',status:'ACTIVE',created_at:'x',updated_at:'x'});
  const r0=fake.state.rounds;
  const row={audit_id:'la1',actor_id:'a',vehicle_id:'v',lookup_source:'DETAIL',result:'FOUND',correlation_id:'c',created_at:'x'};
  const [u]=store.readMany([{kind:'one',name:'vc_users',filter:{user_id:'u9'}}],{inserts:[['vc_lookup_audit',row]]});
  assert.equal(u.user_id,'u9');
  assert.equal(fake.state.rounds-r0,1,'reads + insert in one round');
  assert.equal(store.list('vc_lookup_audit',{vehicle_id:'v'}).length,1,'audit row persisted');
  assert.throws(()=>store.readMany([{kind:'one',name:'vc_users',filter:{user_id:'u9'}}],{inserts:[['vc_lookup_audit',row]]}),/DUPLICATE_KEY/);
});
