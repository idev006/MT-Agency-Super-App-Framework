// N3 (VC-ADR-051): users, organizations and campaigns as native async use cases on the core — users.create / list / update /
// suspend / reactivate / resetPassword / assignRoles, organizations.list / create / update / disable / enable, campaigns.create /
// list / revoke. Same behaviour as the legacy IdentityOperations + AdministrationOperations (the legacy acceptance tests run
// through the core as generated copies, incl. the B2B role-assignment recovery). Passwords are hashed by the core's password
// port (the ONE hash rule, node:crypto); sessions are revoked by the shared revokeUserFlow. A write + its audit row are one
// commit. One fix: the role journal lookup takes THE newest journal row (listNewest limit 1) — the legacy `.at(-1)` on a
// 20-row newest-first window picked the oldest on Firestore.
import {paginate} from '../../../gas/src/application/pagination/Pagination.js';
import {listFilter} from '../../../gas/src/application/pagination/ListFilter.js';
import {runFlowAsync} from '../../../gas/src/application/flows/FlowRunner.js';
import {revokeUserFlow} from '../../../gas/src/application/flows/AuthFlows.js';
import {ROLE_PERMISSIONS} from '../../../gas/src/application/flows/SessionAuthorizeFlow.js';

const ROLES_OP = 'users.assignRoles';
// identity fields: no formula check (as the legacy IdentityOperations); administration fields: with it (AdministrationOperations)
const required = (value, name, max = 256) => { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('INVALID_' + name); return value.trim(); };
const requiredAdmin = (v, name, max = 200) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max || /^[=+@]/.test(v.trim())) throw new Error('INVALID_' + name);
  return v.trim();
};
const text = v => required(v, 'TEXT').replace(/[\r\n]/g, ' ');
const sortedRoles = roles => [...new Set(roles.map(String))].sort();
const sameRoles = (a, b) => JSON.stringify(sortedRoles(a)) === JSON.stringify(sortedRoles(b));
const parseJournal = row => { try { return JSON.parse(row?.detail_json || '{}'); } catch { return {}; } };
const accountAudit = ({id, now}, event, actor, target, summary = event, identity = {}) => ({op: 'insert', table: 'vc_change_audit', data: {
  audit_id: identity.auditId || id(), actor_id: actor || 'SYSTEM', entity_type: 'account', entity_id: target, action: event,
  redacted_summary: summary, correlation_id: identity.correlationId || id().slice(0, 16), created_at: now()}});
const adminAudit = ({id, now}, actor, action, entity) => ({op: 'insert', table: 'vc_change_audit', data: {audit_id: id(), actor_id: actor.userId,
  entity_type: 'administration', entity_id: entity, action, redacted_summary: action, correlation_id: id().slice(0, 16), created_at: now()}});
const revokeSessions = (userId, {store, now, id, sha256}) => runFlowAsync(revokeUserFlow(userId, {now, id, sha256}), {store});
const hashOf = async (passwords, password) => { if (!passwords) throw new Error('PASSWORDS_NOT_CONFIGURED'); return passwords.hash(password); };

// --- users
export async function usersCreate(p, actor, deps) {
  const {store, now, id, passwords} = deps;
  const username = required(p.username, 'USERNAME', 100).normalize('NFKC').toLowerCase();
  const hash = await hashOf(passwords, p.temporaryPassword), userId = id();
  if (await store.one('vc_users', {username_normalized: username})) throw new Error('DUPLICATE_USERNAME');
  await store.writeMany([
    {op: 'insert', table: 'vc_users', data: {user_id: userId, username_normalized: username, display_name: text(p.displayName),
      password_hash: hash, password_salt: '', password_change_required: true, status: 'ACTIVE', org_id: p.organizationId || '',
      created_at: now(), updated_at: now()}},
    {op: 'insert', table: 'vc_user_roles', data: {assignment_id: id(), user_id: userId, role_id: 'STAFF', status: 'ACTIVE'}},
    accountAudit(deps, 'USER_CREATED', actor.userId, userId)]);
  return {userId};
}
export async function usersList(p, _a, {store}) {
  const [roleRows, userRows, orgRows] = await store.readMany([{kind: 'list', name: 'vc_user_roles'}, {kind: 'list', name: 'vc_users'},
    {kind: 'list', name: 'vc_organizations'}]);
  const orgName = new Map((orgRows || []).map(o => [String(o.organization_id), o.name]));
  const f = listFilter(p, {status: ['ACTIVE', 'SUSPENDED'], extra: {role: ['SYSTEM_ADMIN', 'REGISTRATION_ADMIN', 'STAFF', 'OWNER', 'RETENTION_WORKER']}});
  const rolesByUser = new Map();
  for (const r of roleRows || []) {
    if (r.status !== 'ACTIVE') continue;
    const uid = String(r.user_id);
    if (!rolesByUser.has(uid)) rolesByUser.set(uid, []);
    rolesByUser.get(uid).push(String(r.role_id));
  }
  const items = (userRows || []).map(u => ({userId: u.user_id, username: u.username_normalized, displayName: u.display_name,
    organizationId: u.org_id, organizationName: u.org_id ? orgName.get(String(u.org_id)) || '' : '', status: u.status,
    roles: rolesByUser.get(String(u.user_id)) || []}))
    .filter(u => (!f.status || u.status === f.status) && (!f.role || u.roles.includes(f.role)) && f.text(u.displayName, u.username, u.organizationName));
  return paginate(items, p, {defaultLimit: 50, maxLegacyLimit: 100});
}
export async function usersUpdate(p, actor, deps) {
  const userId = required(p.userId, 'USER_ID'), patch = {updated_at: deps.now()};
  if (p.displayName !== undefined) patch.display_name = text(p.displayName);
  if (p.organizationId !== undefined) patch.org_id = required(p.organizationId, 'ORGANIZATION_ID');
  await deps.store.writeMany([{op: 'update', table: 'vc_users', key: {user_id: userId}, fields: patch}, accountAudit(deps, 'USER_UPDATED', actor.userId, userId)]);
  return {userId, updated: true};
}
export async function usersSuspend(p, actor, deps) {
  const userId = required(p.userId, 'USER_ID');
  if (userId === actor.userId) throw new Error('SELF_SUSPEND_DENIED');
  await deps.store.writeMany([{op: 'update', table: 'vc_users', key: {user_id: userId}, fields: {status: 'SUSPENDED', updated_at: deps.now()}},
    accountAudit(deps, 'USER_SUSPENDED', actor.userId, userId)]);
  await revokeSessions(userId, deps);
  return {userId, suspended: true};
}
// VC-ADR-036: SUSPENDED → ACTIVE only (sessions revoked at suspension stay revoked)
export async function usersReactivate(p, actor, deps) {
  const userId = required(p.userId, 'USER_ID');
  const user = await deps.store.one('vc_users', {user_id: userId});
  if (!user) throw new Error('NOT_FOUND');
  if (user.status !== 'SUSPENDED') throw new Error('INVALID_REQUEST_STATE');
  await deps.store.writeMany([{op: 'update', table: 'vc_users', key: {user_id: userId}, fields: {status: 'ACTIVE', updated_at: deps.now()}},
    accountAudit(deps, 'USER_REACTIVATED', actor.userId, userId)]);
  return {userId, reactivated: true};
}
export async function usersResetPassword(p, actor, deps) {
  const userId = required(p.userId, 'USER_ID'), hash = await hashOf(deps.passwords, p.temporaryPassword);
  await deps.store.writeMany([{op: 'update', table: 'vc_users', key: {user_id: userId},
    fields: {password_hash: hash, password_change_required: true, updated_at: deps.now()}}, accountAudit(deps, 'PASSWORD_RESET', actor.userId, userId)]);
  await revokeSessions(userId, deps);
  return {userId, reset: true};
}

// users.assignRoles: journaled (PREPARED → APPLIED; a partial write is compensated or left RECOVERY_REQUIRED), the restart
// converges a PREPARED / RECOVERY_REQUIRED journal, a replay of the applied roles is idempotent; then every session revoked
async function replaceRoles({store, id}, userId, roles) {
  for (const row of await store.list('vc_user_roles', {user_id: userId})) await store.remove('vc_user_roles', {assignment_id: row.assignment_id});
  for (const role of [...new Set(roles.map(String))]) await store.insert('vc_user_roles', {assignment_id: id(), user_id: userId, role_id: role, status: 'ACTIVE'});
}
async function ensureRoleAudit(deps, detail) {
  if (await deps.store.one('vc_change_audit', {audit_id: detail.auditId})) return;
  await deps.store.writeMany([accountAudit(deps, 'ROLES_CHANGED', detail.actorId, detail.userId,
    'roles:' + detail.beforeRoles.join(',') + '->' + detail.desiredRoles.join(','), {auditId: detail.auditId, correlationId: detail.correlationId})]);
}
export async function usersAssignRoles(p, actor, deps) {
  const {store, now, id} = deps;
  const userId = required(p.userId, 'USER_ID');
  if (!Array.isArray(p.roles) || !p.roles.length || p.roles.some(r => !Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, r))) throw new Error('INVALID_ROLES');
  const roles = [...new Set(p.roles)];
  if (roles.includes('RETENTION_WORKER') && roles.length > 1) throw new Error('INVALID_ROLES');
  const result = await (async () => {
    const [user, roleRows, journals] = await store.readMany([{kind: 'one', name: 'vc_users', filter: {user_id: userId}},
      {kind: 'list', name: 'vc_user_roles', filter: {user_id: userId}},
      {kind: 'newest', name: 'vc_operation_journal', filter: {operation: ROLES_OP, entity_id: userId}, limit: 1}]);
    if (!user) throw new Error('NOT_FOUND');
    const current = sortedRoles((roleRows || []).filter(r => r.status === 'ACTIVE').map(r => String(r.role_id)));
    const previous = (journals || [])[0] || null, prior = parseJournal(previous);
    const pending = previous && ['PREPARED', 'RECOVERY_REQUIRED'].includes(previous.status);
    const baseline = pending ? sortedRoles(prior.beforeRoles || []) : current;
    if (userId === actor.userId && !roles.includes('SYSTEM_ADMIN')) throw new Error('SELF_DEMOTION_DENIED');
    if (userId === actor.userId && roles.some(role => !baseline.includes(role))) throw new Error('SELF_ROLE_EXPANSION_DENIED');
    if (pending) {
      if (!sameRoles(prior.desiredRoles || [], roles)) throw new Error('OPERATION_RECOVERY_REQUIRED');
      try {
        await replaceRoles(deps, userId, roles); await ensureRoleAudit(deps, prior);
        await store.update('vc_operation_journal', {event_id: previous.event_id}, {status: 'APPLIED'});
        return {userId, roles};
      } catch {
        try { await store.update('vc_operation_journal', {event_id: previous.event_id}, {status: 'RECOVERY_REQUIRED'}); } catch { /* refusal stands */ }
        throw new Error('OPERATION_RECOVERY_REQUIRED');
      }
    }
    if (previous && previous.status === 'APPLIED' && sameRoles(prior.desiredRoles || [], roles)) {
      if (!sameRoles(current, roles)) throw new Error('OPERATION_RECOVERY_REQUIRED');
      await ensureRoleAudit(deps, prior);
      return {userId, roles};
    }
    const eventId = id(), detail = {operation: ROLES_OP, userId, actorId: actor.userId, beforeRoles: current, desiredRoles: sortedRoles(roles),
      auditId: id(), correlationId: id().slice(0, 16)};
    await store.insert('vc_operation_journal', {event_id: eventId, operation: ROLES_OP, entity_id: userId, actor_id: actor.userId,
      status: 'PREPARED', detail_json: JSON.stringify(detail), created_at: now()});
    let rolesApplied = false;
    try {
      await replaceRoles(deps, userId, roles); rolesApplied = true; await ensureRoleAudit(deps, detail);
      await store.update('vc_operation_journal', {event_id: eventId}, {status: 'APPLIED'});
      return {userId, roles};
    } catch (error) {
      if (rolesApplied) {
        try { await store.update('vc_operation_journal', {event_id: eventId}, {status: 'RECOVERY_REQUIRED',
          detail_json: JSON.stringify({...detail, recovery: {stage: 'DESIRED_ROLES_APPLIED'}})}); } catch { /* refusal stands */ }
        throw new Error('OPERATION_RECOVERY_REQUIRED');
      }
      const errors = [];
      try { await replaceRoles(deps, userId, current); } catch (e) { errors.push(String(e?.message || 'COMPENSATION_FAILED').slice(0, 64)); }
      try { await store.update('vc_operation_journal', {event_id: eventId}, {status: errors.length ? 'RECOVERY_REQUIRED' : 'ROLLED_BACK',
        detail_json: JSON.stringify({...detail, recovery: {stage: 'ROLE_REPLACEMENT', errors}})}); } catch { errors.push('JOURNAL_UPDATE_FAILED'); }
      if (errors.length) throw new Error('OPERATION_RECOVERY_REQUIRED');
      throw error;
    }
  })();
  await revokeSessions(userId, deps);
  return result;
}

// --- organizations (D2: status / type / q filters; parentName for display)
export async function organizationsList(p, _a, {store}) {
  const f = listFilter(p, {status: ['ACTIVE', 'DISABLED'], extra: {type: ['POLICE', 'EXTERNAL']}});
  const rows = await store.list('vc_organizations');
  const names = new Map(rows.map(o => [String(o.organization_id), o.name]));
  const items = rows.map(o => ({...o, parentName: o.parent_id ? names.get(String(o.parent_id)) || '' : ''}))
    .filter(o => (!f.status || o.status === f.status) && (!f.type || o.org_type === f.type) && f.text(o.name, o.parentName));
  return paginate(items, p, {defaultLimit: 100, maxLegacyLimit: 500});
}
export async function organizationsCreate(p, a, deps) {
  const {store, now} = deps;
  const orgId = deps.id(), type = requiredAdmin(p.type, 'ORG_TYPE');
  if (!['POLICE', 'EXTERNAL'].includes(type)) throw new Error('INVALID_ORG_TYPE');
  if (type === 'POLICE' && p.parentId && !(await store.one('vc_organizations', {organization_id: p.parentId}))) throw new Error('PARENT_NOT_FOUND');
  await store.writeMany([{op: 'insert', table: 'vc_organizations', data: {organization_id: orgId, name: requiredAdmin(p.name, 'ORG_NAME'), org_type: type,
    parent_id: type === 'POLICE' ? (p.parentId || '') : '', status: 'ACTIVE', created_at: now(), updated_at: now()}},
  adminAudit(deps, a, 'ORG_CREATED', orgId)]);
  return {organizationId: orgId};
}
export async function organizationsUpdate(p, a, deps) {
  const {store, now} = deps;
  const orgId = requiredAdmin(p.organizationId, 'ORG_ID'), patch = {updated_at: now()};
  if (p.name !== undefined) patch.name = requiredAdmin(p.name, 'ORG_NAME');
  if (p.parentId !== undefined) {
    if (p.parentId === orgId) throw new Error('INVALID_ORG_PARENT');
    if (p.parentId) {
      const rows = await store.list('vc_organizations'), byId = new Map(rows.map(o => [o.organization_id, o]));
      if (!byId.has(p.parentId)) throw new Error('PARENT_NOT_FOUND');
      const seen = new Set();
      for (let cursor = p.parentId; cursor && !seen.has(cursor); cursor = byId.get(cursor)?.parent_id || '') {
        if (cursor === orgId) throw new Error('INVALID_ORG_PARENT');
        seen.add(cursor);
      }
    }
    patch.parent_id = p.parentId;
  }
  await store.writeMany([{op: 'update', table: 'vc_organizations', key: {organization_id: orgId}, fields: patch}, adminAudit(deps, a, 'ORG_UPDATED', orgId)]);
  return {organizationId: orgId, updated: true};
}
export async function organizationsDisable(p, a, deps) {
  const orgId = requiredAdmin(p.organizationId, 'ORG_ID');
  await deps.store.writeMany([{op: 'update', table: 'vc_organizations', key: {organization_id: orgId}, fields: {status: 'DISABLED', updated_at: deps.now()}},
    adminAudit(deps, a, 'ORG_DISABLED', orgId)]);
  return {organizationId: orgId, disabled: true};
}
// VC-ADR-036: DISABLED → ACTIVE, audited
export async function organizationsEnable(p, a, deps) {
  const orgId = requiredAdmin(p.organizationId, 'ORG_ID');
  const org = await deps.store.one('vc_organizations', {organization_id: orgId});
  if (!org) throw new Error('NOT_FOUND');
  if (org.status !== 'DISABLED') throw new Error('INVALID_REQUEST_STATE');
  await deps.store.writeMany([{op: 'update', table: 'vc_organizations', key: {organization_id: orgId}, fields: {status: 'ACTIVE', updated_at: deps.now()}},
    adminAudit(deps, a, 'ORG_ENABLED', orgId)]);
  return {organizationId: orgId, enabled: true};
}

// --- campaigns (VC-ADR-031: a name; the code is stored so it can be copied at any time)
export async function campaignsCreate(p, a, deps) {
  const {store, now, id, sha256} = deps;
  const start = Date.parse(p.startsAt), end = Date.parse(p.endsAt), nowMs = Date.parse(now()), max = p.maxSubmissions;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end <= nowMs || !Number.isSafeInteger(max) || max < 1 || max > 100000)
    throw new Error('INVALID_CAMPAIGN');
  const name = p.name === undefined ? '' : String(p.name).trim();
  if (name.length > 120) throw new Error('INVALID_CAMPAIGN');
  const campaignId = id(), token = id();
  await store.writeMany([{op: 'insert', table: 'vc_campaigns', data: {campaign_id: campaignId, token_digest: sha256(token),
    starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(), max_submissions: max, submitted_count: 0, revoked_at: '',
    status: 'ACTIVE', created_by: a.userId, created_at: now(), campaign_name: name, campaign_token: token}},
  adminAudit(deps, a, 'CAMPAIGN_CREATED', campaignId)]);
  return {campaignId, campaignToken: token, name};
}
// D2: state = OPEN | UPCOMING | ENDED | REVOKED (server clock); CURRENT = OPEN + UPCOMING
function campaignStateOf(x, nowMs) {
  if (x.status !== 'ACTIVE' || x.revoked_at) return 'REVOKED';
  if (Date.parse(x.ends_at) <= nowMs) return 'ENDED';
  if (Date.parse(x.starts_at) > nowMs) return 'UPCOMING';
  return 'OPEN';
}
export async function campaignsList(p, _a, {store, now}) {
  const f = listFilter(p, {extra: {state: ['CURRENT', 'OPEN', 'UPCOMING', 'ENDED', 'REVOKED']}}), nowMs = Date.parse(now());
  const items = (await store.list('vc_campaigns')).map(x => ({state: campaignStateOf(x, nowMs), campaignId: x.campaign_id, startsAt: x.starts_at,
    endsAt: x.ends_at, maxSubmissions: Number(x.max_submissions), submittedCount: Number(x.submitted_count), status: x.status,
    name: x.campaign_name || '', campaignToken: x.campaign_token || '', createdAt: x.created_at || '', revokedAt: x.revoked_at || ''}))
    .filter(x => (!f.state || (f.state === 'CURRENT' ? ['OPEN', 'UPCOMING'].includes(x.state) : x.state === f.state)) && f.text(x.name))
    .reverse(); // R6: newest first
  return paginate(items, p, {defaultLimit: 50, maxLegacyLimit: 100});
}
export async function campaignsRevoke(p, a, deps) {
  const campaignId = requiredAdmin(p.campaignId, 'CAMPAIGN_ID');
  await deps.store.writeMany([{op: 'update', table: 'vc_campaigns', key: {campaign_id: campaignId}, fields: {status: 'REVOKED', revoked_at: deps.now()}},
    adminAudit(deps, a, 'CAMPAIGN_REVOKED', campaignId)]);
  return {campaignId, revoked: true};
}
