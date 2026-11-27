// system.config.get / system.config.update on the core (VC-ADR-051 N1a PR 2). The settings registry and its four entries
// (numeric settings, person types / sticker colours, log policy, photo policy) are the legacy engine's own code
// (application/settings/SettingsRegistry.js) — not copied. They run against an in-memory snapshot of the vc_settings rows,
// read in ONE parallel round together with the log-row COUNTs:
//   get     round 1: vc_settings + the COUNT per log kind → the registry's view
//   update  round 1 → the registry checks every key (any bad key → nothing saved) and plans the rows + one audit row per
//           entry; the planned writes go out in ONE batch (all or nothing); this instance's log-policy memo is refreshed;
//           the answer is a fresh get (round 2)
// Unlike the legacy view, log_policy is read from the row itself, not from the one-minute memo (never older).
import {createSettingsOperations, numericSettings, photoPolicySettings} from '../../../gas/src/application/settings/SettingsRegistry.js';
import {stickerSettings} from '../../../gas/src/application/use-cases/StickerCategoryOperations.js';
import {logPolicySettings} from '../../../gas/src/application/use-cases/LogPolicyOperations.js';
import {LOG_SETTING_KEY, readLogPolicy} from '../../../gas/src/domain/policies/LogPolicy.js';

const SETTINGS = 'vc_settings';
const WRITABLE = new Set([SETTINGS, 'vc_change_audit']);

// a synchronous store over the rows read: reads see the planned writes; every write is recorded for one batch
export function settingsSnapshot(rows) {
  const data = rows.map(r => ({...r}));
  const ops = [];
  const check = t => { if (!WRITABLE.has(t)) throw new Error('SETTINGS_SNAPSHOT_TABLE:' + t); };
  const find = key => data.find(r => r.key === key) || null;
  const self = {
    one(t, f) { if (t !== SETTINGS) throw new Error('SETTINGS_SNAPSHOT_TABLE:' + t); const r = find(f && f.key); return r ? {...r} : null; },
    list(t) { if (t !== SETTINGS) throw new Error('SETTINGS_SNAPSHOT_TABLE:' + t); return data.map(r => ({...r})); },
    insert(t, row) { check(t); if (t === SETTINGS) data.push({...row}); ops.push({op: 'insert', table: t, data: {...row}}); return {...row}; },
    update(t, key, fields) {
      check(t);
      const r = t === SETTINGS ? find(key && key.key) : null;
      if (t === SETTINGS && !r) throw new Error('NOT_FOUND');
      if (r) Object.assign(r, fields);
      ops.push({op: 'update', table: t, key: {...key}, fields: {...fields}}); return 1;
    },
    sequence: fn => fn(self),
    ops: () => ops.slice()
  };
  return self;
}

async function readRound(store, logs) {
  const countReqs = logs.countRequests();
  const [rows, ...counted] = await store.readMany([{kind: 'list', name: SETTINGS, filter: {}}, ...countReqs]).catch(async () =>
    // a COUNT the store cannot answer → counts unknown (null), as the legacy view; the settings must still be read
    [await store.list(SETTINGS, {}), ...countReqs.map(() => NaN)]);
  const counts = counted.some(n => !Number.isFinite(Number(n))) ? null : logs.countsFrom(counted);
  return {rows: rows || [], counts};
}

function registryOver(snapshot, counts, {now, id, refreshLogPolicy}) {
  const policy = () => { const row = snapshot.one(SETTINGS, {key: LOG_SETTING_KEY}); return readLogPolicy(row && row.value); };
  return createSettingsOperations({store: snapshot, security: {now, secretToken: id}, entries: [numericSettings(), stickerSettings(),
    logPolicySettings({policy, manager: {counts: () => counts}, memo: {clear: () => refreshLogPolicy && refreshLogPolicy()}}), photoPolicySettings()]});
}

export async function configGet(_p, _principal, ctx) {
  const {rows, counts} = await readRound(ctx.store, ctx.logs);
  return registryOver(settingsSnapshot(rows), counts, ctx)['system.config.get']();
}

export async function configUpdate(p, principal, ctx) {
  const {rows, counts} = await readRound(ctx.store, ctx.logs);
  const snapshot = settingsSnapshot(rows);
  // the registry validates, plans and "writes" into the snapshot; the memo is refreshed only after the real commit
  registryOver(snapshot, counts, {...ctx, refreshLogPolicy: null})['system.config.update'](p, principal);
  const ops = snapshot.ops();
  if (ops.length) await ctx.store.writeMany(ops);
  if (ctx.refreshLogPolicy) ctx.refreshLogPolicy(); // this instance writes logs by the new policy from the next request
  return configGet(p, principal, ctx);
}
