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

// ---- owner 2026-11-27 "Pepper + fewer rounds" ----
const PEPPER = 's'.repeat(48); // synthetic
const legacyWith = pepper => createGasSecurity({utilities: nodeUtilities(), clock: () => '2026-11-27T00:00:00.000Z',
  propertiesService: {getScriptProperties: () => ({getProperty: k => (k === 'VEHICLE_AUTH_PEPPER' ? 'p'.repeat(40) : k === 'VEHICLE_PASSWORD_PEPPER' ? pepper : null)})}});

test('HASH-05 peppered hashes: 60,000 rounds; both engines with the same pepper verify each other; a wrong or missing pepper never verifies', async () => {
  const core = createNodePasswordHasher({pepper: PEPPER}), legacyP = legacyWith(PEPPER);
  const fromCore = await core.hash(PW), fromLegacy = legacyP.hashPassword(PW);
  for (const h of [fromCore, fromLegacy]) {
    const parsed = parsePasswordHash(h);
    assert.equal(parsed.peppered, true); assert.equal(parsed.rounds, 60000);
    assert.equal(await core.verify(PW, h), true); assert.equal(legacyP.verifyPassword(PW, h), true);
    assert.equal(await core.verify(PW + 'x', h), false);
    assert.equal(await createNodePasswordHasher({pepper: 'q'.repeat(48)}).verify(PW, h), false, 'another pepper');
    assert.equal(await createNodePasswordHasher().verify(PW, h), false, 'no pepper (e.g. GAS)');
    assert.equal(legacy.verifyPassword(PW, h), false, 'the GAS-side hasher without the pepper');
  }
  assert.throws(() => createNodePasswordHasher({pepper: 'short'}), /PASSWORD_PEPPER_NOT_CONFIGURED/);
});

test('HASH-06 old plain hashes still verify on a peppered engine and are marked for upgrade; current ones are not', async () => {
  const core = createNodePasswordHasher({pepper: PEPPER});
  const old = legacy.hashPassword(PW); // plain, 150,000 rounds (as every stored hash today)
  assert.equal(await core.verify(PW, old), true);
  assert.equal(core.needsRehash(old), true);
  assert.equal(core.needsRehash(await core.hash(PW)), false);
  assert.equal(createNodePasswordHasher().needsRehash(old), false, 'an engine without the pepper never upgrades');
  assert.equal(core.needsRehash('garbage'), false);
  assert.equal(await core.verify(PW, null), false, 'the dummy check');
});

test('HASH-07 login upgrades an old hash once, then the user logs in with the new one; timing work is the new cost', async () => {
  const {loginFlow} = await import('../../gas/src/application/flows/AuthFlows.js');
  const rows = {vc_users: [{user_id: 'u1', username_normalized: 'staff', status: 'ACTIVE', password_hash: legacy.hashPassword(PW), password_change_required: false}],
    vc_settings: [{key: 'idle_timeout_minutes', value: '30'}], vc_user_roles: [{user_id: 'u1', role_id: 'STAFF', status: 'ACTIVE'}],
    vc_user_permissions: [], vc_security_events: [], vc_sessions: []};
  const match = (r, f) => Object.entries(f || {}).every(([k, v]) => r[k] === v);
  const store = {
    readMany: async (reqs, opts = {}) => { for (const [t, row] of opts.inserts || []) rows[t].push(row);
      return reqs.map(r => { const hit = rows[r.name].filter(x => match(x, r.filter)); return r.kind === 'one' ? hit[0] || null : hit; }); },
    insert: async (t, row) => (rows[t].push(row), row),
    patch: async (t, f, fields) => { for (const r of rows[t]) if (match(r, f)) Object.assign(r, fields); return true; }
  };
  let n = 0;
  const deps = {now: () => '2026-11-27T00:00:00.000Z', id: () => (++n).toString(16).padStart(64, '0'), sha256: x => 'd'.repeat(63) + String(x).length % 10};
  const passwords = createNodePasswordHasher({pepper: PEPPER});
  const first = await runFlowAsync(loginFlow({username: 'staff', password: PW}, deps), {store, passwords});
  assert.ok(first.sessionToken);
  assert.equal(parsePasswordHash(rows.vc_users[0].password_hash).peppered, true, 'upgraded to the peppered format');
  const upgraded = rows.vc_users[0].password_hash;
  const second = await runFlowAsync(loginFlow({username: 'staff', password: PW}, deps), {store, passwords});
  assert.ok(second.sessionToken); assert.equal(rows.vc_users[0].password_hash, upgraded, 'no second rewrite');
  await assert.rejects(runFlowAsync(loginFlow({username: 'staff', password: 'Wrong-Passw0rd-xx'}, deps), {store, passwords}), /INVALID_CREDENTIALS/);
});
