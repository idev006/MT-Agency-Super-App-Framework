// Session check — the ONE source of the rules, used by the legacy engine (runFlowSync) and the Node core (runFlowAsync).
// Moved unchanged from SessionService.authorize (VC-ADR-046 phase 2b): token shape, revoked/inactive session, inactive
// user, access snapshot (T2-1) or live roles, absolute expiry, idle timeout, password-change gate, permission, and the
// last_seen touch at most once a minute (field-masked, TUNEUP L1). The optional 60 s snapshot cache stays as it was.
export const ROLE_PERMISSIONS = Object.freeze({
  SYSTEM_ADMIN: ['session.authenticated', 'system.settings.read', 'system.settings.manage', 'system.reset', 'users.manage', 'organizations.read', 'organizations.manage', 'campaigns.manage', 'qr.manage', 'retention.read', 'retention.delete.approve', 'audit.read', 'vehicle.list',
    // VC-ADR-036 (owner 2026-11-25): full vehicle view incl. contacts; NOT registration approval.
    'vehicle.lookup', 'vehicle.contact.read', 'vehicle.photos.read', 'vehicle.history.read'],
  REGISTRATION_ADMIN: ['session.authenticated', 'organizations.read', 'vehicle.registration.approve', 'vehicle.lookup', 'vehicle.list', 'vehicle.contact.read', 'vehicle.photos.read', 'vehicle.update', 'vehicle.history.read', 'vehicle.change.approve', 'qr.manage', 'retention.read'],
  STAFF: ['session.authenticated', 'organizations.read', 'vehicle.lookup', 'vehicle.contact.read', 'vehicle.photos.read', 'vehicle.history.read'],
  OWNER: ['session.authenticated', 'vehicle.change.submit', 'vehicle.own.read'],
  RETENTION_WORKER: ['session.authenticated', 'retention.worker']
});
export const SESSION_CACHE_SECONDS = 60, TOUCH_INTERVAL_MS = 60000;
export const sessionCacheKey = digest => 'p6vc:sess:' + digest;

export function accessFrom(roleRows, overrideRows) {
  const assignments = roleRows.filter(x => x.status === 'ACTIVE').map(x => String(x.role_id));
  const overrides = overrideRows.filter(x => x.status === 'ACTIVE').map(x => String(x.permission));
  return {roles: assignments, permissions: [...new Set([...assignments.flatMap(r => ROLE_PERMISSIONS[r] || []), ...overrides])]};
}
export function stripSecrets(user) { const out = {...user}; delete out.password_hash; delete out.password_salt; return out; }
// T2-1: the session carries its access snapshot (access_json, written at login); older sessions fall back to live rows.
function accessOf(session) {
  try {
    const a = JSON.parse(session.access_json || 'null');
    if (a && Array.isArray(a.roles) && Array.isArray(a.permissions) && a.roles.every(r => typeof r === 'string') && a.permissions.every(p => typeof p === 'string'))
      return {roles: a.roles, permissions: a.permissions};
  } catch { /* fall back to live rows */ }
  return null;
}
const parse = raw => { try { return JSON.parse(raw || 'null'); } catch { return null; } };

// input: {token, permission, allowPasswordChange, fresh}; deps: {sha256(text) → hex, now() → ISO}
export function* sessionAuthorizeFlow({token, permission, allowPasswordChange = false, fresh = false}, {sha256, now}) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) throw new Error('UNAUTHENTICATED');
  const digest = sha256(token.toLowerCase()), key = sessionCacheKey(digest);
  // fresh: ops that need the stored password hash always read the live rows and never receive a cached user
  let snap = fresh ? null : parse(yield {cacheGet: key}), liveUser = null;
  if (!snap) {
    const [session] = yield {reads: [{kind: 'one', name: 'vc_sessions', filter: {token_digest: digest}}]};
    if (!session || session.status !== 'ACTIVE' || session.revoked_at) throw new Error('UNAUTHENTICATED');
    const snapshot = accessOf(session);
    let user, access;
    if (snapshot) {
      [user] = yield {reads: [{kind: 'one', name: 'vc_users', filter: {user_id: session.user_id}}]};
      access = snapshot;
    } else {
      // TUNEUP L2: user + roles + overrides in one parallel round
      const [u, roleRows, overrideRows] = yield {reads: [
        {kind: 'one', name: 'vc_users', filter: {user_id: session.user_id}},
        {kind: 'list', name: 'vc_user_roles', filter: {user_id: session.user_id}},
        {kind: 'list', name: 'vc_user_permissions', filter: {user_id: session.user_id}}]};
      user = u; access = u && accessFrom(roleRows, overrideRows);
    }
    if (!user || user.status !== 'ACTIVE') throw new Error('UNAUTHENTICATED');
    liveUser = user;
    snap = {session, user: stripSecrets(user), access};
    yield {cachePut: {key, value: JSON.stringify(snap), seconds: SESSION_CACHE_SECONDS}};
  }
  const {session, user, access} = snap;
  const t = Date.parse(now()), issued = Date.parse(session.issued_at);
  if (!Number.isFinite(issued) || issued > t || t >= Date.parse(session.expires_at)) throw new Error('SESSION_EXPIRED');
  const idle = Number(session.idle_timeout_minutes);
  if (!Number.isSafeInteger(idle) || idle < 1 || idle > 480) throw new Error('INVALID_SESSION_POLICY');
  if (t - Date.parse(session.last_seen_at) >= idle * 60000) throw new Error('SESSION_IDLE_EXPIRED');
  if ((user.password_change_required === true || String(user.password_change_required) === 'true') && !allowPasswordChange)
    throw new Error('PASSWORD_CHANGE_REQUIRED');
  if (!access.permissions.includes(permission)) throw new Error('FORBIDDEN');
  if (t - Date.parse(session.last_seen_at) >= TOUCH_INTERVAL_MS) {
    const at = now();
    yield {patch: {table: 'vc_sessions', filter: {session_id: session.session_id}, fields: {last_seen_at: at}}};
    session.last_seen_at = at;
    yield {cachePut: {key, value: JSON.stringify(snap), seconds: SESSION_CACHE_SECONDS}};
  }
  return {userId: user.user_id, user: liveUser || user, roles: access.roles, permissions: access.permissions,
    sessionId: session.session_id, session, sessionDigest: digest};
}
