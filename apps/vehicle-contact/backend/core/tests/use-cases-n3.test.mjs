// N3: users, organizations, campaigns on the core. Behaviour: the generated legacy acceptance copies (actor-usecase-acceptance,
// actor-rbac-matrix, org-hierarchy, journal-recovery B2B-ROLE, pagination-contract, acceptance-failures). These prove the engine,
// the password port, one commit per write + audit, session revocation and the role-journal lookup fix.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAcceptanceHarness} from './support/core-harness.mjs';
import {usersCreate, usersAssignRoles, usersResetPassword} from '../src/use-cases/identity-admin.mjs';

const OPS = ['users.create', 'users.list', 'users.update', 'users.suspend', 'users.reactivate', 'users.resetPassword', 'users.assignRoles',
  'organizations.list', 'organizations.create', 'organizations.update', 'organizations.disable', 'organizations.enable',
  'campaigns.create', 'campaigns.list', 'campaigns.revoke'];
const AT = '2026-11-28T00:00:00.000Z';
const ids = () => { let n = 0; return () => String(++n).padStart(64, '0'); };

test('N3-01 the fifteen user / organization / campaign operations are answered by the core; only system.health stays legacy', () => {
  const h = createAcceptanceHarness();
  for (const op of OPS) assert.equal(h.engineFor(op), 'core', op);
  assert.equal(h.engineFor('system.health'), 'legacy');
});

test('N3-02 users.create hashes through the password port and writes user + STAFF role + audit in ONE commit', async () => {
  const commits = [], hashed = [];
  const store = {one: async () => null, writeMany: async ops => { commits.push(ops); }};
  const passwords = {hash: async pw => { hashed.push(pw.length); return 'hash:synthetic'; }};
  const r = await usersCreate({username: 'Ｎew.User', displayName: 'Synthetic\nUser', temporaryPassword: 'x'.repeat(16)}, {userId: 'u-sys'},
    {store, now: () => AT, id: ids(), passwords});
  assert.deepEqual(hashed, [16]);
  assert.equal(commits.length, 1);
  const [user, role, audit] = commits[0];
  assert.deepEqual([user.data.username_normalized, user.data.display_name, user.data.password_hash, user.data.password_change_required],
    ['new.user', 'Synthetic User', 'hash:synthetic', true]);
  assert.deepEqual([role.data.role_id, role.data.user_id], ['STAFF', r.userId]);
  assert.equal(audit.data.action, 'USER_CREATED');
});

test('N3-03 users.resetPassword: hash + audit in one commit, then every ACTIVE session of the user revoked', async () => {
  const commits = [], patches = [];
  const store = {writeMany: async ops => { commits.push(ops); },
    sequence: async fn => fn(store),
    readMany: async () => [[{session_id: 's1', status: 'ACTIVE', token_digest: 'd1'}, {session_id: 's0', status: 'REVOKED'}]],
    patch: async (t, f, fields) => { patches.push([t, f.session_id, fields.status]); return true; },
    update: async (t, f, fields) => { patches.push([t, f.session_id, fields.status]); return {}; }};
  await usersResetPassword({userId: 'u1', temporaryPassword: 'y'.repeat(16)}, {userId: 'u-sys'},
    {store, now: () => AT, id: ids(), sha256: x => x, passwords: {hash: async () => 'h'}});
  assert.deepEqual(commits[0].map(o => o.table), ['vc_users', 'vc_change_audit']);
  assert.deepEqual(patches, [['vc_sessions', 's1', 'REVOKED']]);
});

test('N3-04 users.assignRoles reads THE newest role journal (limit 1, newest-first) in the first read round', async () => {
  const rounds = [];
  const store = {readMany: async reqs => { rounds.push(reqs); return [null, [], []]; }};
  await assert.rejects(usersAssignRoles({userId: 'u1', roles: ['STAFF']}, {userId: 'u-sys'}, {store, now: () => AT, id: ids()}), /NOT_FOUND/);
  const journal = rounds[0].find(r => r.name === 'vc_operation_journal');
  assert.deepEqual([journal.kind, journal.limit, journal.filter.operation], ['newest', 1, 'users.assignRoles']);
});
