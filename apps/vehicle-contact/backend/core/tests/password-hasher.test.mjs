// VC-ADR-046 phase 3 wave 0: ONE password hash rule, two PBKDF2 implementations. The core (node:crypto, async) and the legacy
// engine (pure JS, sync — written for GAS) must accept each other's hashes, apply the same format / round limits, and the
// flow effects {hashPassword} / {verifyPassword} must answer the same on both runners. Synthetic passwords only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNodePasswordHasher} from '../src/adapters/security/password-hasher.mjs';
import {createGasSecurity} from '../../gas/src/infrastructure/security/GasSecurity.js';
import {nodeUtilities} from '../../cloudrun/runtime.mjs';
import {PBKDF2_ROUNDS, parsePasswordHash} from '../../gas/src/application/security/PasswordHash.js';
import {runFlowSync, runFlowAsync} from '../../gas/src/application/flows/FlowRunner.js';

const PW = 'Synthetic-Passw0rd!';
const legacy = createGasSecurity({utilities: nodeUtilities(), clock: () => '2026-11-27T00:00:00.000Z',
  propertiesService: {getScriptProperties: () => ({getProperty: k => (k === 'VEHICLE_AUTH_PEPPER' ? 'p'.repeat(40) : null)})}});
const core = createNodePasswordHasher();

test('HASH-01 a hash made by either engine verifies on both; a wrong password fails on both', async () => {
  const fromCore = await core.hash(PW), fromLegacy = legacy.hashPassword(PW);
  for (const h of [fromCore, fromLegacy]) {
    assert.equal(parsePasswordHash(h).rounds, PBKDF2_ROUNDS);
    assert.equal(await core.verify(PW, h), true); assert.equal(legacy.verifyPassword(PW, h), true);
    assert.equal(await core.verify(PW + 'x', h), false); assert.equal(legacy.verifyPassword(PW + 'x', h), false);
  }
  assert.notEqual(fromCore.split('$')[2], (await core.hash(PW)).split('$')[2], 'a fresh salt each time');
});

test('HASH-02 the same rule on both: round limits, malformed hashes, password length', async () => {
  const h = legacy.hashPassword(PW), [p, , salt, key] = h.split('$');
  for (const bad of [`${p}$99999$${salt}$${key}`, `${p}$900001$${salt}$${key}`, `md5$150000$${salt}$${key}`, `${p}$150000$${salt}$zz`, '', null]) {
    assert.equal(await core.verify(PW, bad), false, String(bad)); assert.equal(legacy.verifyPassword(PW, bad), false, String(bad));
  }
  for (const pw of ['short', 'x'.repeat(129), 42]) {
    assert.throws(() => core.hash(pw), /INVALID_PASSWORD/); assert.throws(() => legacy.hashPassword(pw), /INVALID_PASSWORD/);
  }
});

test('HASH-03 the core hash runs in the thread pool: 8 at once take far less than 8 one after another of the pure-JS hash', async () => {
  const t = performance.now(); await Promise.all(Array.from({length: 8}, () => core.hash(PW))); const parallel = performance.now() - t;
  const t2 = performance.now(); legacy.hashPassword(PW); const oneLegacy = performance.now() - t2;
  assert.ok(parallel < oneLegacy * 8, `8 async core hashes ${Math.round(parallel)} ms vs 8 x legacy ${Math.round(oneLegacy * 8)} ms`);
});

test('HASH-04 flow effects {hashPassword} / {verifyPassword}: same answers on the sync and the async runner', async () => {
  function* flow(stored) {
    const ok = yield {verifyPassword: {password: PW, stored}};
    const bad = yield {verifyPassword: {password: 'nope-nope-nope', stored}};
    const fresh = yield {hashPassword: PW};
    return {ok, bad, freshValid: !!parsePasswordHash(fresh)};
  }
  const stored = legacy.hashPassword(PW), store = {readMany: async () => []};
  const sync = runFlowSync(flow(stored), {store, passwords: {hash: legacy.hashPassword, verify: legacy.verifyPassword}});
  const async = await runFlowAsync(flow(stored), {store, passwords: core});
  assert.deepEqual(sync, {ok: true, bad: false, freshValid: true}); assert.deepEqual(async, sync);
  assert.throws(() => runFlowSync(flow(stored), {store}), /PASSWORDS_NOT_CONFIGURED/);
});
