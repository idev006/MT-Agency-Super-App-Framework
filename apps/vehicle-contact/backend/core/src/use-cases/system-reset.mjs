// VC-ADR-051 N1a: the legacy reset's pure plan, digest and response rules on the core's async Firestore store.
// The host switch stays off by default. A capped Firestore list must never silently produce a partial reset plan.
import {RESET_PHRASE, RESET_TABLES, planReset, resetOptions, resetDigest, resetCounts, resetDeleteOps,
  resetPreviewResponse, resetAuditRow} from '../../../gas/src/application/use-cases/SystemResetOperations.js';

const CHUNK = 400; // Firestore accepts at most 500 writes per commit
const RESET_READ_LIMIT = 4000; // a deliberate safety ceiling below the store's 5,000-row list limit
const MAX_RESET_DELETES = 4000; // larger resets need a paged job rather than a 60-second API request

async function current(p, actor, {store, sha256, resetEnabled}) {
  if (!resetEnabled) throw new Error('OPERATION_DISABLED');
  const got = await store.readMany(RESET_TABLES.map(name => ({kind: 'list', name, limit: RESET_READ_LIMIT})));
  // Reaching our own limit could hide further rows, so refuse the whole operation.
  if (got.length !== RESET_TABLES.length || got.some(rows => !Array.isArray(rows) || rows.length >= RESET_READ_LIMIT))
    throw new Error('RESET_PLAN_TOO_LARGE');
  const rows = Object.fromEntries(RESET_TABLES.map((name, i) => [name, got[i]]));
  const opts = resetOptions(p), plan = planReset(rows, {actor, ...opts});
  if (Object.values(plan.ids).reduce((n, ids) => n + ids.length, 0) > MAX_RESET_DELETES)
    throw new Error('RESET_PLAN_TOO_LARGE');
  return {plan, opts, digest: resetDigest(plan, opts, sha256)};
}

export async function resetPreview(p, actor, ctx) {
  const {plan, opts, digest} = await current(p, actor, ctx);
  return resetPreviewResponse(plan, opts, digest);
}

async function trashDrive(media) {
  if (!media || typeof media.trashAll !== 'function') return {status: 'NOT_AVAILABLE', trashed: 0, more: false};
  try {
    const r = await media.trashAll();
    return {status: r.more ? 'PARTIAL' : 'DONE', trashed: Number(r.trashed) || 0, more: r.more === true};
  } catch { return {status: 'FAILED', trashed: 0, more: true}; }
}

export async function resetExecute(p, actor, ctx) {
  if (!ctx.resetEnabled) throw new Error('OPERATION_DISABLED');
  if (p.confirmation !== RESET_PHRASE) throw new Error('RESET_CONFIRMATION_INVALID');
  if (!actor.user || !ctx.passwords || !await ctx.passwords.verify(p.password, actor.user.password_hash))
    throw new Error('INVALID_CREDENTIALS');
  const {plan, digest} = await current(p, actor, ctx);
  if (p.planDigest !== digest) throw new Error('RESET_PLAN_STALE');
  const ops = resetDeleteOps(plan);
  for (let i = 0; i < ops.length; i += CHUNK) await ctx.store.writeMany(ops.slice(i, i + CHUNK));
  const drive = await trashDrive(ctx.media);
  await ctx.store.insert('vc_change_audit', resetAuditRow({actorId: actor.userId, deleted: ops.length, drive,
    id: ctx.id, now: ctx.now}));
  return {deleted: ops.length, deleteByTable: resetCounts(plan.ids), drive};
}
