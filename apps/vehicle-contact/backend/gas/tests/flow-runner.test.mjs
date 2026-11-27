// VC-ADR-046 phase 2b: one use case, two engines. The same flow must give the same result, the same error and the
// same store writes on the synchronous runner (legacy engine) and the asynchronous runner (Node core).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runFlowSync, runFlowAsync} from '../src/application/flows/FlowRunner.js';
import {sessionAuthorizeFlow} from '../src/application/flows/SessionAuthorizeFlow.js';

const sha256 = x => createHash('sha256').update(String(x)).digest('hex');
function memoryStore(tables) {
  const db = structuredClone(tables), writes = [];
  const match = (row, f) => Object.entries(f || {}).every(([k, v]) => row[k] === v);
  const s = {
    writes,
    one: (n, f) => { const hits = (db[n] || []).filter(r => match(r, f)); if (hits.length > 1) throw new Error('DUPLICATE_KEY'); return hits[0] ? {...hits[0]} : null; },
    list: (n, f) => (db[n] || []).filter(r => match(r, f)).map(r => ({...r})),
    insert: (n, row) => { writes.push(['insert', n, row]); (db[n] ||= []).push({...row}); return {...row}; },
    patch: (n, f, fields) => { writes.push(['patch', n, f, fields]); for (const r of db[n] || []) if (match(r, f)) Object.assign(r, fields); return true; },
    readMany: (reqs, opts = {}) => { for (const [n, row] of opts.inserts || []) s.insert(n, row); return reqs.map(r => r.kind === 'one' ? s.one(r.name, r.filter) : s.list(r.name, r.filter)); }
  };
  return s;
}
// the same store behind promises (what the core's Firestore SDK store looks like to a flow)
const asyncOf = s => ({writes: s.writes, readMany: async (q, o) => s.readMany(q, o), patch: async (...a) => s.patch(...a), insert: async (...a) => s.insert(...a)});
const memoryCache = () => { const m = new Map(); return {get: k => m.get(k) ?? null, put: (k, v) => m.set(k, v)}; };

async function both(flowFactory, tables, {cache = false} = {}) {
  const out = [];
  for (const mode of ['sync', 'async']) {
    const store = memoryStore(tables), c = cache ? memoryCache() : null;
    let result, error = null;
    try { result = mode === 'sync' ? runFlowSync(flowFactory(), {store, cache: c}) : await runFlowAsync(flowFactory(), {store: asyncOf(store), cache: c}); }
    catch (e) { error = e.message; }
    out.push({result, error, writes: store.writes});
  }
  assert.deepEqual(out[1], out[0], 'async engine = sync engine');
  return out[0];
}

test('FLOW-01 reads, inserts and patches behave the same on both runners; store errors reach the flow on both', async () => {
  function* f() {
    const [a, b] = yield {reads: [{kind: 'one', name: 't', filter: {id: 1}}, {kind: 'list', name: 't', filter: {}}], inserts: [['log', {id: 9}]]};
    yield {patch: {table: 't', filter: {id: 1}, fields: {seen: true}}};
    try { yield {reads: [{kind: 'one', name: 't', filter: {dup: true}}]}; } catch (e) { return {a, n: b.length, caught: e.message}; }
    return 'not reached';
  }
  const r = await both(f, {t: [{id: 1}, {id: 2, dup: true}, {id: 3, dup: true}]});
  assert.deepEqual(r.result, {a: {id: 1}, n: 3, caught: 'DUPLICATE_KEY'});
  assert.deepEqual(r.writes.map(w => w[0]), ['insert', 'patch']);
});

// ---- the session check: every rule, both engines ----
const NOW = '2026-11-27T10:00:00.000Z', TOKEN = 'a'.repeat(64);
const session = (over = {}) => ({session_id: 's1', user_id: 'u1', token_digest: sha256(TOKEN), status: 'ACTIVE', revoked_at: '',
  issued_at: '2026-11-27T09:00:00.000Z', expires_at: '2026-11-27T17:00:00.000Z', last_seen_at: '2026-11-27T09:59:30.000Z',
  idle_timeout_minutes: 30, access_json: JSON.stringify({roles: ['STAFF'], permissions: ['vehicle.lookup']}), ...over});
const user = (over = {}) => ({user_id: 'u1', status: 'ACTIVE', password_change_required: false, password_hash: 'h', password_salt: 's', ...over});
const auth = (over = {}) => () => sessionAuthorizeFlow({token: TOKEN, permission: 'vehicle.lookup', ...over}, {sha256, now: () => NOW});

test('FLOW-02 session check: every rule gives the same answer and the same writes on both engines', async () => {
  const cases = [
    ['valid (snapshot)', {}, {vc_sessions: [session()], vc_users: [user()]}, null],
    ['bad token shape', {token: 'x'}, {}, 'UNAUTHENTICATED'],
    ['unknown token', {}, {vc_sessions: [], vc_users: [user()]}, 'UNAUTHENTICATED'],
    ['revoked', {}, {vc_sessions: [session({status: 'REVOKED', revoked_at: NOW})], vc_users: [user()]}, 'UNAUTHENTICATED'],
    ['inactive user', {}, {vc_sessions: [session()], vc_users: [user({status: 'SUSPENDED'})]}, 'UNAUTHENTICATED'],
    ['expired', {}, {vc_sessions: [session({expires_at: '2026-11-27T09:30:00.000Z'})], vc_users: [user()]}, 'SESSION_EXPIRED'],
    ['idle', {}, {vc_sessions: [session({last_seen_at: '2026-11-27T09:00:00.000Z'})], vc_users: [user()]}, 'SESSION_IDLE_EXPIRED'],
    ['bad idle policy', {}, {vc_sessions: [session({idle_timeout_minutes: 0})], vc_users: [user()]}, 'INVALID_SESSION_POLICY'],
    ['password change required', {}, {vc_sessions: [session()], vc_users: [user({password_change_required: 'true'})]}, 'PASSWORD_CHANGE_REQUIRED'],
    ['password change allowed', {allowPasswordChange: true}, {vc_sessions: [session()], vc_users: [user({password_change_required: true})]}, null],
    ['forbidden', {permission: 'users.manage'}, {vc_sessions: [session()], vc_users: [user()]}, 'FORBIDDEN'],
    ['live roles (no snapshot)', {}, {vc_sessions: [session({access_json: ''})], vc_users: [user()],
      vc_user_roles: [{user_id: 'u1', role_id: 'STAFF', status: 'ACTIVE'}], vc_user_permissions: []}, null],
    ['touch after 60 s', {}, {vc_sessions: [session({last_seen_at: '2026-11-27T09:58:00.000Z'})], vc_users: [user()]}, null]
  ];
  for (const [name, input, tables, expected] of cases) {
    const r = await both(auth(input), tables);
    assert.equal(r.error, expected, name);
    if (!expected) {
      assert.equal(r.result.userId, 'u1', name);
      assert.ok(r.result.permissions.includes('vehicle.lookup'), name);
      assert.equal('password_hash' in r.result.user, true, name + ': live user returned on a fresh load (as before)');
    }
  }
  const touched = await both(auth(), {vc_sessions: [session({last_seen_at: '2026-11-27T09:58:00.000Z'})], vc_users: [user()]});
  assert.deepEqual(touched.writes, [['patch', 'vc_sessions', {session_id: 's1'}, {last_seen_at: NOW}]], 'one field-masked touch');
  const quiet = await both(auth(), {vc_sessions: [session()], vc_users: [user()]});
  assert.deepEqual(quiet.writes, [], 'no touch within the minute');
});

test('FLOW-03 snapshot cache: a cached session needs no read; fresh ignores the cache; secrets never cached', async () => {
  const cache = memoryCache(), store = memoryStore({vc_sessions: [session()], vc_users: [user()]});
  let reads = 0; const counting = {...store, readMany: (q, o) => { reads++; return store.readMany(q, o); }};
  runFlowSync(auth()(), {store: counting, cache});
  assert.equal(reads, 2, 'first call: session + user');
  const cached = cache.get('p6vc:sess:' + sha256(TOKEN));
  assert.doesNotMatch(cached, /password_hash|password_salt/);
  runFlowSync(auth()(), {store: counting, cache});
  assert.equal(reads, 2, 'second call: served from the snapshot');
  runFlowSync(auth({fresh: true})(), {store: counting, cache});
  assert.equal(reads, 4, 'fresh: live rows');
});
