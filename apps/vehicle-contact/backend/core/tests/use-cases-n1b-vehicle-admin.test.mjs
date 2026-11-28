// N1b PR 4: vehicle administration + owner change requests on the core. The legacy acceptance tests (generated copies:
// actor-usecase-acceptance, owner-worker-scoped-reads, print-filters, pagination-contract, acceptance-failures) prove the
// behaviour; these prove what the core does differently: the engine, one commit per write path, bounded list reads.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAcceptanceHarness} from './support/core-harness.mjs';
import {vehiclesCancel, contactsUpdate, changesListPending, changesListMine, vehiclesUpdate}
  from '../src/use-cases/vehicle-admin.mjs';

const OPS = ['vehicles.update', 'vehicles.cancel', 'contacts.update', 'changes.submit', 'changes.listPending', 'changes.review', 'changes.listMine'];
const AT = '2026-11-28T00:00:00.000Z';
const ids = () => { let n = 0; return () => String(++n).padStart(64, '0'); };

test('N1B-10 the seven vehicle-admin / change-request operations are answered by the core', () => {
  const h = createAcceptanceHarness();
  for (const op of OPS) assert.equal(h.engineFor(op), 'core', op);
});

test('N1B-11 vehicles.cancel = one commit: vehicle INACTIVE (version-guarded) + every ACTIVE QR revoked + retention job + audit', async () => {
  const commits = [];
  const store = {
    readMany: async () => [{row: {vehicle_id: 'v1', status: 'ACTIVE', version: 3}, version: 'ver-3'}, {key: 'retention_days', value: '30'},
      [{qr_id: 'q1', status: 'ACTIVE'}, {qr_id: 'q0', status: 'REVOKED'}]],
    writeMany: async ops => { commits.push(ops); return true; }
  };
  const r = await vehiclesCancel({vehicleId: 'v1'}, {userId: 'u-reg'}, {store, now: () => AT, id: ids()});
  assert.deepEqual(r, {vehicleId: 'v1', status: 'INACTIVE'});
  assert.equal(commits.length, 1);
  const [vehicle, qr, job, audit] = commits[0];
  assert.equal(commits[0].length, 4);
  assert.deepEqual([vehicle.table, vehicle.fields.status, vehicle.fields.version, vehicle.ifVersion], ['vc_vehicles', 'INACTIVE', 4, 'ver-3']);
  assert.deepEqual([qr.table, qr.key.qr_id, qr.fields.status, qr.fields.revoke_reason], ['vc_qr_tokens', 'q1', 'REVOKED', 'VEHICLE_CANCELLED']);
  assert.deepEqual([job.table, job.data.due_at, job.data.status], ['vc_retention_jobs', '2026-12-28T00:00:00.000Z', 'WAITING_RETENTION']);
  assert.deepEqual([audit.table, audit.data.action], ['vc_change_audit', 'VEHICLE_CANCELLED']);
});

test('N1B-12 vehicles.cancel without a retention setting refuses before any write', async () => {
  let writes = 0;
  const store = {readMany: async () => [{row: {vehicle_id: 'v1', status: 'ACTIVE', version: 1}, version: null}, null, []],
    writeMany: async () => { writes++; }};
  await assert.rejects(vehiclesCancel({vehicleId: 'v1'}, {userId: 'u'}, {store, now: () => AT, id: ids()}), /RETENTION_POLICY_NOT_CONFIGURED/);
  assert.equal(writes, 0);
});

test('N1B-13 contacts.update = contact + audit in one commit; two primary contacts refuse', async () => {
  const commits = [];
  const contact = {contact_id: 'c1', status: 'ACTIVE', is_primary: true};
  const store = rows => ({readMany: async () => [{vehicle_id: 'v1', status: 'ACTIVE'}, rows], writeMany: async ops => { commits.push(ops); }});
  await contactsUpdate({vehicleId: 'v1', contactPhone: '+66810000002'}, {userId: 'u'}, {store: store([contact]), now: () => AT, id: ids()});
  assert.deepEqual(commits[0].map(o => o.table), ['vc_vehicle_contacts', 'vc_change_audit']);
  await assert.rejects(contactsUpdate({vehicleId: 'v1', contactPhone: '+66810000002'}, {userId: 'u'},
    {store: store([contact, {...contact, contact_id: 'c2'}]), now: () => AT, id: ids()}), /PRIMARY_CONTACT_INVARIANT/);
  assert.equal(commits.length, 1);
});

test('N1B-14 the change lists read one window + COUNT in one round (pending by status, mine by the session user)', async () => {
  const rounds = [];
  const store = {readMany: async reqs => { rounds.push(reqs);
    return [[{change_id: 'c1', vehicle_id: 'v1', submitted_at: 't', status: 'PENDING', reviewed_at: '', proposed_delta: '{"color":"Red"}'}], 3]; }};
  const pending = await changesListPending({page: 1, pageSize: 10}, null, {store});
  const mine = await changesListMine({limit: 5, submittedBy: 'spoofed'}, {userId: 'u-owner'}, {store});
  assert.deepEqual(rounds.map(r => r.map(x => [x.kind, JSON.stringify(x.filter), x.limit])), [
    [['list', '{"status":"PENDING"}', 10], ['count', '{"status":"PENDING"}', undefined]],
    [['list', '{"submitted_by":"u-owner"}', 5], ['count', '{"submitted_by":"u-owner"}', undefined]]]);
  assert.equal(pending.total, 3);
  assert.deepEqual(pending.items[0].proposedDelta, {color: 'Red'});
  assert.equal(mine[0].requestId, 'c1');
});

test('N1B-15 vehicles.update: a concurrent write (version moved) surfaces as VERSION_CONFLICT', async () => {
  const store = {readMany: async () => [{row: {vehicle_id: 'v1', status: 'ACTIVE', version: 1}, version: 'ver-1'}],
    writeMany: async () => { throw new Error('WRITE_CONFLICT'); }};
  await assert.rejects(vehiclesUpdate({vehicleId: 'v1', expectedVersion: 1, color: 'Green'}, {userId: 'u'}, {store, now: () => AT, id: ids()}),
    /VERSION_CONFLICT/);
});
