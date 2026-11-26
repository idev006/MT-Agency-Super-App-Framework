// Log policy (VC-ADR-040): a system admin turns each kind of log on/off and sets how long it is kept.
//   withLogPolicyStore  — wraps the store the operations write through: a row of a switched-off kind is not written;
//                         a kept row gets expire_at (Firestore TTL deletes it then). One place, so no use case changes.
//   withLogPolicy       — system.config.get adds log_policy (+ row counts); system.config.update saves it (no new API op).
// The policy is read at most once a minute per server process (memo) and only when a log row is about to be written.
import {LOG_EXPIRE_FIELD, LOG_SETTING_KEY, LOG_TABLES, LOG_CATEGORIES, defaultLogPolicy, loadLogPolicy, logDecision,
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
  const reqs = LOG_CATEGORIES.map(c => ({kind: 'count', name: c.table, filter: c.sources ? {lookup_source: c.sources[0]} : {}}));
  const extra = LOG_CATEGORIES.flatMap((c, i) => (c.sources || []).slice(1).map(src => [i, {kind: 'count', name: c.table, filter: {lookup_source: src}}]));
  try {
    const all = typeof store.readMany === 'function' ? store.readMany([...reqs, ...extra.map(([, r]) => r)])
      : [...reqs, ...extra.map(([, r]) => r)].map(r => typeof store.count === 'function' ? store.count(r.name, r.filter) : store.list(r.name, r.filter).length);
    const n = all.slice(0, reqs.length).map(Number);
    extra.forEach(([i], k) => { n[i] += Number(all[reqs.length + k]) || 0; });
    return Object.fromEntries(LOG_CATEGORIES.map((c, i) => [c.code, Number.isFinite(n[i]) ? n[i] : null]));
  } catch { return null; }
}

const summary = (before, after) => LOG_CATEGORIES.map(c => {
  const b = before[c.code], a = after[c.code], parts = [];
  if (b.enabled !== a.enabled) parts.push(a.enabled ? 'ON' : 'OFF');
  if (b.days !== a.days) parts.push(`${b.days}->${a.days}d`);
  return parts.length ? `${c.code} ${parts.join(' ')}` : '';
}).filter(Boolean).join('; ') || 'NO_CHANGE';

export function withLogPolicy(handlers, {store, security, policy, memo = null}) {
  const h = {...handlers};
  const getInner = h['system.config.get'], updateInner = h['system.config.update'];
  const view = () => ({[LOG_SETTING_KEY]: logPolicyList(policy()), log_counts: logCounts(store)});
  h['system.config.get'] = (p, a) => ({...getInner(p || {}, a), ...view()});
  h['system.config.update'] = (p, a) => {
    p = p || {};
    const values = p.values && typeof p.values === 'object' && !Array.isArray(p.values) ? p.values : null;
    if (!values || !Object.prototype.hasOwnProperty.call(values, LOG_SETTING_KEY)) return {...updateInner(p, a), ...view()};
    const next = parseLogPolicy(values[LOG_SETTING_KEY]);
    const rest = {...values}; delete rest[LOG_SETTING_KEY];
    if (Object.keys(rest).length) updateInner({...p, values: rest}, a); // the other settings first (they validate and may refuse)
    const before = loadLogPolicy(store), at = security.now();
    const row = {value: JSON.stringify(LOG_CATEGORIES.map(c => ({code: c.code, ...next[c.code]}))), updated_by: a.userId, updated_at: at};
    store.sequence(() => {
      if (store.one('vc_settings', {key: LOG_SETTING_KEY})) store.update('vc_settings', {key: LOG_SETTING_KEY}, row);
      else store.insert('vc_settings', {key: LOG_SETTING_KEY, ...row});
      store.insert('vc_change_audit', {audit_id: security.secretToken(), actor_id: a.userId, entity_type: 'administration', entity_id: 'GLOBAL',
        action: 'LOG_POLICY_UPDATED', redacted_summary: ('LOG_POLICY_UPDATED ' + summary(before, next)).slice(0, 400),
        correlation_id: security.secretToken().slice(0, 16), created_at: at});
    });
    if (memo) memo.clear(); // this process sees the new policy now; others within a minute
    return {...getInner({}, a), ...view()};
  };
  return h;
}
