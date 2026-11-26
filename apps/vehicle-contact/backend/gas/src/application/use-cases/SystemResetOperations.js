// System reset for test / first set-up (owner 2026-11-26: "ควรมีปุ่มให้ system admin reset data ทั้งส่วนที่เป็น
// Firestore (เก็บไว้เฉพาะ master tables) และ ภาพที่เก็บบน Google drive"). VC-ADR-039.
//   system.reset.preview  — counts what would be deleted / kept (no write) + a plan digest
//   system.reset.execute  — needs the plan digest (nothing changed since the preview), the phrase RESET P6VC and the
//                           admin's password; deletes, then moves the Drive photo files to the Drive TRASH (30-day undo),
//                           then writes ONE audit row SYSTEM_RESET (who, when, how many).
// Disabled unless the host switches it on (VEHICLE_SYSTEM_RESET_ENABLED=true; Cloud Run env P6VC_SYSTEM_RESET=ENABLED):
// an invisible button is not enough. Kept: master tables, the admin who runs it (+ its organization and its session);
// by default also every user account + organization (keepUsers) so test accounts need not be recreated.
import {DATABASE_SCHEMA} from '../../domain/ports/SchemaRepository.js';

export const RESET_PHRASE = 'RESET P6VC';
export const RESET_MASTER_TABLES = Object.freeze(['vc_reference_values', 'vc_settings', 'vc_roles', 'vc_role_permissions', 'vc_migration_journal']);
const USER_TABLES = ['vc_user_roles', 'vc_user_permissions', 'vc_user_identities'];
const TABLES = Object.keys(DATABASE_SCHEMA.tables);
const pk = t => DATABASE_SCHEMA.tables[t].columns.find(c => c.key === 'primary').name;
const CHUNK = 400; // Firestore: max 500 writes per commit

// Pure: rows {table: [docs]} → ids to delete per table + kept counts + Drive file count.
export function planReset(rows, {actor, keepUsers = true, keepCampaigns = false}) {
  const R = t => rows[t] || [], ids = {}, kept = {};
  const me = String(actor.userId), myOrg = String(actor.user?.org_id || actor.user?.organization_id || ''), mySession = String(actor.sessionId || '');
  for (const t of TABLES) {
    let del;
    if (RESET_MASTER_TABLES.includes(t)) del = [];
    else if (t === 'vc_users') del = keepUsers ? [] : R(t).filter(u => String(u.user_id) !== me);
    else if (USER_TABLES.includes(t)) del = keepUsers ? [] : R(t).filter(r => String(r.user_id) !== me);
    else if (t === 'vc_organizations') del = keepUsers ? [] : R(t).filter(o => String(o.organization_id) !== myOrg);
    else if (t === 'vc_sessions') del = R(t).filter(s => String(s.session_id) !== mySession); // everyone else signs in again
    else if (t === 'vc_campaigns') del = keepCampaigns ? [] : R(t);
    else del = R(t);
    ids[t] = del.map(r => String(r[pk(t)])).sort();
    kept[t] = R(t).length - ids[t].length;
  }
  const driveFiles = new Set([...R('vc_vehicle_photos'), ...R('vc_photo_staging')].map(r => String(r.storage_ref || '')).filter(Boolean)).size;
  return {ids, kept, driveFiles};
}

export function createSystemResetOperations({store, security, drivePhotos, enabled = false}) {
  const options = p => ({keepUsers: p.keepUsers !== false, keepCampaigns: p.keepCampaigns === true});
  function readAll() {
    if (typeof store.readMany === 'function') {
      const out = store.readMany(TABLES.map(name => ({kind: 'list', name})));
      return Object.fromEntries(TABLES.map((t, i) => [t, out[i] || []]));
    }
    return Object.fromEntries(TABLES.map(t => { try { return [t, store.list(t)]; } catch { return [t, []]; } }));
  }
  function current(p, a) {
    if (!enabled) throw new Error('OPERATION_DISABLED');
    const opts = options(p), plan = planReset(readAll(), {actor: a, ...opts});
    const digest = security.sha256(JSON.stringify({ids: plan.ids, ...opts}));
    return {plan, opts, digest};
  }
  const counts = ids => Object.fromEntries(Object.entries(ids).filter(([, l]) => l.length).map(([t, l]) => [t, l.length]));
  function preview(p, a) {
    const {plan, opts, digest} = current(p, a);
    const deleteByTable = counts(plan.ids);
    return {phrase: RESET_PHRASE, planDigest: digest, options: opts, deleteByTable,
      deleteTotal: Object.values(deleteByTable).reduce((s, n) => s + n, 0),
      keptByTable: Object.fromEntries(Object.entries(plan.kept).filter(([, n]) => n)), driveFiles: plan.driveFiles,
      masterTables: RESET_MASTER_TABLES};
  }
  function trashDrive() {
    if (!drivePhotos || typeof drivePhotos.trashAll !== 'function') return {status: 'NOT_AVAILABLE', trashed: 0, more: false};
    try { const r = drivePhotos.trashAll(); return {status: r.more ? 'PARTIAL' : 'DONE', trashed: Number(r.trashed) || 0, more: r.more === true}; }
    catch { return {status: 'FAILED', trashed: 0, more: true}; }
  }
  function execute(p, a) {
    if (!enabled) throw new Error('OPERATION_DISABLED');
    if (p.confirmation !== RESET_PHRASE) throw new Error('RESET_CONFIRMATION_INVALID');
    if (!a.user || !security.verifyPassword(p.password, a.user.password_hash)) throw new Error('INVALID_CREDENTIALS');
    const {plan, digest} = current(p, a);
    if (p.planDigest !== digest) throw new Error('RESET_PLAN_STALE'); // data changed since the preview: preview again
    const ops = Object.entries(plan.ids).flatMap(([t, list]) => list.map(id => ({op: 'remove', table: t, key: {[pk(t)]: id}})));
    for (let i = 0; i < ops.length; i += CHUNK) {
      const part = ops.slice(i, i + CHUNK);
      if (typeof store.writeMany === 'function') store.writeMany(part);
      else for (const o of part) store.remove(o.table, o.key);
    }
    const drive = trashDrive();
    const deleteByTable = counts(plan.ids), deleted = ops.length;
    store.insert('vc_change_audit', {audit_id: security.secretToken(), actor_id: a.userId, entity_type: 'administration', entity_id: 'GLOBAL',
      action: 'SYSTEM_RESET', redacted_summary: `SYSTEM_RESET deleted=${deleted} driveTrashed=${drive.trashed} drive=${drive.status}`,
      correlation_id: security.secretToken().slice(0, 16), created_at: security.now()});
    return {deleted, deleteByTable, drive};
  }
  return Object.freeze({'system.reset.preview': preview, 'system.reset.execute': execute});
}
