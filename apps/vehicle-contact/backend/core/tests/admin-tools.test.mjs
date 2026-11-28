// R11 (VC-ADR-057): first admin + admin password reset as a manual core job — every gate of the GAS tools, plus the typed
// approval, the owner's secret, the pepper, and a Firestore one-shot state. Synthetic store; a test pepper; no real secret.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createAcceptanceHarness, asyncStoreOver} from './support/core-harness.mjs';
import {runAdminTool, passwordPolicyOk} from '../src/facade/admin-tools.mjs';
import {JOBS} from '../src/facade/jobs.mjs';
import {createNodePasswordHasher} from '../src/adapters/security/password-hasher.mjs';
import {parsePasswordHash} from '../../gas/src/application/security/PasswordHash.js';

const STRONG = 'Synthetic-Admin-Temp-Pass-2026!', STRONG2 = 'Another-Synthetic-Temp-Pass-77#';
const passwords = createNodePasswordHasher({pepper: 'synthetic-test-pepper-not-a-secret'});
const id = () => randomBytes(32).toString('hex');
const emptySystem = () => {
  const h = createAcceptanceHarness();
  for (const u of h.store.list('vc_users')) h.store.remove('vc_users', {user_id: u.user_id});
  for (const r of h.store.list('vc_user_roles')) h.store.remove('vc_user_roles', {assignment_id: r.assignment_id});
  for (const s of h.store.list('vc_sessions')) h.store.remove('vc_sessions', {session_id: s.session_id});
  for (const s of h.store.list('vc_settings')) h.store.remove('vc_settings', {key: s.key});
  return h;
};
const run = (store, mode, extra = {}) => runAdminTool({store, mode, passwords, pepperConfigured: true, id,
  approval: {BOOTSTRAP_APPLY: 'BOOTSTRAP_ADMIN_ONCE', RESET_APPLY: 'RESET_ADMIN_ONCE'}[mode] || '', ...extra,
  input: {username: 'admin', idleMinutes: '30', tempPassword: STRONG, ...(extra.input || {})}});
const rowsOf = h => JSON.stringify(['vc_users', 'vc_user_roles', 'vc_sessions', 'vc_settings', 'vc_change_audit'].map(t => h.store.list(t)));

test('R11-01 modes, approval and the password policy', async () => {
  const h = emptySystem(), store = asyncStoreOver(h.store);
  await assert.rejects(run(store, 'DELETE_ALL'), /ADMIN_TOOL_MODE_INVALID/);
  await assert.rejects(run(store, 'BOOTSTRAP_APPLY', {approval: 'yes'}), /ADMIN_TOOL_APPROVAL_REQUIRED/);
  await assert.rejects(run(store, 'RESET_APPLY', {approval: 'BOOTSTRAP_ADMIN_ONCE'}), /ADMIN_TOOL_APPROVAL_REQUIRED/);
  for (const weak of ['short-A1!', 'nouppercase-1234567!', 'NOLOWERCASE-1234567!', 'No-Digits-Here-At-All!', 'NoSymbols1234567890ab', ' Leading-Space-1234!x'])
    assert.equal(passwordPolicyOk(weak), false, weak);
  assert.equal(passwordPolicyOk(STRONG), true);
});

test('R11-02 bootstrap: preview writes nothing; refuses bad config, a weak password, no pepper, an existing user', async () => {
  const h = emptySystem(), store = asyncStoreOver(h.store), before = rowsOf(h);
  assert.deepEqual(await run(store, 'BOOTSTRAP_PREVIEW'), {mode: 'BOOTSTRAP_PREVIEW', status: 'PASS', result: 'READY_FOR_BOOTSTRAP', usersExisting: 0, dataModified: false, credentialsExposed: false});
  assert.equal(rowsOf(h), before, 'preview never writes');
  await assert.rejects(run(store, 'BOOTSTRAP_APPLY', {input: {username: 'A D M I N'}}), /INVALID_BOOTSTRAP_CONFIGURATION/);
  await assert.rejects(run(store, 'BOOTSTRAP_APPLY', {input: {idleMinutes: '999'}}), /INVALID_BOOTSTRAP_CONFIGURATION/);
  await assert.rejects(run(store, 'BOOTSTRAP_APPLY', {input: {tempPassword: 'weak'}}), /BOOTSTRAP_TEMP_PASSWORD_POLICY_FAILED/);
  await assert.rejects(run(store, 'BOOTSTRAP_APPLY', {pepperConfigured: false}), /ADMIN_TOOL_PEPPER_MISSING/);
  assert.equal(rowsOf(h), before, 'nothing written by a refused run');
  await assert.rejects(run(asyncStoreOver(createAcceptanceHarness().store), 'BOOTSTRAP_APPLY'), /BOOTSTRAP_ALREADY_COMPLETED/, 'only an empty system');
});

test('R11-03 bootstrap apply: one admin + role + audit + idle setting in one commit; peppered hash; change forced; no secret in the report', async () => {
  const h = emptySystem(), store = asyncStoreOver(h.store);
  const report = await run(store, 'BOOTSTRAP_APPLY');
  assert.equal(report.result, 'CREATED');
  const text = JSON.stringify(report);
  const [admin] = h.store.list('vc_users');
  for (const secret of [STRONG, admin.password_hash, admin.user_id]) assert.ok(!text.includes(secret), 'report free of secrets / ids');
  assert.equal(admin.username_normalized, 'admin'); assert.equal(admin.password_change_required, true);
  assert.equal(parsePasswordHash(admin.password_hash).peppered, true, 'one hash rule, with the pepper');
  assert.equal(await passwords.verify(STRONG, admin.password_hash), true);
  assert.deepEqual(h.store.list('vc_user_roles').map(r => [r.user_id === admin.user_id, r.role_id, r.status]), [[true, 'SYSTEM_ADMIN', 'ACTIVE']]);
  assert.equal(h.store.list('vc_change_audit').filter(a => a.action === 'JOB_ADMIN_BOOTSTRAP').length, 1);
  assert.equal(h.store.one('vc_settings', {key: 'idle_timeout_minutes'}).value, '30');
  await assert.rejects(run(store, 'BOOTSTRAP_APPLY'), /BOOTSTRAP_ALREADY_COMPLETED/, 'one-shot');
});

test('R11-04 reset: target, role, label, password and pepper gates; preview counts sessions and writes nothing', async () => {
  const h = emptySystem(), store = asyncStoreOver(h.store);
  await run(store, 'BOOTSTRAP_APPLY');
  const admin = h.store.one('vc_users', {username_normalized: 'admin'});
  for (let i = 0; i < 3; i++) h.store.insert('vc_sessions', {session_id: 's' + i, user_id: admin.user_id, status: 'ACTIVE', revoked_at: ''});
  const ok = {expectedUserId: admin.user_id, runLabel: 'reset-20261128', tempPassword: STRONG2};
  const before = rowsOf(h);
  const preview = await run(store, 'RESET_PREVIEW', {input: ok});
  assert.deepEqual([preview.result, preview.sessionsToRevoke, preview.dataModified], ['READY_FOR_RESET', 3, false]);
  assert.equal(rowsOf(h), before, 'preview never writes');
  await assert.rejects(run(store, 'RESET_APPLY', {input: {...ok, expectedUserId: 'f'.repeat(64)}}), /RESET_ADMIN_IDENTITY_MISMATCH/);
  await assert.rejects(run(store, 'RESET_APPLY', {input: {...ok, expectedUserId: ''}}), /RESET_TARGET_NOT_CONFIRMED/);
  await assert.rejects(run(store, 'RESET_APPLY', {input: {...ok, runLabel: 'x'}}), /RESET_RUN_LABEL_INVALID/);
  await assert.rejects(run(store, 'RESET_APPLY', {input: {...ok, tempPassword: 'weak'}}), /RESET_NEW_PASSWORD_POLICY_FAILED/);
  await assert.rejects(run(store, 'RESET_APPLY', {input: ok, pepperConfigured: false}), /ADMIN_TOOL_PEPPER_MISSING/);
  h.store.update('vc_user_roles', {user_id: admin.user_id}, {status: 'REVOKED'});
  await assert.rejects(run(store, 'RESET_APPLY', {input: ok}), /RESET_ADMIN_ROLE_MISMATCH/);
  h.store.update('vc_user_roles', {user_id: admin.user_id}, {status: 'ACTIVE'});
  assert.equal(rowsOf(h).length > 0 && rowsOf(h).includes('REVOKED'), false, 'no session revoked by a refused run');
});

test('R11-05 reset apply: sessions revoked first, new peppered hash, change forced, audit, DONE; the same run label is refused', async () => {
  const h = emptySystem(), store = asyncStoreOver(h.store);
  await run(store, 'BOOTSTRAP_APPLY');
  const admin = h.store.one('vc_users', {username_normalized: 'admin'});
  h.store.update('vc_users', {user_id: admin.user_id}, {password_change_required: false});
  for (let i = 0; i < 2; i++) h.store.insert('vc_sessions', {session_id: 'r' + i, user_id: admin.user_id, status: 'ACTIVE', revoked_at: ''});
  const ok = {expectedUserId: admin.user_id, runLabel: 'reset-20261128', tempPassword: STRONG2};
  const report = await run(store, 'RESET_APPLY', {input: ok});
  assert.deepEqual([report.result, report.sessionsRevoked, report.mustChangePassword], ['DONE', 2, true]);
  assert.ok(!JSON.stringify(report).includes(STRONG2) && !JSON.stringify(report).includes(admin.user_id));
  const after = h.store.one('vc_users', {user_id: admin.user_id});
  assert.equal(await passwords.verify(STRONG2, after.password_hash), true); assert.equal(await passwords.verify(STRONG, after.password_hash), false);
  assert.equal(after.password_change_required, true);
  assert.ok(h.store.list('vc_sessions').every(s => s.status === 'REVOKED'));
  assert.equal(h.store.list('vc_change_audit').filter(a => a.action === 'JOB_ADMIN_PASSWORD_RESET').length, 1);
  assert.equal(JSON.parse(h.store.one('vc_settings', {key: 'admin_reset_job:reset-20261128'}).value).state, 'DONE');
  await assert.rejects(run(store, 'RESET_APPLY', {input: ok}), /RESET_ALREADY_STARTED_OR_COMPLETED/, 'one-shot per run label');
});

test('R11-06 a failure after the run started leaves RECOVERY_REQUIRED (no blind retry); the job is registered', async () => {
  const h = emptySystem(), store = asyncStoreOver(h.store);
  await run(store, 'BOOTSTRAP_APPLY');
  const admin = h.store.one('vc_users', {username_normalized: 'admin'});
  const ok = {expectedUserId: admin.user_id, runLabel: 'reset-fail-1', tempPassword: STRONG2};
  h.setWriteFailure('vc_users');
  await assert.rejects(run(store, 'RESET_APPLY', {input: ok}));
  h.setWriteFailure(null);
  assert.equal(JSON.parse(h.store.one('vc_settings', {key: 'admin_reset_job:reset-fail-1'}).value).state, 'RECOVERY_REQUIRED');
  await assert.rejects(run(store, 'RESET_APPLY', {input: ok}), /RESET_ALREADY_STARTED_OR_COMPLETED/);
  assert.equal(typeof JOBS['admin-tools'], 'function');
});
