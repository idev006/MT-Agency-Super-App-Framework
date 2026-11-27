// VC-ADR-046 phase 2b-1b: the core's async Firestore store follows the SAME store contract and the SAME storage rules as
// the legacy FirestoreStore — both write identical documents and each reads what the other wrote.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Timestamp} from '@google-cloud/firestore';
import {runStorePortContract} from '../../gas/tests/support/store-port-contract.mjs';
import {createFirestoreStore} from '../../gas/src/infrastructure/persistence/firestore/FirestoreStore.js';
import {createFirestoreStoreAsync} from '../src/adapters/firestore/store.mjs';
import {toFirestore, fromFirestore} from '../src/adapters/firestore/sdk-gateway.mjs';

// one in-memory document database behind both gateway shapes (sync for the legacy store, async for the core store)
function memoryFirestore() {
  const db = new Map(), coll = n => (db.has(n) || db.set(n, new Map()), db.get(n));
  const fail = code => { throw Object.assign(new Error(code), {code}); };
  const query = (name, {where = [], orderBy, limit} = {}) => {
    let docs = [...coll(name)].map(([id, f]) => ({id, fields: structuredClone(f), updateTime: 'v' + f._seq}));
    for (const w of where) docs = docs.filter(d => d.fields[w.field] === w.value);
    if (orderBy) docs.sort((a, b) => (a.fields[orderBy.field] - b.fields[orderBy.field]) * (orderBy.direction === 'desc' ? -1 : 1));
    return limit !== undefined ? docs.slice(0, limit) : docs;
  };
  const commit = writes => {
    for (const w of writes) { const m = coll(w.coll); if (w.type === 'create' && m.has(w.id)) fail('ALREADY_EXISTS'); if (w.type !== 'create' && !m.has(w.id)) fail('NOT_FOUND'); }
    for (const w of writes) { const m = coll(w.coll); if (w.type === 'delete') m.delete(w.id); else m.set(w.id, {...(m.get(w.id) || {}), ...structuredClone(w.fields)}); }
    return true;
  };
  const count = (name, spec) => query(name, spec).length;
  const queryMany = specs => specs.map(s => (s.count ? count(s.coll, s) : query(s.coll, s)));
  const sync = {query, count, commit, queryMany, queryManyAndCommit: (s, w) => { commit(w); return queryMany(s); }, batchGetMany: () => [],
    runTransaction: fn => fn(sync), get: (n, id) => coll(n).get(id) || null};
  const async = {query: async (...a) => query(...a), count: async (...a) => count(...a), commit: async w => commit(w),
    queryMany: async s => queryMany(s), queryManyAndCommit: async (s, w) => { commit(w); return queryMany(s); }};
  return {sync, async, raw: db};
}

const user = (id, over = {}) => ({user_id: id, username_normalized: 'user-' + id, display_name: 'User ' + id, status: 'ACTIVE',
  password_hash: '', password_salt: '', password_change_required: false, created_at: '2026-11-27T00:00:00.000Z', updated_at: '2026-11-27T00:00:00.000Z', ...over});

test('STORE-01 the core async store satisfies the one store contract (no multi-step transactions yet)', async () => {
  await runStorePortContract(assert, createFirestoreStoreAsync({gateway: memoryFirestore().async}), {transactions: false});
});

test('STORE-02 both engines write identical documents and read each other\'s rows', async () => {
  const fs = memoryFirestore(), legacy = createFirestoreStore({firestore: fs.sync}), core = createFirestoreStoreAsync({gateway: fs.async});
  legacy.insert('vc_users', user('a'));
  await core.insert('vc_users', user('b'));
  const docA = fs.raw.get('vc_users').get('a'), docB = fs.raw.get('vc_users').get('b');
  assert.deepEqual(Object.keys(docA).sort(), Object.keys(docB).sort(), 'same stored fields incl. _seq');
  // _seq is time-ordered across processes (strict only within one process; two processes in the same ms may tie — as before)
  assert.ok(Number.isSafeInteger(docB._seq) && docB._seq >= docA._seq, '_seq: integer, time-ordered across engines');
  assert.deepEqual(await core.one('vc_users', {user_id: 'a'}), legacy.one('vc_users', {user_id: 'a'}), 'core reads the legacy row');
  assert.deepEqual(legacy.one('vc_users', {user_id: 'b'}), await core.one('vc_users', {user_id: 'b'}), 'legacy reads the core row');
  assert.deepEqual((await core.list('vc_users')).map(u => u.user_id), legacy.list('vc_users').map(u => u.user_id), 'same order');
  // TTL rule (vc_sessions: expires_at + 1 day) and the log-policy expire_at: same Date on both engines, never returned
  const s = id => ({session_id: id, user_id: 'a', token_digest: 'd' + id, status: 'ACTIVE', issued_at: '2026-11-27T00:00:00.000Z',
    expires_at: '2026-11-27T08:00:00.000Z', last_seen_at: '2026-11-27T00:00:00.000Z', idle_timeout_minutes: 30, revoked_at: '', access_json: ''});
  legacy.insert('vc_sessions', s('s1')); await core.insert('vc_sessions', s('s2'));
  const t1 = fs.raw.get('vc_sessions').get('s1').expire_at, t2 = fs.raw.get('vc_sessions').get('s2').expire_at;
  assert.ok(t1 instanceof Date && t2 instanceof Date && t1.getTime() === t2.getTime(), 'expire_at identical');
  assert.equal('expire_at' in (await core.one('vc_sessions', {session_id: 's1'})), false, 'internal TTL field never leaks');
  // readMany + inserts + patch (what the officer path uses)
  const [found, n] = await core.readMany([{kind: 'one', name: 'vc_users', filter: {user_id: 'a'}}, {kind: 'count', name: 'vc_users', filter: {}}],
    {inserts: [['vc_users', user('c')]]});
  assert.equal(found.user_id, 'a'); assert.ok(n >= 2);
  await core.patch('vc_sessions', {session_id: 's1'}, {last_seen_at: '2026-11-27T00:05:00.000Z'});
  assert.equal(legacy.one('vc_sessions', {session_id: 's1'}).last_seen_at, '2026-11-27T00:05:00.000Z', 'legacy sees the core patch');
  await assert.rejects(core.patch('vc_sessions', {token_digest: 'ds1'}, {last_seen_at: 'x'}), /PATCH_REQUIRES_PRIMARY_KEY/);
  await assert.rejects(core.insert('vc_users', user('a')), /DUPLICATE_KEY/);
  await assert.rejects(core.sequence(() => 1), /SEQUENCE_NOT_SUPPORTED/, 'a gateway without runTransaction offers no transactions');
});

test('STORE-03 SDK value rules match the REST gateway: undefined→null, Date⇄Timestamp, nested values', () => {
  const d = new Date('2026-11-27T01:02:03.456Z');
  const out = toFirestore({a: undefined, b: d, c: [1, {x: d}], n: 5, f: 1.5, s: 'x', t: true, z: null});
  assert.equal(out.a, null);
  assert.ok(out.b instanceof Timestamp && out.c[1].x instanceof Timestamp);
  assert.deepEqual([out.n, out.f, out.s, out.t, out.z], [5, 1.5, 'x', true, null]);
  const back = fromFirestore(out);
  assert.ok(back.b instanceof Date && back.b.getTime() === d.getTime() && back.c[1].x.getTime() === d.getTime());
});
