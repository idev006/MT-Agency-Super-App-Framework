// Offline tests for the gated synthetic DEV clean-init reset. No network, no real data.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  runReset, exitCodeFor, isSyntheticVehicle, isSyntheticOrg, isSyntheticUser,
  RESET_GATE, WRITE_GATE,
} from '../scripts/reset-dev-data.mjs';

const ENV = {
  P6VC_GAS_EXEC_URL: 'https://script.google.com/macros/s/AKfycbtest/exec',
  P6VC_ADMIN_USER: 'admin', P6VC_ADMIN_PASS: 'secret',
  P6VC_ALLOW_DEV_RESET: RESET_GATE, P6VC_ALLOW_OWNER_DEV_WRITES: WRITE_GATE,
};
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'p6vc-reset-'));

// Minimal fake GAS backend routing by group.action; records call order and mutations.
function createFakeGas(state = {}) {
  const s = {
    health: state.health ?? 'ready',
    vehicles: state.vehicles ?? [{vehicleId: 'v1', plate: 'ฑฆ1', brand: 'SYNTHETIC', status: 'ACTIVE'}, {vehicleId: 'v2', plate: 'TST2', brand: 'SYNTHETIC', status: 'ACTIVE'}],
    campaigns: state.campaigns ?? [{campaignId: 'c1', status: 'ACTIVE'}],
    orgs: state.orgs ?? [{organizationId: 'o1', name: 'P6VC Automated x', type: 'EXTERNAL'}],
    users: state.users ?? [{userId: 'admin', username: 'admin', status: 'ACTIVE'}, {userId: 'u-reg', username: 'p6vc_reg_x', displayName: 'P6VC Automated reg', status: 'ACTIVE'}],
    logoutOk: state.logoutOk ?? true,
    calls: [], suspended: [], cancelled: [],
  };
  const reply = data => ({status: 200, json: async () => ({ok: true, data, error: null})});
  const fetchImpl = async (url, init) => {
    const req = JSON.parse(init.body);
    const op = req.group + '.' + req.action;
    s.calls.push(op);
    const p = req.payload || {};
    switch (op) {
      case 'system.health': return reply({status: s.health, apiVersion: 'v1'});
      case 'auth.login': return reply({sessionToken: 'tok'});
      case 'auth.session': return reply({roles: ['SYSTEM_ADMIN', 'REGISTRATION_ADMIN'], userId: 'admin', mustChangePassword: false});
      case 'vehicles.list': return reply(s.vehicles.filter(v => v.status === 'ACTIVE'));
      case 'campaigns.list': return reply(s.campaigns);
      case 'organizations.list': return reply(s.orgs);
      case 'users.list': return reply(s.users);
      case 'vehicles.cancel': s.cancelled.push(p.vehicleId); return reply({status: 'INACTIVE'});
      case 'campaigns.revoke': return reply({revoked: true});
      case 'organizations.disable': return reply({disabled: true});
      case 'users.suspend': s.suspended.push(p.userId); return reply({suspended: true});
      case 'organizations.create': return reply({organizationId: 'org-seed'});
      case 'campaigns.create': return reply({campaignId: 'camp-seed', campaignToken: 'ctok'});
      case 'photos.upload': return reply({photoId: 'p-' + p.slot});
      case 'registrations.submit': return reply({requestId: 'req-' + p.plate, status: 'PENDING_APPROVAL'});
      case 'registrations.review': return reply({vehicleId: 'v-' + p.requestId.slice(4), qrToken: 'q-' + p.requestId.slice(4), status: 'APPROVED'});
      case 'vehicles.lookup': return reply({vehicleId: 'v-' + p.plate});
      case 'photos.list': return reply([1, 2, 3, 4, 5].map(n => ({photoId: 'p' + n})));
      case 'qr.resolve': return reply({vehicleId: 'v-' + p.token.slice(2)});
      case 'auth.logout': return s.logoutOk ? reply({loggedOut: true}) : {status: 200, json: async () => ({ok: false, data: null, error: {code: 'OPERATION_FAILED'}})};
      default: return {status: 200, json: async () => ({ok: false, data: null, error: {code: 'UNKNOWN_OP_' + op}})};
    }
  };
  return {fetchImpl, state: s};
}

const run = (fake, over = {}) => runReset({
  fetchImpl: fake.fetchImpl, env: ENV, argv: ['--count=3'], reportDir: tempDir(),
  now: (() => { let t = 1000; return () => (t += 1); })(), tag: 'test', ...over,
});

test('gate: missing DEV reset gate blocks before any network call', async () => {
  const fake = createFakeGas();
  const report = await runReset({fetchImpl: fake.fetchImpl, env: {...ENV, P6VC_ALLOW_DEV_RESET: 'wrong'}, reportDir: tempDir(), tag: 't'});
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.blockedReason, 'MISSING_DEV_RESET_GATE');
  assert.equal(fake.state.calls.length, 0);
  assert.equal(exitCodeFor(report), 2);
});

test('gate: missing write confirmation, invalid url, missing creds all block', async () => {
  const fake = createFakeGas();
  assert.equal((await runReset({fetchImpl: fake.fetchImpl, env: {...ENV, P6VC_ALLOW_OWNER_DEV_WRITES: 'x'}, reportDir: tempDir()})).blockedReason, 'MISSING_WRITE_CONFIRMATION');
  assert.equal((await runReset({fetchImpl: fake.fetchImpl, env: {...ENV, P6VC_GAS_EXEC_URL: 'http://evil'}, reportDir: tempDir()})).blockedReason, 'INVALID_EXEC_URL');
  assert.equal((await runReset({fetchImpl: fake.fetchImpl, env: {...ENV, P6VC_ADMIN_PASS: ''}, reportDir: tempDir()})).blockedReason, 'MISSING_ADMIN_CREDENTIALS');
  assert.equal(fake.state.calls.length, 0);
});

test('mode: truncate is not bot-executable and fails closed', async () => {
  const fake = createFakeGas();
  const report = await runReset({fetchImpl: fake.fetchImpl, env: ENV, argv: ['--mode=truncate'], reportDir: tempDir()});
  assert.equal(report.blockedReason, 'TRUNCATE_REQUIRES_EDITOR_MAINTENANCE');
  assert.equal(fake.state.calls.length, 0);
});

test('fail-closed: non-synthetic ACTIVE vehicle aborts with zero cancellations', async () => {
  const fake = createFakeGas({vehicles: [{vehicleId: 'v1', plate: 'ฑฆ1', brand: 'SYNTHETIC', status: 'ACTIVE'}, {vehicleId: 'real', plate: 'ขข999', brand: 'TOYOTA', status: 'ACTIVE'}]});
  const report = await run(fake);
  assert.equal(report.status, 'FAIL');
  assert.equal(report.fatal, 'NON_SYNTHETIC_ACTIVE_VEHICLE');
  assert.equal(fake.state.cancelled.length, 0);
});

test('fail-closed: health not ready aborts', async () => {
  const fake = createFakeGas({health: 'maintenance'});
  const report = await run(fake);
  assert.equal(report.status, 'FAIL');
  assert.equal(fake.state.cancelled.length, 0);
});

test('happy path: retires synthetic, re-seeds N, verifies, backup before mutation, admin preserved', async () => {
  const dir = tempDir();
  const fake = createFakeGas();
  const report = await run(fake, {reportDir: dir});
  assert.equal(report.status, 'PASS');
  assert.equal(report.retired.vehicles, 2);
  assert.equal(report.seeded, 3);
  assert.equal(exitCodeFor(report), 0);
  // backup snapshot taken before any cancel
  assert.ok(fake.state.calls.indexOf('vehicles.list') < fake.state.calls.indexOf('vehicles.cancel'));
  assert.ok(report.backup && fs.existsSync(path.join(dir, path.basename(report.backup))));
  // admin never suspended; synthetic user suspended
  assert.ok(!fake.state.suspended.includes('admin'));
  assert.ok(fake.state.suspended.includes('u-reg'));
  // both synthetic vehicles cancelled
  assert.deepEqual(fake.state.cancelled.sort(), ['v1', 'v2']);
  // cleanup passed
  assert.ok(report.cleanup.every(c => c.status === 'PASS'));
});

test('cleanup failure yields CLEANUP_FAIL exit code 3', async () => {
  const fake = createFakeGas({logoutOk: false});
  const report = await run(fake);
  assert.equal(report.status, 'CLEANUP_FAIL');
  assert.equal(exitCodeFor(report), 3);
});

test('synthetic classifiers', () => {
  assert.ok(isSyntheticVehicle({plate: 'ฑฆ99'}));
  assert.ok(isSyntheticVehicle({plate: 'TST123'}));
  assert.ok(isSyntheticVehicle({plate: 'ขข1', brand: 'SYNTHETIC'}));
  assert.ok(!isSyntheticVehicle({plate: 'ขข999', brand: 'TOYOTA'}));
  assert.ok(isSyntheticOrg({name: 'P6VC Automated x'}));
  assert.ok(isSyntheticOrg({name: 'Other', type: 'EXTERNAL'}));
  assert.ok(!isSyntheticOrg({name: 'Real Org', type: 'INTERNAL'}));
  assert.ok(isSyntheticUser({username: 'p6vc_reg_x'}, 'admin'));
  assert.ok(!isSyntheticUser({username: 'admin'}, 'admin'));
  assert.ok(!isSyntheticUser({username: 'realperson', displayName: 'Real'}, 'admin'));
});