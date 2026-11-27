// VC-ADR-046 phase 2b: every operation ported to the core must answer EXACTLY like the legacy engine. The same envelopes go
// to the legacy router + controller (acceptance harness A) and to the core facade (identical harness B: views WRITE access
// audit rows and the admin detail SHOWS them, so each engine gets its own identical copy of the data).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAcceptanceHarness, assertOk, SAMPLE_PASSWORD} from '../../gas/tests/acceptance-fixture.mjs';
import {createCoreFacade, FLOWS} from '../src/facade/operations.mjs';

// a synchronous in-memory store / photo store behind promises — what the core's Firestore store and bridge look like
const asyncOf = store => ({
  supportsTtl: false,
  one: async (t, f) => store.one(t, f),
  readMany: async (reqs, opts = {}) => { for (const [t, row] of opts.inserts || []) store.insert(t, row);
    return reqs.map(r => r.kind === 'one' ? store.one(r.name, r.filter) : r.kind === 'count' ? store.list(r.name, r.filter).length
      : r.kind === 'newest' ? store.listNewest(r.name, r.filter, r.limit || 1) : store.list(r.name, r.filter)); },
  patch: async (t, f, fields) => (store.update(t, f, fields), true),
  insert: async (t, row) => store.insert(t, row)
});
const asyncMedia = photos => ({read: async ref => photos.read(ref)});

function world() {
  const h = createAcceptanceHarness();
  const org = h.createOrganization(), camp = h.createCampaign();
  const r = assertOk(assert, h.call('registrations.submit', h.registrationPayload(camp.campaignToken, org, h.stagePhotos(camp.campaignToken))), 'submit');
  const v = assertOk(assert, h.as('reg', 'registrations.review', {requestId: r.requestId, decision: 'APPROVE', stickerCategory: 'NCO', platePhotoVerified: true}), 'approve');
  const vehicle = h.store.one('vc_vehicles', {vehicle_id: v.vehicleId});
  const photo = h.store.list('vc_vehicle_photos', {vehicle_id: v.vehicleId})[0];
  return {h, v, vehicle, photo, qrToken: v.qrToken};
}
const env = (h, op, payload, actor, extra = {}) => ({apiVersion: 'v1', group: op.split('.')[0], action: op.split('.').slice(1).join('.'), payload,
  ...(actor ? {sessionToken: h.tokens[actor]} : {}), requestId: 'syntheticAcceptance', ...extra});

// every case: [name, (world) => [op, payload, actor, extra?]]
const CASES = [
  ['lookup found (staff)', w => ['vehicles.lookup', {plate: w.vehicle.plate_normalized, province: w.vehicle.province_code}, 'staff']],
  ['lookup found (admin)', w => ['vehicles.lookup', {plate: w.vehicle.plate_normalized, province: w.vehicle.province_code}, 'sys']],
  ['lookup not found', w => ['vehicles.lookup', {plate: 'ZZ 9999', province: w.vehicle.province_code}, 'staff']],
  ['lookup without permission', w => ['vehicles.lookup', {plate: w.vehicle.plate_normalized, province: w.vehicle.province_code}, 'owner']],
  ['qr resolve', w => ['qr.resolve', {token: w.qrToken}, 'staff']],
  ['qr unknown token', () => ['qr.resolve', {token: 'f'.repeat(64)}, 'staff']],
  ['qr bad token', () => ['qr.resolve', {token: 'not-hex'}, 'staff']],
  ['detail (staff)', w => ['vehicles.detail', {vehicleId: w.v.vehicleId}, 'staff']],
  ['detail (admin: Vehicle 360 + access log + sticker)', w => ['vehicles.detail', {vehicleId: w.v.vehicleId}, 'sys']],
  ['detail (registration admin)', w => ['vehicles.detail', {vehicleId: w.v.vehicleId}, 'reg']],
  ['detail unknown vehicle', () => ['vehicles.detail', {vehicleId: 'no-such-vehicle'}, 'staff']],
  ['history', w => ['vehicles.history', {vehicleId: w.v.vehicleId}, 'staff']],
  ['contacts', w => ['contacts.read', {vehicleId: w.v.vehicleId}, 'staff']],
  ['contacts unknown vehicle', () => ['contacts.read', {vehicleId: 'no-such-vehicle'}, 'staff']],
  ['photo', w => ['vehicles.photo', {vehicleId: w.v.vehicleId, photoId: w.photo.photo_id}, 'staff']],
  ['photo of another vehicle id', w => ['vehicles.photo', {vehicleId: 'no-such-vehicle', photoId: w.photo.photo_id}, 'staff']],
  ['no session', w => ['vehicles.detail', {vehicleId: w.v.vehicleId}, null]],
  ['extra payload field', w => ['contacts.read', {vehicleId: w.v.vehicleId, role: 'SYSTEM_ADMIN'}, 'staff']],
  ['bad api version', w => ['vehicles.history', {vehicleId: w.v.vehicleId}, 'staff', {apiVersion: 'v9'}]]
];

test('BOTH-01 the six officer-path operations: the core answers exactly like the legacy engine, and writes the same audit rows', async () => {
  for (const [name, make] of CASES) {
    const A = world(), B = world();
    const [op, payload, actor, extra] = make(A);
    const e = env(A.h, op, payload, actor, extra || {});
    const want = A.h.call(op, payload, actor, {version: e.apiVersion});
    const core = createCoreFacade({store: asyncOf(B.h.store), media: asyncMedia(B.h.drivePhotos), now: () => B.h.security.now(),
      sha256: x => B.h.security.sha256(x), id: () => B.h.security.secretToken()});
    const got = await core.dispatch({...env(B.h, ...make(B), ...[]), ...(extra || {})}, 'POST');
    assert.deepEqual(got, want, name);
    // the access log the operation wrote is the same (source, result, actor, vehicle)
    const audits = h => h.store.list('vc_lookup_audit').map(a => [a.lookup_source, a.result, a.actor_id, a.vehicle_id]);
    assert.deepEqual(audits(B.h), audits(A.h), name + ': audit rows');
  }
});

test('BOTH-02 the core answers only operations it has a flow for', async () => {
  const {h} = world();
  assert.deepEqual([...Object.keys(FLOWS)].sort(), ['auth.changePassword', 'auth.googleLogin', 'auth.linkGoogle', 'auth.login', 'auth.logout', 'auth.session',
    'contacts.read', 'qr.resolve', 'vehicles.detail', 'vehicles.history', 'vehicles.lookup', 'vehicles.photo']);
  const core = createCoreFacade({store: asyncOf(h.store), now: () => h.security.now(), sha256: x => h.security.sha256(x)});
  const r = await core.dispatch(env(h, 'vehicles.update', {vehicleId: 'x', expectedVersion: 1}, 'reg'), 'POST');
  assert.equal(r.error.code, 'NOT_FOUND', 'an operation without a flow is not answered by the core');
});

// ---- phase 3 wave 1: auth.* — multi-step scenarios on both engines; every answer AND every auth table must be identical ----
const AUTH_TABLES = ['vc_sessions', 'vc_security_events', 'vc_users', 'vc_change_audit', 'vc_user_identities'];
function authEngines() {
  const A = createAcceptanceHarness(), B = createAcceptanceHarness();
  const store = {...asyncOf(B.store), sequence: async fn => fn(), remove: async (t, f) => B.store.remove(t, f), list: async (t, f) => B.store.list(t, f)};
  const core = createCoreFacade({store, now: () => B.security.now(), sha256: x => B.security.sha256(x), id: () => B.security.secretToken(),
    passwords: {hash: async p => B.security.hashPassword(p), verify: async (p, s) => B.security.verifyPassword(p, s)},
    google: {verify: async t => B.security.verifyGoogle(t)}});
  const legacyCall = (op, payload, token) => { if (!token) return A.call(op, payload); A.tokens.__step = token; return A.call(op, payload, '__step'); };
  const envOf = (op, payload, token) => ({apiVersion: 'v1', group: op.split('.')[0], action: op.split('.').slice(1).join('.'), payload,
    ...(token ? {sessionToken: token} : {}), requestId: 'syntheticAcceptance'});
  return {A, B, legacy: legacyCall, core: (op, payload, token) => core.dispatch(envOf(op, payload, token), 'POST')};
}
// a step: [op, payload, tokenOf(previous results, harness)] — the token comes from an earlier login (same value on both)
const AUTH_SCENARIOS = [
  ['login → session → logout → session again', [
    ['auth.login', () => ({username: 'staff', password: SAMPLE_PASSWORD})],
    ['auth.session', () => ({}), r => r[0].data.sessionToken],
    ['auth.logout', () => ({}), r => r[0].data.sessionToken],
    ['auth.session', () => ({}), r => r[0].data.sessionToken]]],
  ['wrong password 7 times → rate limit; unknown user', [
    ...Array.from({length: 7}, () => ['auth.login', () => ({username: 'staff', password: 'Wrong-Password-999!'})]),
    ['auth.login', () => ({username: 'no-such-user', password: SAMPLE_PASSWORD})]]],
  ['change password: old sessions revoked, new password works, old does not', [
    ['auth.login', () => ({username: 'staff', password: SAMPLE_PASSWORD})],
    ['auth.changePassword', () => ({oldPassword: 'wrong-old-password', newPassword: 'New-Synthetic-Pass-2026!'}), r => r[0].data.sessionToken],
    ['auth.changePassword', () => ({oldPassword: SAMPLE_PASSWORD, newPassword: 'short'}), r => r[0].data.sessionToken],
    ['auth.changePassword', () => ({oldPassword: SAMPLE_PASSWORD, newPassword: 'New-Synthetic-Pass-2026!'}), r => r[0].data.sessionToken],
    ['auth.session', () => ({}), r => r[0].data.sessionToken],
    ['auth.login', () => ({username: 'staff', password: SAMPLE_PASSWORD})],
    ['auth.login', () => ({username: 'staff', password: 'New-Synthetic-Pass-2026!'})]]],
  ['Google: unknown → link (wrong password, ok, again) → login; bad token', [
    ['auth.googleLogin', () => ({idToken: 'signed-oidc-for-fixture'})],
    ['auth.login', () => ({username: 'staff', password: SAMPLE_PASSWORD})],
    ['auth.linkGoogle', () => ({password: 'wrong-password-xx', idToken: 'signed-oidc-for-fixture'}), r => r[1].data.sessionToken],
    ['auth.linkGoogle', () => ({password: SAMPLE_PASSWORD, idToken: 'signed-oidc-for-fixture'}), r => r[1].data.sessionToken],
    ['auth.linkGoogle', () => ({password: SAMPLE_PASSWORD, idToken: 'signed-oidc-for-fixture'}), r => r[1].data.sessionToken],
    ['auth.googleLogin', () => ({idToken: 'signed-oidc-for-fixture'})],
    ['auth.googleLogin', () => ({idToken: 'forged-token'})]]],
  ['bad payloads and no session', [
    ['auth.login', () => ({username: 'staff'})],
    ['auth.login', () => ({username: 'staff', password: SAMPLE_PASSWORD, role: 'SYSTEM_ADMIN'})],
    ['auth.session', () => ({})],
    ['auth.logout', () => ({}), () => 'f'.repeat(64)]]]
];

test('BOTH-03 auth.*: the core answers every step exactly like the legacy engine and leaves identical auth tables', async () => {
  const outcomes = {};
  for (const [name, steps] of AUTH_SCENARIOS) {
    const e = authEngines(), got = {legacy: [], core: []};
    for (const [i, [op, payload, tokenOf]] of steps.entries()) {
      const want = e.legacy(op, payload(), tokenOf ? tokenOf(got.legacy) : null);
      const have = await e.core(op, payload(), tokenOf ? tokenOf(got.core) : null);
      got.legacy.push(want); got.core.push(have);
      assert.deepEqual(have, want, `${name} — step ${i + 1} ${op}`);
    }
    for (const t of AUTH_TABLES) assert.deepEqual(e.B.store.list(t), e.A.store.list(t), `${name} — table ${t}`);
    outcomes[name] = got.legacy.map(r => (r.ok ? 'OK' : r.error.code));
  }
  // the scenarios exercise the real rules (not only identical failures)
  assert.deepEqual(outcomes['login → session → logout → session again'], ['OK', 'OK', 'OK', 'UNAUTHENTICATED']);
  assert.deepEqual(outcomes['wrong password 7 times → rate limit; unknown user'].slice(5), ['INVALID_CREDENTIALS', 'LOGIN_RATE_LIMIT', 'INVALID_CREDENTIALS']);
  assert.deepEqual(outcomes['change password: old sessions revoked, new password works, old does not'].slice(3), ['OK', 'UNAUTHENTICATED', 'INVALID_CREDENTIALS', 'OK']);
  assert.deepEqual(outcomes['Google: unknown → link (wrong password, ok, again) → login; bad token'],
    ['INVALID_CREDENTIALS', 'OK', 'INVALID_CREDENTIALS', 'OK', 'IDENTITY_ALREADY_LINKED', 'OK', outcomes['Google: unknown → link (wrong password, ok, again) → login; bad token'][6]]);
  assert.notEqual(outcomes['Google: unknown → link (wrong password, ok, again) → login; bad token'][6], 'OK');
});
