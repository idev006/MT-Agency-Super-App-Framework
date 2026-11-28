// R11 (VC-ADR-057, owner approved the brief 2026-11-28: "Approve R11"): the two account tools leave the GAS editor and run as
// a manual Cloud Run Job of the core — so GAS can become the photo bridge only (G1). Same gates as the GAS tools
// (infrastructure/bootstrap/BootstrapAdmin.js, infrastructure/security/AdminPasswordReset.js), plus:
//   - the typed approval comes from the workflow (BOOTSTRAP_ADMIN_ONCE / RESET_ADMIN_ONCE), never from stored config;
//   - the temporary password comes from a Secret Manager secret the OWNER creates and deletes (mounted by name; never read,
//     printed or logged here — only its policy is checked);
//   - hashes use the ONE hash rule with the pepper (refused without it: a new admin hash is always peppered);
//   - the reset's one-shot state lives in Firestore (vc_settings key per run label), so a repeat of the same approved run is
//     refused and a failed run needs a human (RECOVERY_REQUIRED), never a blind retry.
// Modes: BOOTSTRAP_PREVIEW / BOOTSTRAP_APPLY / RESET_PREVIEW / RESET_APPLY. PREVIEW never writes. The report holds counters and
// states only — no password, hash, token or user id.
const CHUNK = 400;
export const ADMIN_TOOL_MODES = Object.freeze(['BOOTSTRAP_PREVIEW', 'BOOTSTRAP_APPLY', 'RESET_PREVIEW', 'RESET_APPLY']);
export const APPROVALS = Object.freeze({BOOTSTRAP_APPLY: 'BOOTSTRAP_ADMIN_ONCE', RESET_APPLY: 'RESET_ADMIN_ONCE'});
const fail = code => { throw new Error(code); };
const stateKey = label => 'admin_reset_job:' + label;

// the strong policy of the GAS reset tool, now for both tools
export function passwordPolicyOk(p) {
  return typeof p === 'string' && p.length >= 16 && p.length <= 128 && p === p.trim() && !/[\r\n]/.test(p)
    && /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p);
}

// APPLY always needs a password that passes the policy. A PREVIEW writes nothing, so it may run before the owner has
// created the secret (passwordChecked: false); a password that IS given to a preview is checked (passwordChecked: true).
function passwordGate(password, apply, code) {
  if (!apply && !password) return false;
  if (!passwordPolicyOk(password)) fail(code);
  return true;
}

async function bootstrap({store, apply, input, passwords, pepperConfigured, now, id}) {
  const username = String(input.username || '');
  const idle = Number(input.idleMinutes || 30);
  if (!/^[a-z0-9._-]{3,80}$/.test(username) || !Number.isSafeInteger(idle) || idle < 1 || idle > 480) fail('INVALID_BOOTSTRAP_CONFIGURATION');
  if ((await store.list('vc_users', {}, 2)).length) fail('BOOTSTRAP_ALREADY_COMPLETED'); // one-shot: only an empty system
  const passwordChecked = passwordGate(input.tempPassword, apply, 'BOOTSTRAP_TEMP_PASSWORD_POLICY_FAILED');
  if (!pepperConfigured) fail('ADMIN_TOOL_PEPPER_MISSING');
  if (!apply) return {status: 'PASS', result: 'READY_FOR_BOOTSTRAP', usersExisting: 0, passwordChecked, dataModified: false};
  const hash = await passwords.hash(input.tempPassword);
  if (!(await passwords.verify(input.tempPassword, hash))) fail('BOOTSTRAP_HASH_SELF_CHECK_FAILED');
  const userId = id(), at = now();
  const writes = [
    {op: 'insert', table: 'vc_users', data: {user_id: userId, username_normalized: username, display_name: 'Initial System Admin',
      password_hash: hash, password_salt: '', password_change_required: true, status: 'ACTIVE', org_id: '', created_at: at, updated_at: at}},
    {op: 'insert', table: 'vc_user_roles', data: {assignment_id: id(), user_id: userId, role_id: 'SYSTEM_ADMIN', status: 'ACTIVE'}},
    {op: 'insert', table: 'vc_change_audit', data: {audit_id: id(), actor_id: 'SYSTEM', entity_type: 'account', entity_id: userId,
      action: 'JOB_ADMIN_BOOTSTRAP', redacted_summary: 'ADMIN_BOOTSTRAP', correlation_id: id().slice(0, 16), created_at: at}}
  ];
  if (!(await store.one('vc_settings', {key: 'idle_timeout_minutes'})))
    writes.push({op: 'insert', table: 'vc_settings', data: {key: 'idle_timeout_minutes', value: String(idle), updated_by: userId, updated_at: at}});
  await store.writeMany(writes); // ONE all-or-nothing commit: the admin never exists without its role
  const back = await store.one('vc_users', {user_id: userId});
  if (!back || back.password_hash !== hash || back.password_change_required !== true) fail('BOOTSTRAP_WRITE_VERIFICATION_FAILED');
  return {status: 'PASS', result: 'CREATED', mustChangePassword: true, auditRecorded: true, dataModified: true};
}

async function resetTarget(store, input) {
  const expected = String(input.expectedUserId || ''), username = String(input.username || 'admin');
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(expected) || !/^[a-z0-9._-]{3,80}$/.test(username)) fail('RESET_TARGET_NOT_CONFIRMED');
  const user = await store.one('vc_users', {username_normalized: username});
  if (!user || user.user_id !== expected || user.status !== 'ACTIVE') fail('RESET_ADMIN_IDENTITY_MISMATCH');
  const [roles, sessions] = await store.readMany([{kind: 'list', name: 'vc_user_roles', filter: {user_id: user.user_id}},
    {kind: 'list', name: 'vc_sessions', filter: {user_id: user.user_id}, limit: 5000}]);
  if (!(roles || []).some(r => r.role_id === 'SYSTEM_ADMIN' && r.status === 'ACTIVE')) fail('RESET_ADMIN_ROLE_MISMATCH');
  if ((sessions || []).length >= 5000) fail('RESET_SESSIONS_EXCEED_SCAN_LIMIT');
  return {user, active: (sessions || []).filter(s => s.status === 'ACTIVE' && !s.revoked_at)};
}

async function reset({store, apply, input, passwords, pepperConfigured, now, id}) {
  const label = String(input.runLabel || '');
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(label)) fail('RESET_RUN_LABEL_INVALID');
  if (await store.one('vc_settings', {key: stateKey(label)})) fail('RESET_ALREADY_STARTED_OR_COMPLETED');
  await resetTarget(store, input);
  const passwordChecked = passwordGate(input.tempPassword, apply, 'RESET_NEW_PASSWORD_POLICY_FAILED');
  if (!pepperConfigured) fail('ADMIN_TOOL_PEPPER_MISSING');
  if (!apply) {
    const {active} = await resetTarget(store, input);
    return {status: 'PASS', result: 'READY_FOR_RESET', sessionsToRevoke: active.length, passwordChecked, dataModified: false};
  }
  const hash = await passwords.hash(input.tempPassword);
  if (!(await passwords.verify(input.tempPassword, hash))) fail('RESET_HASH_SELF_CHECK_FAILED');
  const {user, active} = await resetTarget(store, input); // again, right before writing
  const at = now(), writeState = async (state, insert) => store.writeMany([insert
    ? {op: 'insert', table: 'vc_settings', data: {key: stateKey(label), value: JSON.stringify({state, at}), updated_by: 'SYSTEM', updated_at: at}}
    : {op: 'update', table: 'vc_settings', key: {key: stateKey(label)}, fields: {value: JSON.stringify({state, at: now()}), updated_at: now()}}]);
  await writeState('IN_PROGRESS', true); // claims the run label (a second run with it is refused)
  try {
    // sessions revoked FIRST: a later failure cannot leave a session alive against a changed password
    for (let i = 0; i < active.length; i += CHUNK)
      await store.writeMany(active.slice(i, i + CHUNK).map(s => ({op: 'update', table: 'vc_sessions', key: {session_id: s.session_id},
        fields: {status: 'REVOKED', revoked_at: at}})));
    // password + forced change + audit in ONE all-or-nothing commit
    await store.writeMany([
      {op: 'update', table: 'vc_users', key: {user_id: user.user_id}, fields: {password_hash: hash, password_salt: '', password_change_required: true, updated_at: at}},
      {op: 'insert', table: 'vc_change_audit', data: {audit_id: id(), actor_id: 'SYSTEM', entity_type: 'account', entity_id: user.user_id,
        action: 'JOB_ADMIN_PASSWORD_RESET', redacted_summary: 'ADMIN_PASSWORD_RESET', correlation_id: id().slice(0, 16), created_at: at}}]);
    const back = await store.one('vc_users', {user_id: user.user_id});
    if (!back || back.password_hash !== hash || back.password_change_required !== true) fail('RESET_WRITE_VERIFICATION_FAILED');
    await writeState('DONE', false);
    return {status: 'PASS', result: 'DONE', sessionsRevoked: active.length, mustChangePassword: true, auditRecorded: true, dataModified: true};
  } catch (e) {
    await writeState('RECOVERY_REQUIRED', false).catch(() => {}); // never a blind retry after a possibly partial change
    throw e;
  }
}

export async function runAdminTool({store, mode, approval = '', input = {}, passwords, pepperConfigured = false,
  now = () => new Date().toISOString(), id}) {
  if (!store || !passwords || typeof id !== 'function') fail('ADMIN_TOOL_NOT_CONFIGURED');
  if (!ADMIN_TOOL_MODES.includes(mode)) fail('ADMIN_TOOL_MODE_INVALID');
  const apply = mode.endsWith('_APPLY');
  if (apply && approval !== APPROVALS[mode]) fail('ADMIN_TOOL_APPROVAL_REQUIRED');
  const ctx = {store, apply, input, passwords, pepperConfigured, now, id};
  const report = mode.startsWith('BOOTSTRAP') ? await bootstrap(ctx) : await reset(ctx);
  return {mode, ...report, credentialsExposed: false};
}
