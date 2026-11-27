// VC-ADR-051 N1a: the core's native async use cases (vehicles.list, qr.markPrinted), the async QR print-state rule, and
// the generated acceptance copies being current. The behaviour itself is held by the generated legacy tests
// (tests/generated/*.test.mjs, through support/core-harness.mjs).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {withPrintState} from '../src/use-cases/print-state.mjs';
import {FLOWS, USE_CASES, createCoreFacade} from '../src/facade/operations.mjs';
import {createAcceptanceHarness, assertOk} from './support/core-harness.mjs';
import {transform} from '../scripts/gen-core-acceptance.mjs';

const recorder = () => {
  const log = [];
  const s = {insert: async (t, d) => (log.push(['insert', t, d]), d), update: async (t, k, f) => (log.push(['update', t, k, f]), 1),
    writeMany: async ops => (log.push(['writeMany', ops]), ops.length), readMany: async (reqs, o = {}) => (log.push(['readMany', o.inserts || []]), reqs.map(() => null))};
  s.sequence = async fn => fn(s);
  return {s, log};
};

test('N1A-01 vehicles.list and qr.markPrinted are answered by the core; no operation is in both tables', () => {
  const h = createAcceptanceHarness();
  assert.equal(h.engineFor('vehicles.list'), 'core');
  assert.equal(h.engineFor('qr.markPrinted'), 'core');
  assert.equal(h.engineFor('users.list'), 'legacy');
  assert.deepEqual(Object.keys(USE_CASES).filter(op => op in FLOWS), []);
  assert.throws(() => createCoreFacade({store: {}, flows: {x: () => null}, useCases: {x: async () => null}}), /OPERATION_IN_FLOWS_AND_USE_CASES:x/);
});

test('N1A-02 print state on the async store: a new ACTIVE QR resets its vehicle on insert, writeMany and inside a sequence', async () => {
  const {s, log} = recorder();
  const st = withPrintState(s);
  await st.insert('vc_qr_tokens', {status: 'ACTIVE', vehicle_id: 'v1'});
  assert.deepEqual(log.at(-1), ['update', 'vc_vehicles', {vehicle_id: 'v1'}, {qr_print_state: 'NOT_PRINTED', qr_printed_at: ''}], 'awaited reset');
  await st.insert('vc_vehicles', {vehicle_id: 'v2'});
  assert.equal(log.at(-1)[2].qr_print_state, 'NOT_PRINTED', 'a new vehicle starts NOT_PRINTED');
  await st.writeMany([{op: 'insert', table: 'vc_vehicles', data: {vehicle_id: 'v3'}}, {op: 'insert', table: 'vc_qr_tokens', data: {status: 'ACTIVE', vehicle_id: 'v3'}},
    {op: 'insert', table: 'vc_qr_tokens', data: {status: 'ACTIVE', vehicle_id: 'v4'}}]);
  const ops = log.at(-1)[1];
  assert.deepEqual(ops.filter(o => o.op === 'update').map(o => o.key.vehicle_id), ['v4'], 'a vehicle created in the same batch needs no reset');
  await st.sequence(async tx => { await tx.insert('vc_qr_tokens', {status: 'ACTIVE', vehicle_id: 'v5'}); });
  assert.deepEqual(log.at(-1).slice(0, 3), ['update', 'vc_vehicles', {vehicle_id: 'v5'}]);
  await assert.rejects(async () => st.readMany([], {inserts: [['vc_qr_tokens', {status: 'ACTIVE', vehicle_id: 'v6'}]]}), /PRINT_STATE_UNSUPPORTED_WRITE/);
});

test('N1A-03 vehicles.list reads in two parallel rounds (page + count + stickers, then the labels)', async () => {
  const {vehiclesList} = await import('../src/use-cases/vehicle-list.mjs');
  let rounds = 0;
  const rows = [{vehicle_id: 'v1', status: 'ACTIVE', color: 'RED', vehicle_type: 'SEDAN', organization_id: 'o1'}];
  const fake = {readMany: async reqs => { rounds++; return reqs.map(r => (r.kind === 'count' ? 1 : r.kind === 'list' && r.name === 'vc_vehicles' ? rows : r.kind === 'list' ? [] : null)); }};
  const page = await vehiclesList({page: 1, pageSize: 10, withFilterOptions: true}, {userId: 'u'}, {store: fake});
  assert.equal(rounds, 2);
  assert.equal(page.total, 1); assert.equal(page.items[0].vehicleId, 'v1'); assert.ok('sticker' in page.items[0]); assert.ok(page.filterOptions);
});

test('N1A-04 qr.markPrinted through the core writes PRINTED + one audit row per vehicle in one batch', async () => {
  const h = createAcceptanceHarness();
  const org = await h.createOrganization(), camp = await h.createCampaign();
  const sub = assertOk(assert, await h.call('registrations.submit', h.registrationPayload(camp.campaignToken, org, await h.stagePhotos(camp.campaignToken))), 'submit');
  const v = assertOk(assert, await h.as('reg', 'registrations.review', {requestId: sub.requestId, decision: 'APPROVE', stickerCategory: 'NCO', platePhotoVerified: true}), 'approve');
  const m = assertOk(assert, await h.as('reg', 'qr.markPrinted', {vehicleIds: [v.vehicleId]}), 'mark');
  assert.equal(m.marked, 1);
  assert.equal(h.read('vc_vehicles').find(x => x.vehicle_id === v.vehicleId).qr_print_state, 'PRINTED');
  const audit = h.read('vc_change_audit').filter(x => x.action === 'QR_PRINTED');
  assert.equal(audit.length, 1); assert.match(audit[0].audit_id, /^[0-9a-f]{64}$/, 'a core id');
});

test('N1A-05 the generator: harness calls awaited, helpers made async, a harness call in a non-test callback refused', () => {
  const out = transform(`import {createAcceptanceHarness} from './acceptance-fixture.mjs';
const one = h => h.as('sys', 'x.y', {});
test('t', () => { const h = createAcceptanceHarness(); const r = one(h); });`);
  assert.match(out, /from '\.\.\/support\/core-harness\.mjs'/);
  assert.match(out, /const one = async h => \(await h\.as\('sys', 'x\.y', \{\}\)\)/);
  assert.match(out, /test\('t', async \(\) => \{ const h = createAcceptanceHarness\(\); const r = \(await one\(h\)\); \}\)/);
  assert.throws(() => transform(`const h = createAcceptanceHarness(); [1].map(x => h.call('a.b'));`), /not a test body/);
});

test('N1A-06 the generated acceptance copies are current (node scripts/gen-core-acceptance.mjs --check)', () => {
  const script = path.resolve(import.meta.dirname, '../scripts/gen-core-acceptance.mjs');
  assert.doesNotThrow(() => execFileSync(process.execPath, [script, '--check'], {stdio: 'pipe'}));
});

test('N1A-07 system.config.* on the core: one read round, one batch write, all or nothing, memo refreshed after the commit', async () => {
  const {configGet, configUpdate} = await import('../src/use-cases/settings.mjs');
  const {createLogManager} = await import('../../gas/src/application/logging/LogManager.js');
  const {defaultLogPolicy} = await import('../../gas/src/domain/policies/LogPolicy.js');
  const logs = createLogManager({policy: () => defaultLogPolicy(), now: () => '2026-11-27T00:00:00.000Z'});
  const rows = [{key: 'idle_timeout_minutes', value: '30'}];
  const log = [];
  const store = {readMany: async reqs => (log.push(['readMany', reqs.length]), reqs.map(r => (r.kind === 'count' ? 3 : rows.map(x => ({...x}))))),
    writeMany: async ops => (log.push(['writeMany', ops]), true)};
  let refreshed = 0;
  const ctx = {store, logs, now: () => '2026-11-27T00:00:00.000Z', id: () => 'f'.repeat(64), refreshLogPolicy: () => { refreshed++; }};
  const got = await configGet({}, null, ctx);
  assert.equal(got.idle_timeout_minutes, '30'); assert.ok(got.log_counts && typeof got.log_counts === 'object');
  assert.deepEqual(log.map(x => x[0]), ['readMany'], 'get = one round');
  log.length = 0;
  await assert.rejects(configUpdate({values: {idle_timeout_minutes: 40, retention_days: 0}}, {userId: 'u'}, ctx), /INVALID_SETTING_VALUE/);
  assert.equal(log.filter(x => x[0] === 'writeMany').length, 0, 'a bad key → nothing written'); assert.equal(refreshed, 0);
  log.length = 0;
  await configUpdate({values: {idle_timeout_minutes: 40, retention_days: 90}}, {userId: 'u'}, ctx);
  const writes = log.filter(x => x[0] === 'writeMany');
  assert.equal(writes.length, 1, 'one batch');
  assert.deepEqual(writes[0][1].map(o => [o.op, o.table, o.key?.key || o.data?.key || o.data?.action]),
    [['update', 'vc_settings', 'idle_timeout_minutes'], ['insert', 'vc_settings', 'retention_days'], ['insert', 'vc_change_audit', 'SETTINGS_UPDATED']]);
  assert.equal(refreshed, 1, 'log-policy memo refreshed after the commit');
  assert.deepEqual(log.map(x => x[0]), ['readMany', 'writeMany', 'readMany']);
});

test('N1A-08 system.config.* are answered by the core; a COUNT the store cannot answer → log_counts null, settings still shown', async () => {
  const h = createAcceptanceHarness();
  assert.equal(h.engineFor('system.config.get'), 'core'); assert.equal(h.engineFor('system.config.update'), 'core');
  const {configGet} = await import('../src/use-cases/settings.mjs');
  const {createLogManager} = await import('../../gas/src/application/logging/LogManager.js');
  const {defaultLogPolicy} = await import('../../gas/src/domain/policies/LogPolicy.js');
  const store = {readMany: async () => { throw new Error('COUNT_UNSUPPORTED'); }, list: async () => [{key: 'retention_days', value: '90'}]};
  const got = await configGet({}, null, {store, logs: createLogManager({policy: () => defaultLogPolicy(), now: () => ''}), now: () => '', id: () => 'x'});
  assert.equal(got.retention_days, '90'); assert.equal(got.log_counts, null);
});
