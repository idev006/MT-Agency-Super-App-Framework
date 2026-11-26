// Log policy (VC-ADR-040): a system admin turns each kind of log on/off and sets how long it is kept.
//   withLogPolicyStore  — wraps the store the operations write through: a row of a switched-off kind is not written;
//                         a kept row gets expire_at (Firestore TTL deletes it then). One place, so no use case changes.
//   logPolicySettings   — the settings-registry entry: system.config.get shows log_policy (+ row counts), update saves it.
// The policy is read at most once a minute per server process (memo) and only when a log row is about to be written.
import {LOG_EXPIRE_FIELD, LOG_SETTING_KEY, LOG_TABLES, LOG_CATEGORIES, defaultLogPolicy, loadLogPolicy, logCountSpecs, logDecision,
  logPolicyList, parseLogPolicy} from '../../domain/policies/LogPolicy.js';

export function createLogPolicyReader(store, memo = null) {
  return function policy() {
    const cached = memo ? memo.get() : undefined;
    if (cached) return cached;
    let value;
    try { value = loadLogPolicy(store); } catch { value = defaultLogPolicy(); }
    if (memo) memo.put(value);
    return value;
  };
}

export function withLogPolicyStore(store, {policy, now}) {
  const ttl = store.supportsTtl === true;
  // null = do not write; otherwise the row (with expire_at when the store keeps a TTL)
  const decide = (table, data) => {
    if (!LOG_TABLES.includes(table)) return data;
    const d = logDecision(policy(), table, data, now());
    if (!d.write) return null;
    return ttl && d.expireAt ? {...data, [LOG_EXPIRE_FIELD]: d.expireAt} : data;
  };
  const wrap = s => {
    const out = {...s};
    out.insert = (table, data) => { const row = decide(table, data); return row === null ? {...data} : s.insert(table, row); };
    if (typeof s.writeMany === 'function') out.writeMany = ops => {
      const kept = [];
      for (const o of ops) {
        if (o.op !== 'insert') { kept.push(o); continue; }
        const row = decide(o.table, o.data);
        if (row !== null) kept.push({...o, data: row});
      }
      return kept.length ? s.writeMany(kept) : undefined;
    };
    if (typeof s.readMany === 'function') out.readMany = (reqs, opts = {}) => {
      if (!Array.isArray(opts.inserts) || !opts.inserts.length) return s.readMany(reqs, opts);
      const inserts = [];
      for (const [table, data] of opts.inserts) { const row = decide(table, data); if (row !== null) inserts.push([table, row]); }
      return s.readMany(reqs, {...opts, inserts});
    };
    if (typeof s.sequence === 'function') out.sequence = fn => s.sequence(tx => fn(tx && typeof tx === 'object' ? wrap(tx) : tx));
    return Object.freeze(out);
  };
  return wrap(store);
}

// Row counts per kind (COUNT aggregation: ~1 read per 1,000 rows, never the rows). null when the store cannot count.
function logCounts(store) {
  const plan = LOG_CATEGORIES.flatMap(c => logCountSpecs(c.code).map(s => ({code: c.code, ...s})));
  try {
    const reqs = plan.map(s => ({kind: 'count', name: s.table, filter: s.filter}));
    const all = typeof store.readMany === 'function' ? store.readMany(reqs)
      : reqs.map(r => typeof store.count === 'function' ? store.count(r.name, r.filter) : store.list(r.name, r.filter).length);
    const out = Object.fromEntries(LOG_CATEGORIES.map(c => [c.code, 0]));
    plan.forEach((s, i) => { out[s.code] += s.sign * Number(all[i]); });
    return Object.fromEntries(Object.entries(out).map(([k, n]) => [k, Number.isFinite(n) ? Math.max(0, n) : null]));
  } catch { return null; }
}

const summary = (before, after) => LOG_CATEGORIES.map(c => {
  const b = before[c.code], a = after[c.code], parts = [];
  if (b.enabled !== a.enabled) parts.push(a.enabled ? 'ON' : 'OFF');
  if (b.days !== a.days) parts.push(`${b.days}->${a.days}d`);
  return parts.length ? `${c.code} ${parts.join(' ')}` : '';
}).filter(Boolean).join('; ') || 'NO_CHANGE';

// Settings-registry entry (system.config.get/update): the policy (+ row counts); a change is audited before→after.
export const logPolicySettings = ({policy, memo = null}) => ({
  keys: [LOG_SETTING_KEY],
  view: store => ({[LOG_SETTING_KEY]: logPolicyList(policy()), log_counts: logCounts(store)}),
  prepare(values, store) {
    const next = parseLogPolicy(values[LOG_SETTING_KEY]), before = loadLogPolicy(store);
    return {rows: [[LOG_SETTING_KEY, JSON.stringify(LOG_CATEGORIES.map(c => ({code: c.code, ...next[c.code]})))]],
      audit: {action: 'LOG_POLICY_UPDATED', summary: 'LOG_POLICY_UPDATED ' + summary(before, next)}};
  },
  afterSave() { if (memo) memo.clear(); } // this process sees the new policy now; others within a minute
});
