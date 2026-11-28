import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runReferenceSeedJob} from '../src/facade/reference-seed.mjs';
import {JOBS} from '../src/facade/jobs.mjs';

function fakeStore() {
  const tables = new Map([['vc_reference_values', new Map()], ['vc_settings', new Map()]]);
  const keyOf = (table, row) => String(row[table === 'vc_settings' ? 'key' : 'reference_id']);
  const rows = table => tables.get(table);
  let writes = 0;
  const store = {
    get writes() { return writes; },
    async count(table) { return rows(table).size; },
    async list(table) { return [...rows(table).values()].map(row => ({...row})); },
    async one(table, filter) {
      const row = rows(table).get(keyOf(table, filter));
      return row ? {...row} : null;
    },
    async insert(table, row) {
      const key = keyOf(table, row);
      if (rows(table).has(key)) throw new Error('DUPLICATE_KEY');
      rows(table).set(key, {...row}); writes++;
    },
    async update(table, filter, patch) {
      const key = keyOf(table, filter), row = rows(table).get(key);
      if (!row) throw new Error('NOT_FOUND');
      rows(table).set(key, {...row, ...patch}); writes++;
    },
    async writeMany(ops) {
      for (const op of ops) {
        if (op.op === 'insert') await store.insert(op.table, op.data);
        else { rows(op.table).delete(keyOf(op.table, op.key)); writes++; }
      }
    },
    async sequence(fn) { return fn(store); },
    rows: table => [...rows(table).values()]
  };
  return store;
}

const NOW = () => '2026-11-28T00:00:00.000Z';

test('R10-01 preview is read-only; exact manifest checksum and a fresh table gate apply', async () => {
  const store = fakeStore();
  const jobReport = await JOBS['reference-seed']({store});
  assert.equal(jobReport.status, 'PASS');
  assert.equal(jobReport.seedStatus, 'READY');
  const preview = await runReferenceSeedJob({store, now: NOW});
  assert.equal(preview.status, 'READY');
  assert.equal(preview.rowCount, 645);
  assert.match(preview.checksum, /^[a-f0-9]{64}$/);
  assert.equal(store.writes, 0);
  await assert.rejects(runReferenceSeedJob({store, mode: 'APPLY', approval: 'wrong', now: NOW}),
    /REFERENCE_SEED_EXPLICIT_APPROVAL_REQUIRED/);
  assert.equal(store.writes, 0);
  const result = await runReferenceSeedJob({store, mode: 'APPLY', approval: preview.checksum, now: NOW});
  assert.equal(result.status, 'APPLIED');
  assert.equal(store.rows('vc_reference_values').length, 645);
  assert.equal(JSON.parse(store.rows('vc_settings')[0].value).status, 'APPLIED');
  const before = store.writes;
  assert.equal((await runReferenceSeedJob({store, mode: 'APPLY', approval: preview.checksum, now: NOW})).status,
    'ALREADY_APPLIED');
  assert.equal(store.writes, before);
});

test('R10-02 foreign catalog data blocks apply without overwriting it', async () => {
  const store = fakeStore();
  await store.insert('vc_reference_values', {reference_id: 'CUSTOM-1', updated_by: 'local'});
  const preview = await runReferenceSeedJob({store, now: NOW});
  assert.equal(preview.status, 'BLOCKED');
  await assert.rejects(runReferenceSeedJob({store, mode: 'APPLY', approval: preview.checksum, now: NOW}),
    /REFERENCE_SEED_CONFLICT/);
  assert.equal(store.rows('vc_reference_values').length, 1);
});

test('R10-03 interrupted apply needs separate recovery approval and refuses foreign rows', async () => {
  const store = fakeStore();
  const preview = await runReferenceSeedJob({store, now: NOW});
  const originalWriteMany = store.writeMany;
  let batches = 0;
  store.writeMany = async ops => { if (++batches === 2) throw new Error('INJECTED_FAILURE'); return originalWriteMany(ops); };
  await assert.rejects(runReferenceSeedJob({store, mode: 'APPLY', approval: preview.checksum, now: NOW}),
    /INJECTED_FAILURE/);
  assert.equal(store.rows('vc_reference_values').length, 400);
  assert.equal(JSON.parse(store.rows('vc_settings')[0].value).status, 'RECOVERY_REQUIRED');
  await assert.rejects(runReferenceSeedJob({store, mode: 'APPLY', approval: preview.checksum, now: NOW}),
    /REFERENCE_SEED_CONFLICT/);
  await assert.rejects(runReferenceSeedJob({store, mode: 'RECOVER', now: NOW}),
    /REFERENCE_SEED_RECOVERY_APPROVAL_REQUIRED/);
  const approval = `RECOVER_REFERENCE_SEED:${preview.checksum}`;
  await store.insert('vc_reference_values', {reference_id: 'CUSTOM-1', updated_by: 'local'});
  await assert.rejects(runReferenceSeedJob({store, mode: 'RECOVER', approval, now: NOW}),
    /REFERENCE_SEED_RECOVERY_CONFLICT/);
  const foreign = store.rows('vc_reference_values').find(row => row.reference_id === 'CUSTOM-1');
  assert.equal(foreign.updated_by, 'local');
  // The fake removes this test-only row; no live recovery is run.
  store.writeMany = originalWriteMany;
  await store.writeMany([{op: 'remove', table: 'vc_reference_values', key: {reference_id: 'CUSTOM-1'}}]);
  const result = await runReferenceSeedJob({store, mode: 'RECOVER', approval, now: NOW});
  assert.equal(result.status, 'RECOVERED');
  assert.equal(result.clearedCount, 400);
  assert.equal(store.rows('vc_reference_values').length, 0);
});
