// Log Manager (VC-ADR-043 PR 2, brief accepted: "core + log-kind and sink plug-ins; Firestore sink only for now").
//   core   one decision per row about to be written: which kind of log, write or not, when it expires (domain LogPolicy)
//   kinds  plug-in list (createLogKinds); default = the five kinds a system admin sets (LOOKUP, CONTACT, PHOTO, CHANGE, LOGIN)
//   sinks  plug-in map {name: sink}; a kind names its sink (default 'firestore'). A sink gets the kept row and returns
//          the row the store should write, or null when it keeps the row somewhere else.
// wrapStore(store) is the one place every write path goes through (insert / writeMany / readMany inserts / sequence),
// so no use case knows about logging.
import {LOG_DEFAULT_SINK, LOG_EXPIRE_FIELD, createLogKinds, defaultLogKinds} from '../../domain/policies/LogPolicy.js';

// Firestore sink: the row stays in its table; with a TTL store it gets expire_at and Firestore deletes it then.
export const firestoreSink = () => Object.freeze({
  name: LOG_DEFAULT_SINK,
  take: (table, row, d, store) => (store.supportsTtl === true && d.expireAt ? {...row, [LOG_EXPIRE_FIELD]: d.expireAt} : row)
});

export function createLogManager({policy, now, kinds = null, sinks = null}) {
  const registry = kinds ? createLogKinds(kinds) : defaultLogKinds();
  const sinkMap = {[LOG_DEFAULT_SINK]: firestoreSink(), ...(sinks || {})};
  for (const c of registry.kinds) if (!sinkMap[c.sink || LOG_DEFAULT_SINK]) throw new Error('UNKNOWN_LOG_SINK');
  const tables = new Set(registry.tables);

  // null = the store does not write it; otherwise the row to write
  function route(store, table, data) {
    if (!tables.has(table)) return data;
    const d = registry.decision(policy(), table, data, now());
    if (!d.write) return null;
    return sinkMap[d.sink].take(table, data, d, store);
  }

  function wrapStore(store) {
    const wrap = s => {
      const out = {...s};
      out.insert = (table, data) => { const row = route(store, table, data); return row === null ? {...data} : s.insert(table, row); };
      if (typeof s.writeMany === 'function') out.writeMany = ops => {
        const kept = [];
        for (const o of ops) {
          if (o.op !== 'insert') { kept.push(o); continue; }
          const row = route(store, o.table, o.data);
          if (row !== null) kept.push({...o, data: row});
        }
        return kept.length ? s.writeMany(kept) : undefined;
      };
      if (typeof s.readMany === 'function') out.readMany = (reqs, opts = {}) => {
        if (!Array.isArray(opts.inserts) || !opts.inserts.length) return s.readMany(reqs, opts);
        const inserts = [];
        for (const [table, data] of opts.inserts) { const row = route(store, table, data); if (row !== null) inserts.push([table, row]); }
        return s.readMany(reqs, {...opts, inserts});
      };
      if (typeof s.sequence === 'function') out.sequence = fn => s.sequence(tx => fn(tx && typeof tx === 'object' ? wrap(tx) : tx));
      return Object.freeze(out);
    };
    return wrap(store);
  }

  // Row counts per kind (COUNT aggregation: ~1 read per 1,000 rows, never the rows). null when the store cannot count.
  function counts(store) {
    const plan = registry.kinds.flatMap(c => registry.countSpecs(c.code).map(s => ({code: c.code, ...s})));
    try {
      const reqs = plan.map(s => ({kind: 'count', name: s.table, filter: s.filter}));
      const all = typeof store.readMany === 'function' ? store.readMany(reqs)
        : reqs.map(r => typeof store.count === 'function' ? store.count(r.name, r.filter) : store.list(r.name, r.filter).length);
      const out = Object.fromEntries(registry.kinds.map(c => [c.code, 0]));
      plan.forEach((s, i) => { out[s.code] += s.sign * Number(all[i]); });
      return Object.fromEntries(Object.entries(out).map(([k, n]) => [k, Number.isFinite(n) ? Math.max(0, n) : null]));
    } catch { return null; }
  }

  return Object.freeze({kinds: registry, route, wrapStore, counts});
}
