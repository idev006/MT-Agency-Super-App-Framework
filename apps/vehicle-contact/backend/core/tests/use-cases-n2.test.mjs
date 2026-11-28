// N2: photos, retention and audit on the core. Behaviour: the generated legacy acceptance copies (actor-usecase-acceptance,
// owner-worker-scoped-reads, journal-recovery DSEQ09-03, acceptance-failures, pagination-contract). These prove the engine,
// that the permanent delete stays OFF by default, and the read / write shapes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAcceptanceHarness, asyncStoreOver} from './support/core-harness.mjs';
import {createCoreFacade} from '../src/facade/operations.mjs';
import {auditQuery, photosList, retentionApprove, retentionExecute} from '../src/use-cases/photos-retention-audit.mjs';

const OPS = ['photos.list', 'photos.replace', 'retention.listDue', 'retention.listExecutable', 'retention.approve', 'retention.jobStatus',
  'retention.execute', 'audit.query', 'audit.export'];
const AT = '2026-11-28T00:00:00.000Z';
const ids = () => { let n = 0; return () => String(++n).padStart(64, '0'); };

test('N2-01 the nine photo / retention / audit operations are answered by the core', () => {
  const h = createAcceptanceHarness();
  for (const op of OPS) assert.equal(h.engineFor(op), 'core', op);
});

test('N2-02 retention.execute is OFF unless the composition root enables it — refused before any read or write', async () => {
  const store = {one: async () => { throw new Error('must not read'); }, update: async () => { throw new Error('must not write'); }};
  await assert.rejects(retentionExecute({jobId: 'j1'}, {userId: 'w'}, {store, now: () => AT, id: ids()}), /RETENTION_EXECUTION_DISABLED/);
  // the facade default: a core built without the flag answers RETENTION_EXECUTION_DISABLED (public code) for the worker
  const h = createAcceptanceHarness();
  const core = createCoreFacade({store: asyncStoreOver(h.store), now: () => h.security.now(), sha256: x => h.security.sha256(x)});
  const r = await core.dispatch({apiVersion: 'v1', group: 'retention', action: 'execute', payload: {jobId: 'j1'},
    sessionToken: h.tokens.worker, requestId: 'n2'}, 'POST');
  assert.equal(r.ok, false);
  assert.notEqual(r.error.code, 'NOT_FOUND', 'answered by the core, not forwarded');
});

test('N2-03 audit.query: both trails (newest window) + both COUNTs in ONE round, merged newest first', async () => {
  const rounds = [];
  const store = {readMany: async reqs => { rounds.push(reqs); return [
    [{audit_id: 'l1', actor_id: 'a', vehicle_id: 'v1', lookup_source: 'QR', created_at: '2026-11-28T01:00:00Z'}],
    [{audit_id: 'c1', actor_id: 'a', entity_id: 'v1', action: 'VEHICLE_UPDATED', created_at: '2026-11-28T02:00:00Z'}], 4, 6]; }};
  const page = await auditQuery({vehicleId: 'v1', page: 1, pageSize: 10}, null, {store});
  assert.equal(rounds.length, 1);
  assert.deepEqual(rounds[0].map(r => [r.kind, r.name, JSON.stringify(r.filter)]), [
    ['newest', 'vc_lookup_audit', '{"vehicle_id":"v1"}'], ['newest', 'vc_change_audit', '{"entity_id":"v1"}'],
    ['count', 'vc_lookup_audit', '{"vehicle_id":"v1"}'], ['count', 'vc_change_audit', '{"entity_id":"v1"}']]);
  assert.deepEqual(page.items.map(x => x.eventId), ['c1', 'l1']);
  assert.equal(page.total, 10);
});

test('N2-04 photos.list = one round (vehicle + photo policy + photos); retention.approve = job + audit in one commit', async () => {
  const rounds = [];
  const store = {readMany: async reqs => { rounds.push(reqs);
    return [{vehicle_id: 'v1', status: 'ACTIVE'}, null, [{photo_id: 'p1', slot: 'FRONT', storage_ref: 'drive:AbCdEfGhIjKlMn', status: 'ACTIVE'},
      {photo_id: 'p0', slot: 'REAR', status: 'DELETED'}]]; }};
  const photos = await photosList({vehicleId: 'v1'}, null, {store});
  assert.equal(rounds.length, 1);
  assert.deepEqual(photos.map(x => x.photoId), ['p1']);
  const commits = [];
  const jobs = {one: async () => ({job_id: 'j1', status: 'WAITING_RETENTION', due_at: '2026-01-01T00:00:00Z', legal_hold: false}),
    writeMany: async ops => { commits.push(ops); }};
  assert.deepEqual(await retentionApprove({jobId: 'j1'}, {userId: 'u-sys'}, {store: jobs, now: () => AT, id: ids()}), {jobId: 'j1', approved: true});
  assert.deepEqual(commits[0].map(o => o.table), ['vc_retention_jobs', 'vc_change_audit']);
});
