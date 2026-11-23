// TUNEUP L1+L2 (owner-approved 2026-11-23): SessionService.authorize round-trip reduction
// over the REAL Firestore REST gateway + store against the contract-enforcing fake server.
// L1: last_seen is a field-masked blind write (1 round, cannot resurrect a revoked session).
// L2: user + roles + overrides are read in ONE parallel fetchAll round after the session.
// Security invariant: nothing is cached across calls — every check is evaluated fresh.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFirestoreStore} from '../src/infrastructure/persistence/firestore/FirestoreStore.js';
import {createFirestoreRestGateway} from '../src/infrastructure/persistence/firestore/FirestoreRestGateway.js';
import {createSessionService} from '../src/application/security/SessionService.js';
import {createFakeFirestoreRest,makeFakeUtilities,fakeServiceAccountKey,PROJECT,DATABASE} from './fake-firestore-rest-server.mjs';

const NOW='2026-11-23T10:00:00.000Z';
const TOKEN='a'.repeat(64);
const sha256=v=>createHash('sha256').update(String(v),'utf8').digest('hex');
const security={now:()=>NOW,sha256};

function setup({fetchAll=true}={}){
  const fake=createFakeFirestoreRest();
  const transport=fetchAll?fake:{fetch:fake.fetch};
  const key=fakeServiceAccountKey();
  const gw=createFirestoreRestGateway({utilities:makeFakeUtilities(),urlFetchApp:transport,
    clientEmail:key.client_email,privateKey:key.private_key,projectId:PROJECT,databaseId:DATABASE,clock:()=>NOW});
  const store=createFirestoreStore({firestore:gw});
  fake.state.seed('vc_users','u1',{user_id:'u1',status:'ACTIVE',password_change_required:false,_seq:1});
  fake.state.seed('vc_user_roles','r1',{assignment_id:'r1',user_id:'u1',role_id:'STAFF',status:'ACTIVE',_seq:1});
  fake.state.seed('vc_user_permissions','p1',{override_id:'p1',user_id:'u1',permission:'audit.read',status:'ACTIVE',_seq:1});
  fake.state.seed('vc_sessions','s1',{session_id:'s1',user_id:'u1',token_digest:sha256(TOKEN),status:'ACTIVE',
    issued_at:'2026-11-23T09:00:00.000Z',expires_at:'2026-11-23T17:00:00.000Z',last_seen_at:'2026-11-23T09:55:00.000Z',
    idle_timeout_minutes:30,revoked_at:'',_seq:1});
  store.one('vc_settings',{key:'warm'}); // prime the per-execution OAuth token
  return {fake,store,sessions:createSessionService({store,security})};
}

test('L1+L2: authorize = 3 sequential rounds (session query → parallel user/roles/overrides → masked last_seen write)',()=>{
  const {fake,sessions}=setup();
  const r0=fake.state.rounds,q0=fake.state.requests.length;
  const out=sessions.authorize(TOKEN,'vehicle.lookup');
  assert.equal(fake.state.rounds-r0,3,'was 6 sequential rounds before the tuneup');
  assert.equal(fake.state.requests.length-q0,5,'5 HTTP calls: 1 + 3 (parallel) + 1 — was 6');
  assert.deepEqual(out.roles,['STAFF']);
  assert.ok(out.permissions.includes('vehicle.lookup')&&out.permissions.includes('audit.read'),'role + override permissions resolved');
  assert.equal(out.sessionId,'s1');
  const saved=fake.state.plain('vc_sessions','s1');
  assert.equal(saved.last_seen_at,NOW,'last_seen persisted');
  assert.equal(saved.token_digest,sha256(TOKEN),'masked write left other fields intact');
  assert.equal(saved._seq,1,'internal ordering field untouched');
  const commit=JSON.parse(fake.state.requests.at(-1).payload);
  assert.deepEqual(commit.writes[0].updateMask.fieldPaths,['last_seen_at'],'only last_seen_at is written');
  assert.deepEqual(commit.writes[0].currentDocument,{exists:true});
});

test('L1 closes the revoke-resurrection race: a revoke landing between authorize reads and its last_seen write stays REVOKED',()=>{
  const {fake,sessions}=setup();
  fake.state.onRequest=(url)=>{
    if(!url.endsWith(':commit'))return;
    fake.state.onRequest=null; // concurrent logout/revokeUser commits first
    const s=fake.state.plain('vc_sessions','s1');
    fake.state.seed('vc_sessions','s1',{...s,status:'REVOKED',revoked_at:NOW});
  };
  sessions.authorize(TOKEN,'vehicle.lookup'); // this request passed its checks before the revoke
  const saved=fake.state.plain('vc_sessions','s1');
  assert.equal(saved.status,'REVOKED','last_seen write must not overwrite the revoke');
  assert.equal(saved.revoked_at,NOW);
  assert.throws(()=>sessions.authorize(TOKEN,'vehicle.lookup'),/UNAUTHENTICATED/,'the very next call is rejected');
});

test('pre-tuneup read-modify-write update DID resurrect a concurrent revoke (documents the closed bug)',()=>{
  const {fake,store}=setup();
  fake.state.onRequest=(url)=>{
    if(!url.endsWith(':commit'))return;
    fake.state.onRequest=null;
    const s=fake.state.plain('vc_sessions','s1');
    fake.state.seed('vc_sessions','s1',{...s,status:'REVOKED',revoked_at:NOW});
  };
  store.update('vc_sessions',{session_id:'s1'},{last_seen_at:NOW}); // the old authorize write path
  assert.equal(fake.state.plain('vc_sessions','s1').status,'ACTIVE','full-document overwrite lost the revoke');
});

test('no caching: role removal, user suspension and session revoke take effect on the very next call',()=>{
  const {fake,sessions}=setup();
  sessions.authorize(TOKEN,'vehicle.lookup');
  fake.state.seed('vc_user_roles','r1',{assignment_id:'r1',user_id:'u1',role_id:'STAFF',status:'REVOKED',_seq:1});
  assert.throws(()=>sessions.authorize(TOKEN,'vehicle.lookup'),/FORBIDDEN/,'role removal immediate');
  assert.ok(sessions.authorize(TOKEN,'audit.read'),'remaining override still honoured');
  fake.state.seed('vc_users','u1',{user_id:'u1',status:'SUSPENDED',_seq:1});
  assert.throws(()=>sessions.authorize(TOKEN,'audit.read'),/UNAUTHENTICATED/,'user suspension immediate');
});

test('rejections never write last_seen (FORBIDDEN / idle-expired / revoked)',()=>{
  const {fake,sessions}=setup();
  const before=fake.state.plain('vc_sessions','s1').last_seen_at;
  assert.throws(()=>sessions.authorize(TOKEN,'users.manage'),/FORBIDDEN/);
  assert.equal(fake.state.plain('vc_sessions','s1').last_seen_at,before);
  const s=fake.state.plain('vc_sessions','s1');
  fake.state.seed('vc_sessions','s1',{...s,last_seen_at:'2026-11-23T09:00:00.000Z'});
  assert.throws(()=>sessions.authorize(TOKEN,'vehicle.lookup'),/SESSION_IDLE_EXPIRED/);
  assert.equal(fake.state.plain('vc_sessions','s1').last_seen_at,'2026-11-23T09:00:00.000Z');
});

test('transport without fetchAll degrades to sequential reads with identical results',()=>{
  const {fake,sessions}=setup({fetchAll:false});
  const r0=fake.state.rounds;
  const out=sessions.authorize(TOKEN,'vehicle.lookup');
  assert.equal(fake.state.rounds-r0,5,'sequential fallback: 1 + 3 + 1');
  assert.deepEqual(out.roles,['STAFF']);
  assert.equal(fake.state.plain('vc_sessions','s1').last_seen_at,NOW);
});

test('store.patch guards: primary key only, known columns only, NOT_FOUND on missing doc',()=>{
  const {store}=setup();
  assert.throws(()=>store.patch('vc_sessions',{user_id:'u1'},{last_seen_at:NOW}),/PATCH_REQUIRES_PRIMARY_KEY/);
  assert.throws(()=>store.patch('vc_sessions',{session_id:'s1'},{not_a_column:1}),/INVALID_PATCH/);
  assert.throws(()=>store.patch('vc_sessions',{session_id:'missing'},{last_seen_at:NOW}),/NOT_FOUND/);
});
