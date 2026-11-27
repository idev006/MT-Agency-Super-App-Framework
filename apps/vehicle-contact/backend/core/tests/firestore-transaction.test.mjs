// VC-ADR-046 phase 3 wave 0: the core store's sequence() = one read-write Firestore transaction with the legacy semantics
// (buffered writes, read-your-writes, one commit with preconditions, rollback on error, safe retry on contention).
// A fake of the Firestore Node SDK enforces the SDK's own rules: every transaction read before any write, create = must not
// exist, update / delete = must exist, and runTransaction re-runs the callback after a contention abort.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runStorePortContract} from '../../gas/tests/support/store-port-contract.mjs';
import {createSdkGateway} from '../src/adapters/firestore/sdk-gateway.mjs';
import {createFirestoreStoreAsync} from '../src/adapters/firestore/store.mjs';

function fakeSdk({contendOnce = false} = {}) {
  const data = new Map();
  const coll = n => (data.has(n) || data.set(n, new Map()), data.get(n));
  const stats = {attempts: 0, commits: 0};
  const snap = (id, f) => ({id, exists: !!f, data: () => structuredClone(f)});
  const query = (name, q = {where: [], order: null, lim: undefined}) => ({
    _q: true, name,
    where: (f, _op, v) => query(name, {...q, where: [...q.where, [f, v]]}),
    orderBy: (f, dir) => query(name, {...q, order: [f, dir]}),
    limit: n => query(name, {...q, lim: n}),
    doc: id => ({_ref: true, name, id}),
    run() {
      let docs = [...coll(name)].map(([id, f]) => ({id, f}));
      for (const [f, v] of q.where) docs = docs.filter(d => d.f[f] === v);
      if (q.order) docs.sort((a, b) => (a.f[q.order[0]] - b.f[q.order[0]]) * (q.order[1] === 'desc' ? -1 : 1));
      if (q.lim !== undefined) docs = docs.slice(0, q.lim);
      return docs;
    },
    get: async function () { return {docs: this.run().map(d => ({...snap(d.id, d.f), updateTime: null}))}; },
    count: function () { return {get: async () => ({data: () => ({count: this.run().length})})}; }
  });
  const fail = code => { throw Object.assign(new Error('sdk'), {code}); }; // gRPC numeric codes like the real SDK
  const apply = writes => {
    for (const w of writes) { const m = coll(w.ref.name), has = m.has(w.ref.id);
      if (w.op === 'create' && has) fail(6); if (w.op !== 'create' && !has) fail(5); }
    for (const w of writes) { const m = coll(w.ref.name);
      if (w.op === 'delete') m.delete(w.ref.id); else m.set(w.ref.id, w.op === 'update' ? {...m.get(w.ref.id), ...structuredClone(w.fields)} : structuredClone(w.fields)); }
    stats.commits++;
  };
  const db = {
    collection: query,
    batch() { const ws = []; return {create: (ref, f) => ws.push({op: 'create', ref, fields: f}), update: (ref, f) => ws.push({op: 'update', ref, fields: f}),
      delete: ref => ws.push({op: 'delete', ref}), commit: async () => apply(ws)}; },
    async runTransaction(fn) {
      for (let attempt = 0; ; attempt++) {
        stats.attempts++;
        const writes = [];
        const t = {
          get: async target => {
            if (writes.length) throw new Error('Firestore transactions require all reads to be executed before all writes.');
            if (target._ref) return snap(target.id, coll(target.name).get(target.id));
            return {docs: target.run().map(d => snap(d.id, d.f))};
          },
          create: (ref, f) => writes.push({op: 'create', ref, fields: f}),
          update: (ref, f) => writes.push({op: 'update', ref, fields: f}),
          delete: ref => writes.push({op: 'delete', ref})
        };
        const result = await fn(t);
        if (contendOnce && attempt === 0) continue; // ABORTED by a concurrent writer: the SDK runs the callback again
        apply(writes);
        return result;
      }
    }
  };
  return {db, data, stats};
}
const user = (id, over = {}) => ({user_id: id, username_normalized: 'user-' + id, display_name: 'User ' + id, status: 'ACTIVE',
  password_hash: '', password_salt: '', password_change_required: false, created_at: '2026-11-27T00:00:00.000Z', updated_at: '2026-11-27T00:00:00.000Z', ...over});
const storeOf = sdk => createFirestoreStoreAsync({gateway: createSdkGateway({db: sdk.db})});

test('TX-01 the core store now satisfies the store contract WITH transactions', async () => {
  await runStorePortContract(assert, storeOf(fakeSdk()), {transactions: true});
});

test('TX-02 read-your-writes inside the transaction; nothing visible outside until the one commit', async () => {
  const sdk = fakeSdk(), store = storeOf(sdk);
  await store.insert('vc_users', user('u1'));
  const result = await store.sequence(async s => {
    await s.insert('vc_users', user('u2'));
    await s.update('vc_users', {user_id: 'u1'}, {display_name: 'Renamed'});
    assert.equal((await s.one('vc_users', {user_id: 'u2'})).display_name, 'User u2', 'own insert is visible');
    assert.equal((await s.list('vc_users')).length, 2, 'query overlays pending writes');
    assert.equal((await s.one('vc_users', {user_id: 'u1'})).display_name, 'Renamed', 'own update is visible');
    assert.equal(sdk.data.get('vc_users').size, 1, 'not written yet');
    return 'done';
  });
  assert.equal(result, 'done');
  assert.equal(sdk.data.get('vc_users').size, 2); assert.equal(sdk.data.get('vc_users').get('u1').display_name, 'Renamed');
  assert.ok(!('_seq' in (await store.one('vc_users', {user_id: 'u2'}))), 'stored rows read back through the same rules');
});

test('TX-03 an error inside rolls everything back and reaches the caller unchanged', async () => {
  const sdk = fakeSdk(), store = storeOf(sdk);
  await assert.rejects(store.sequence(async s => { await s.insert('vc_users', user('u9')); throw new Error('RULE_SAYS_NO'); }), /RULE_SAYS_NO/);
  assert.equal(await store.one('vc_users', {user_id: 'u9'}), null);
});

test('TX-04 a contended transaction is re-run with a fresh buffer: written once', async () => {
  const sdk = fakeSdk({contendOnce: true}), store = storeOf(sdk);
  let runs = 0;
  await store.sequence(async s => { runs++; if (!(await s.one('vc_users', {user_id: 'u5'}))) await s.insert('vc_users', user('u5')); });
  assert.equal(runs, 2); assert.equal(sdk.stats.commits, 1); assert.equal(sdk.data.get('vc_users').size, 1);
});

test('TX-05 preconditions keep the legacy error codes: duplicate insert, update / remove of a missing row', async () => {
  const store = storeOf(fakeSdk());
  await store.insert('vc_users', user('u1'));
  await assert.rejects(store.sequence(s => s.insert('vc_users', user('u1'))), /DUPLICATE_KEY/);
  await assert.rejects(store.sequence(s => s.update('vc_users', {user_id: 'nope'}, {display_name: 'x'})), /NOT_FOUND/);
  await assert.rejects(store.sequence(s => s.remove('vc_users', {user_id: 'nope'})), /NOT_FOUND/);
  // created and removed in the same transaction = no write at all
  await store.sequence(async s => { await s.insert('vc_users', user('tmp')); await s.remove('vc_users', {user_id: 'tmp'}); });
  assert.equal(await store.one('vc_users', {user_id: 'tmp'}), null);
});

test('TX-06 writeMany and readMany inside a transaction; a nested sequence joins the same transaction', async () => {
  const sdk = fakeSdk(), store = storeOf(sdk);
  await store.sequence(async s => {
    await s.writeMany([{op: 'insert', table: 'vc_users', data: user('a')}, {op: 'insert', table: 'vc_users', data: user('b')}]);
    const [a, n] = await s.readMany([{kind: 'one', name: 'vc_users', filter: {user_id: 'a'}}, {kind: 'count', name: 'vc_users', filter: {}}]);
    assert.equal(a.user_id, 'a'); assert.equal(n, 2);
    await s.sequence(inner => inner.patch('vc_users', {user_id: 'b'}, {display_name: 'B'}));
  });
  assert.equal(sdk.stats.commits, 1, 'one commit for everything');
  assert.equal((await store.one('vc_users', {user_id: 'b'})).display_name, 'B');
});

test('TX-07 flows: {transaction} runs a sub-flow on ONE transaction on both runners; a retry gets a fresh sub-flow; errors reach the flow', async () => {
  const {runFlowSync, runFlowAsync} = await import('../../gas/src/application/flows/FlowRunner.js');
  const {createFirestoreStore} = await import('../../gas/src/infrastructure/persistence/firestore/FirestoreStore.js');
  function* claim(id) { // read-check-write: must be one transaction
    const [row] = yield {reads: [{kind: 'one', name: 'vc_users', filter: {user_id: id}}]};
    if (row) throw new Error('ALREADY_CLAIMED');
    yield {insert: {table: 'vc_users', row: user(id)}};
    yield {patch: {table: 'vc_users', filter: {user_id: id}, fields: {display_name: 'Claimed ' + id}}};
    return id;
  }
  function* flow(id) {
    let made = 0;
    const got = yield {transaction: () => { made++; return claim(id); }};
    let again;
    try { yield {transaction: () => claim(id)}; } catch (e) { again = e.message; }
    return {got, again, made};
  }
  // async: the core store over the SDK, first transaction contended once
  const sdk = fakeSdk({contendOnce: true});
  const a = await runFlowAsync(flow('c1'), {store: storeOf(sdk)});
  assert.deepEqual(a, {got: 'c1', again: 'ALREADY_CLAIMED', made: 2}, 'retried with a fresh sub-flow; the second claim sees the row');
  assert.equal(sdk.data.get('vc_users').get('c1').display_name, 'Claimed c1');
  // sync: the legacy store, whose sequence runs the callback on its transaction store
  const rows = new Map();
  const gw = {query: (n, {where = []} = {}) => [...rows.values()].filter(r => r.coll === n && where.every(w => r.fields[w.field] === w.value)).map(r => ({id: r.id, fields: {...r.fields}})),
    get: (n, id) => rows.get(n + '/' + id)?.fields || null,
    create: (n, id, fields) => { if (rows.has(n + '/' + id)) throw Object.assign(new Error('x'), {code: 'ALREADY_EXISTS'}); rows.set(n + '/' + id, {coll: n, id, fields: {...fields}}); },
    update: (n, id, fields) => { const r = rows.get(n + '/' + id); if (!r) throw Object.assign(new Error('x'), {code: 'NOT_FOUND'}); Object.assign(r.fields, fields); },
    delete: (n, id) => rows.delete(n + '/' + id)};
  gw.runTransaction = fn => fn(gw);
  const s = runFlowSync(flow('c1'), {store: createFirestoreStore({firestore: gw})});
  assert.deepEqual(s, {got: 'c1', again: 'ALREADY_CLAIMED', made: 1});
  assert.equal(rows.get('vc_users/c1').fields.display_name, 'Claimed c1');
});
