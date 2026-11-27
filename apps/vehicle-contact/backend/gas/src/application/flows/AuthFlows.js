// auth.* + session issue / revoke / end — ONE source for both engines (VC-ADR-046 phase 3 wave 1). Rules moved unchanged from
// IdentityOperations.js (login, googleLogin, changePassword, logout, session, linkGoogle) and SessionService.js (issue,
// revokeUser, endSession): rate limit (6 failures / 15 min per username digest), constant work for unknown users (dummy hash),
// security event rows, 8 h absolute + configured idle timeout, access snapshot in the session, revocation on password
// change, cache snapshots dropped on revoke. Ids are taken in the legacy order (event, token, session) so both engines write
// the same rows. Round trips: login = 3 rounds + one hash (legacy: 7 + one hash).
// deps: {now() → ISO, id() → 64 hex, sha256(text) → hex}. Effects: reads, insert, patch, transaction, cacheRemove,
// hashPassword, verifyPassword, verifyGoogle.
import {accessFrom, sessionCacheKey} from './SessionAuthorizeFlow.js';
export const LOGIN_FAILURE_LIMIT = 6, LOGIN_WINDOW_MS = 15 * 60000, SESSION_HOURS = 8;
const SECURITY_EVENT_SCAN = 5000; // = the store's MAX_LIMIT (legacy listNewest default)
const required = (value, name, max = 256) => { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('INVALID_' + name); return value.trim(); };
const mustChange = user => user.password_change_required === true || String(user.password_change_required) === 'true';
const auditRow = (event, actor, target, deps) => ({audit_id: deps.id(), actor_id: actor || 'SYSTEM', entity_type: 'account', entity_id: target,
  action: event, redacted_summary: event, correlation_id: deps.id().slice(0, 16), created_at: deps.now()});

// a session for an ACTIVE user (idle policy read by the caller in an earlier round); access = {roles, permissions}
function* issueSession(user, idlePolicy, access, deps) {
  const idle = Number(idlePolicy && idlePolicy.value);
  if (!Number.isSafeInteger(idle) || idle < 1 || idle > 480) throw new Error('IDLE_POLICY_NOT_CONFIGURED');
  const token = deps.id(), date = deps.now(), expires = new Date(Date.parse(date) + SESSION_HOURS * 60 * 60000).toISOString();
  yield {insert: {table: 'vc_sessions', row: {session_id: deps.id(), user_id: user.user_id, token_digest: deps.sha256(token), status: 'ACTIVE',
    issued_at: date, expires_at: expires, last_seen_at: date, idle_timeout_minutes: idle, revoked_at: '',
    access_json: JSON.stringify({roles: access.roles, permissions: access.permissions})}}};
  return {sessionToken: token, expiresAt: expires, mustChangePassword: mustChange(user)};
}
// issue a session for a user (the caller decides the user may log in): reads its idle policy + access, then issues
export function* issueSessionFlow(user, deps) {
  const [policy, roles, overrides] = yield {reads: [{kind: 'one', name: 'vc_settings', filter: {key: 'idle_timeout_minutes'}},
    {kind: 'list', name: 'vc_user_roles', filter: {user_id: user.user_id}}, {kind: 'list', name: 'vc_user_permissions', filter: {user_id: user.user_id}}]};
  return yield* issueSession(user, policy, accessFrom(roles, overrides), deps);
}
// revoke every ACTIVE session of a user in one transaction; drop their cached snapshots; → number of session rows
export function* revokeUserFlow(userId, deps) {
  const rows = yield {transaction: () => (function* () {
    const [all] = yield {reads: [{kind: 'list', name: 'vc_sessions', filter: {user_id: userId}}]};
    for (const s of all) if (s.status === 'ACTIVE')
      yield {patch: {table: 'vc_sessions', filter: {session_id: s.session_id}, fields: {status: 'REVOKED', revoked_at: deps.now()}}};
    return all;
  })()};
  yield {cacheRemove: rows.map(r => r.token_digest).filter(Boolean).map(sessionCacheKey)};
  return rows.length;
}
export function* endSessionFlow(actor, deps) {
  yield {transaction: () => (function* () {
    yield {patch: {table: 'vc_sessions', filter: {session_id: actor.sessionId}, fields: {status: 'REVOKED', revoked_at: deps.now()}}};
  })()};
  yield {cacheRemove: [actor.sessionDigest].filter(Boolean).map(sessionCacheKey)};
}

export function* loginFlow(p, deps) {
  const username = required(p.username, 'USERNAME', 100).normalize('NFKC').toLowerCase();
  const digest = deps.sha256('username:' + username), since = Date.parse(deps.now()) - LOGIN_WINDOW_MS;
  const [events, user, policy] = yield {reads: [{kind: 'newest', name: 'vc_security_events', filter: {username_digest: digest}, limit: SECURITY_EVENT_SCAN},
    {kind: 'one', name: 'vc_users', filter: {username_normalized: username}}, {kind: 'one', name: 'vc_settings', filter: {key: 'idle_timeout_minutes'}}]};
  if (events.filter(x => Date.parse(x.created_at) > since && x.status === 'FAILED').length >= LOGIN_FAILURE_LIMIT) throw new Error('LOGIN_RATE_LIMIT');
  // never reveal whether the username exists (message AND timing): verify unconditionally — stored null = the hasher's dummy
  // check, the cost of a new hash on this engine (application/security/PasswordHash.js)
  const active = !!user && user.status === 'ACTIVE';
  const verified = yield {verifyPassword: {password: p.password, stored: active ? user.password_hash : null}};
  const event = status => ({event_id: deps.id(), username_digest: digest, status, created_at: deps.now()});
  if (!active || !verified) { yield {insert: {table: 'vc_security_events', row: event('FAILED')}}; throw new Error('INVALID_CREDENTIALS'); }
  // owner 2026-11-27 "Pepper + fewer rounds": a hash in the old format / cost is rewritten now that the password is known
  if (yield {passwordNeedsRehash: user.password_hash}) {
    const upgraded = yield {hashPassword: p.password};
    yield {patch: {table: 'vc_users', filter: {user_id: user.user_id}, fields: {password_hash: upgraded}}};
  }
  const success = event('SUCCESS');
  const idle = Number(policy && policy.value);
  if (!Number.isSafeInteger(idle) || idle < 1 || idle > 480) { // as the legacy: the success is recorded, then the policy fails
    yield {insert: {table: 'vc_security_events', row: success}}; throw new Error('IDLE_POLICY_NOT_CONFIGURED');
  }
  const [roles, overrides] = yield {reads: [{kind: 'list', name: 'vc_user_roles', filter: {user_id: user.user_id}},
    {kind: 'list', name: 'vc_user_permissions', filter: {user_id: user.user_id}}], inserts: [['vc_security_events', success]]};
  return yield* issueSession(user, policy, accessFrom(roles, overrides), deps);
}

export function* googleLoginFlow(p, deps) {
  const claim = yield {verifyGoogle: p.idToken};
  const [identity] = yield {reads: [{kind: 'one', name: 'vc_user_identities', filter: {provider: 'GOOGLE', provider_sub: claim.sub}}]};
  const [user] = identity ? yield {reads: [{kind: 'one', name: 'vc_users', filter: {user_id: identity.user_id}}]} : [null];
  if (!user || user.status !== 'ACTIVE') throw new Error('INVALID_CREDENTIALS');
  return yield* issueSessionFlow(user, deps);
}

export function* changePasswordFlow(p, actor, deps) {
  if (!(yield {verifyPassword: {password: p.oldPassword, stored: actor.user.password_hash}})) throw new Error('INVALID_CREDENTIALS');
  const hash = yield {hashPassword: p.newPassword};
  yield {transaction: () => (function* () {
    yield {patch: {table: 'vc_users', filter: {user_id: actor.userId}, fields: {password_hash: hash, password_change_required: false, updated_at: deps.now()}}};
    yield {insert: {table: 'vc_change_audit', row: auditRow('PASSWORD_CHANGED', actor.userId, actor.userId, deps)}};
  })()};
  yield* revokeUserFlow(actor.userId, deps);
  return {changed: true, reauthenticate: true};
}

export function* logoutFlow(p, actor, deps) {
  yield* endSessionFlow(actor, deps);
  return {revoked: true};
}

export function* sessionInfoFlow(p, actor) {
  return {userId: actor.userId, displayName: actor.user.display_name || '', organizationId: actor.user.org_id || null, roles: actor.roles,
    permissions: actor.permissions, expiresAt: actor.session.expires_at, mustChangePassword: mustChange(actor.user)};
}

export function* linkGoogleFlow(p, actor, deps) {
  if (!(yield {verifyPassword: {password: p.password, stored: actor.user.password_hash}})) throw new Error('INVALID_CREDENTIALS');
  const claim = yield {verifyGoogle: p.idToken};
  const [linked] = yield {reads: [{kind: 'one', name: 'vc_user_identities', filter: {provider: 'GOOGLE', provider_sub: claim.sub}}]};
  if (linked) throw new Error('IDENTITY_ALREADY_LINKED');
  yield {insert: {table: 'vc_user_identities', row: {identity_id: deps.id(), user_id: actor.userId, provider: 'GOOGLE', provider_sub: claim.sub, linked_at: deps.now()}}};
  yield {insert: {table: 'vc_change_audit', row: auditRow('GOOGLE_LINKED', actor.userId, actor.userId, deps)}};
  return {linked: true};
}
