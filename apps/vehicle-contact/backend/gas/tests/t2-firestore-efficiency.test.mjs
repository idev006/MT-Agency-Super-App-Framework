// T2 (owner 2026-11-25 "Start T2"): Firestore efficiency, phase 2. Real REST gateway + store over the
// contract-enforcing fake server (bills like Firestore).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFirestoreStore, TTL_RULES, TTL_FIELD} from '../src/infrastructure/persistence/firestore/FirestoreStore.js';
import {createFirestoreRestGateway} from '../src/infrastructure/persistence/firestore/FirestoreRestGateway.js';
import {createSessionService} from '../src/application/security/SessionService.js';
import {createFakeFirestoreRest, makeFakeUtilities, fakeServiceAccountKey, PROJECT, DATABASE} from './fake-firestore-rest-server.mjs';

const NOW = '2026-11-25T10:00:00.000Z';
const sha256 = v => createHash('sha256').update(String(v), 'utf8').digest('hex');
let n = 0;
const security = {now: () => NOW, sha256, secretToken: () => (++n).toString(16).padStart(64, 'a')};

function setup() {
  const fake = createFakeFirestoreRest();
  const key = fakeServiceAccountKey();
  const gw = createFirestoreRestGateway({utilities: makeFakeUtilities(), urlFetchApp: fake, clientEmail: key.client_email,
    privateKey: key.private_key, projectId: PROJECT, databaseId: DATABASE, clock: () => NOW});
  const store = createFirestoreStore({firestore: gw});
  fake.state.seed('vc_users', 'u1', {user_id: 'u1', status: 'ACTIVE', password_change_required: false, _seq: 1});
  fake.state.seed('vc_user_roles', 'r1', {assignment_id: 'r1', user_id: 'u1', role_id: 'STAFF', status: 'ACTIVE', _seq: 1});
  fake.state.seed('vc_settings', 'idle', {key: 'idle_timeout_minutes', value: '30', _seq: 1});
  store.one('vc_settings', {key: 'warm'}); // prime the OAuth token
  return {fake, store, sessions: createSessionService({store, security})};
}

test('T2-01 login writes the access snapshot; the session check is then session + user = 2 reads (was 4)', () => {
  const {fake, sessions} = setup();
  const {sessionToken} = sessions.issue({user_id: 'u1', password_change_required: false});
  const b = fake.state.billedReads;
  const out = sessions.authorize(sessionToken, 'vehicle.lookup');
  assert.equal(fake.state.billedReads - b, 2, 'session + user only');
  assert.deepEqual(out.roles, ['STAFF']); assert.ok(out.permissions.includes('vehicle.lookup'));
  assert.throws(() => sessions.authorize(sessionToken, 'users.manage'), /FORBIDDEN/, 'the snapshot still enforces permissions');
});

test('T2-02 a session issued before T2 (no snapshot) still works through the live role read', () => {
  const {fake, sessions} = setup();
  const token = 'c'.repeat(64);
  fake.state.seed('vc_sessions', 's-old', {session_id: 's-old', user_id: 'u1', token_digest: sha256(token), status: 'ACTIVE',
    issued_at: '2026-11-25T09:00:00.000Z', expires_at: '2026-11-25T17:00:00.000Z', last_seen_at: '2026-11-25T09:59:30.000Z', idle_timeout_minutes: 30, revoked_at: '', _seq: 2});
  const b = fake.state.billedReads;
  assert.deepEqual(sessions.authorize(token, 'vehicle.lookup').roles, ['STAFF']);
  assert.ok(fake.state.billedReads - b >= 3, 'legacy path reads roles + overrides');
});

test('T2-03 a role change revokes the session, so a stale snapshot can never be used', () => {
  const {sessions} = setup();
  const {sessionToken} = sessions.issue({user_id: 'u1', password_change_required: false});
  sessions.revokeUser('u1'); // what users.assignRoles / suspend / resetPassword / changePassword do
  assert.throws(() => sessions.authorize(sessionToken, 'vehicle.lookup'), /UNAUTHENTICATED/);
});

test('T2-04 TTL: housekeeping rows get a real timestamp expire_at; it survives a transactional update; reads never show it', () => {
  const {fake, store} = setup();
  store.insert('vc_security_events', {event_id: 'e1', username_digest: 'd', status: 'FAILED', created_at: NOW});
  const ev = fake.state.rawFields('vc_security_events', 'e1');
  assert.deepEqual(ev[TTL_FIELD], {timestampValue: new Date(Date.parse(NOW) + TTL_RULES.vc_security_events.days * 86400000).toISOString()});
  assert.equal(TTL_FIELD in store.one('vc_security_events', {event_id: 'e1'}), false, 'stripped like _seq');
  store.sequence(tx => tx.update('vc_security_events', {event_id: 'e1'}, {status: 'CLEARED'}));
  assert.ok('timestampValue' in fake.state.rawFields('vc_security_events', 'e1')[TTL_FIELD], 'still a timestamp after a full-document transactional write');
  store.insert('vc_vehicles', {vehicle_id: 'v1', plate_normalized: 'X', province_code: '10', status: 'ACTIVE', version: 1, created_at: NOW, updated_at: NOW,
    vehicle_type: 'RY01', make: 'M', model: 'X', color: 'WHITE', plate_type: 'STANDARD', created_by: 'u1', updated_by: 'u1'});
  assert.equal(TTL_FIELD in fake.state.rawFields('vc_vehicles', 'v1'), false, 'business tables never expire');
  assert.deepEqual(Object.keys(TTL_RULES).sort(), ['vc_idempotency', 'vc_operation_journal', 'vc_security_events', 'vc_sessions'], 'audit trails are not TTL-deleted');
});

import {ensureFieldConfig, FIELD_SSOT} from '../scripts/ensure-firestore-field-config.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
test('T2-05 field config as code: gated, dry run lists, apply PATCHes only what is missing and waits', async () => {
  assert.equal((await ensureFieldConfig({env: {}})).status, 'BLOCKED');
  const fields = new Map(); const calls = [];
  const client = {request: async ({url, method, data}) => {
    const k = url.split('/collectionGroups/')[1].split('?')[0];
    calls.push(method || 'GET');
    if (method === 'PATCH') { fields.set(k, {...(fields.get(k) || {}), ...(data.ttlConfig ? {ttlConfig: {state: 'ACTIVE'}} : {indexConfig: {indexes: [], usesAncestorConfig: false}})}); return {data: {}}; }
    if (!fields.has(k)) { const e = new Error('nf'); e.response = {status: 404}; throw e; }
    return {data: fields.get(k)};
  }};
  const keyFile = path.join(os.tmpdir(), 'p6vc-t2-fake-sa-' + process.pid + '.json');
  fs.writeFileSync(keyFile, JSON.stringify(fakeServiceAccountKey()));
  const env = {P6VC_ALLOW_INDEX_ADMIN: 'ENSURE_FIRESTORE_INDEXES', GOOGLE_APPLICATION_CREDENTIALS: keyFile};
  const total = FIELD_SSOT.ttl.length + FIELD_SSOT.indexExemptions.length;
  const dry = await ensureFieldConfig({env, client});
  assert.equal(dry.status, 'MISSING'); assert.equal(dry.missing.length, total); assert.ok(!calls.includes('PATCH'));
  const run = await ensureFieldConfig({env, client, apply: true, sleep: async () => {}});
  assert.equal(run.status, 'PASS'); assert.equal(run.applied.length, total);
  assert.equal((await ensureFieldConfig({env, client})).status, 'PASS', 'idempotent');
  const queried = ['vehicle_id', 'user_id', 'status', 'token_digest', 'key', 'operation', 'entity_id', 'idempotency_key', 'plate_normalized', 'province_code', 'owner_user_id', 'submitted_by', 'username_digest'];
  assert.ok(FIELD_SSOT.indexExemptions.every(x => !queried.includes(x.field)), 'a queried field is never exempted');
  fs.rmSync(keyFile, {force: true});
});

import {createRuntimeStore, FREE_TIER_DATABASE} from '../src/composition/StoreSelector.js';
import {inspectScriptProperties} from '../src/composition/RuntimeConfig.js';
test('T2-06 the runtime always uses the (default) database (free tier); a stale named-database property is ignored and flagged', () => {
  assert.equal(FREE_TIER_DATABASE, '(default)');
  const seen = [];
  const key = fakeServiceAccountKey();
  const props = {getProperty: k => ({VEHICLE_FIRESTORE_SA_KEY: JSON.stringify(key), VEHICLE_FIRESTORE_DATABASE_ID: 'p6vc-us'})[k] || null};
  const urlFetchApp = {fetch: url => { seen.push(String(url));
    return String(url).includes('oauth2') ? {getResponseCode: () => 200, getContentText: () => JSON.stringify({access_token: 't', expires_in: 3600})}
      : {getResponseCode: () => 200, getContentText: () => '[]'}; }};
  const store = createRuntimeStore({props, services: {utilities: makeFakeUtilities(), urlFetchApp}, clock: () => NOW});
  store.one('vc_settings', {key: 'k'});
  const fsCalls = seen.filter(u => u.includes('firestore.googleapis.com'));
  assert.ok(fsCalls.length && fsCalls.every(u => u.includes('/databases/(default)/')), 'never the named database');
  assert.ok(inspectScriptProperties({VEHICLE_FIRESTORE_DATABASE_ID: 'p6vc-us'}).retiredPresent.includes('VEHICLE_FIRESTORE_DATABASE_ID'));
});
