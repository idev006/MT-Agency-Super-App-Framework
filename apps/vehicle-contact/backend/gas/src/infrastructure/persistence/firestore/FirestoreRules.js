import {DATABASE_SCHEMA} from '../../../domain/ports/SchemaRepository.js';

// The Firestore storage rules — ONE source for every store over Firestore (VC-ADR-046 phase 2b): the legacy synchronous
// FirestoreStore (REST gateway) and the Node core's asynchronous store (Firestore SDK). Moved unchanged from
// FirestoreStore.js: table→collection, record→document (doc id = primary key), equality where, a persisted monotonic _seq
// for order, the TTL field, required/patch checks, commit-error mapping and the readMany spec/result mapping.
export const SEQ_FIELD = '_seq';
// T2-2: Firestore TTL deletes expired housekeeping rows by itself. Each listed table gets expire_at = base field + days on
// insert; policies in contracts/firestore-ttl.v1.json. Audit trails are NOT listed (PDPA).
export const TTL_FIELD = 'expire_at';
export const TTL_RULES = Object.freeze({
  vc_sessions: Object.freeze({from: 'expires_at', days: 1}),
  vc_idempotency: Object.freeze({from: 'created_at', days: 30}),
  vc_security_events: Object.freeze({from: 'created_at', days: 90}),
  vc_operation_journal: Object.freeze({from: 'created_at', days: 180})
});
export const MAX_LIMIT = 5000;

export function createFirestoreRules(schema = DATABASE_SCHEMA) {
  const columns = name => {
    if (!Object.prototype.hasOwnProperty.call(schema.tables, name)) throw new Error('UNKNOWN_TABLE');
    return schema.tables[name].columns;
  };
  const primaryKey = name => columns(name).find(c => c.key === 'primary').name;
  const whereOf = filter => Object.entries(filter || {}).map(([field, value]) => ({field, value}));
  const checkLimit = limit => { if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new Error('INVALID_LIMIT'); };
  // Reads expose canonical columns only; the internal ordering and TTL fields never leak out.
  const strip = fields => { const out = {}; for (const k of Object.keys(fields)) if (k !== SEQ_FIELD && k !== TTL_FIELD) out[k] = fields[k]; return out; };
  // VC-ADR-040: a caller (the log policy) may set expire_at itself (ISO time); it wins over the fixed rule.
  const withTtl = (name, doc) => {
    if (doc[TTL_FIELD]) { const t = new Date(doc[TTL_FIELD]); if (!Number.isFinite(t.getTime())) throw new Error('INVALID_EXPIRY'); return {...doc, [TTL_FIELD]: t}; }
    const r = TTL_RULES[name]; if (!r) return doc; const base = Date.parse(doc[r.from]);
    return Number.isFinite(base) ? {...doc, [TTL_FIELD]: new Date(base + r.days * 86400000)} : doc;
  };
  // W1a: _seq is a time-ordered integer (epoch-ms*1000 + per-process counter): strictly increasing within a process,
  // time-ordered across processes, no counter read (an insert is ONE commit), below 2^53. Ordering only, never identity.
  let lastSeq = 0;
  const nextSeq = () => { lastSeq = Math.max(lastSeq + 1, Date.now() * 1000); return lastSeq; };
  const mapCommitError = e => {
    if (e && e.code === 'ALREADY_EXISTS') return new Error('DUPLICATE_KEY');
    if (e && e.code === 'NOT_FOUND') return new Error('NOT_FOUND');
    if (e && e.code === 'FAILED_PRECONDITION') return new Error('WRITE_CONFLICT');
    return e;
  };
  const checkRequired = (cols, data) => { for (const c of cols) if (c.required && (data[c.name] === undefined || data[c.name] === '')) throw new Error('REQUIRED_FIELD:' + c.name); };
  const checkPatch = (cols, patch) => { if (!patch || !Object.keys(patch).length || Object.keys(patch).some(k => !cols.some(c => c.name === k))) throw new Error('INVALID_PATCH'); };
  const isPk = (name, filter) => { const ks = Object.keys(filter || {}); return ks.length === 1 && ks[0] === primaryKey(name); };
  // a create write for an insert (exists:false precondition is the gateway's job)
  const createWrite = (name, data) => {
    const cols = columns(name); checkRequired(cols, data);
    return {type: 'create', coll: name, id: String(data[primaryKey(name)]), fields: withTtl(name, {...data, [SEQ_FIELD]: nextSeq()})};
  };
  // writeMany op → gateway write
  const manyWrite = o => {
    const cols = columns(o.table);
    if (o.op === 'insert') return createWrite(o.table, o.data);
    if (!isPk(o.table, o.key)) throw new Error('WRITE_REQUIRES_PRIMARY_KEY');
    const id = String(o.key[primaryKey(o.table)]);
    if (o.op === 'update') { checkPatch(cols, o.fields); return {type: 'patch', coll: o.table, id, fields: o.fields, ...(o.ifVersion ? {ifUpdateTime: o.ifVersion} : {})}; }
    if (o.op === 'remove') return {type: 'delete', coll: o.table, id};
    throw new Error('INVALID_WRITE');
  };
  const checkDistinctTargets = writes => { if (new Set(writes.map(w => w.coll + '/' + w.id)).size !== writes.length) throw new Error('DUPLICATE_WRITE_TARGET'); };
  // readMany request → gateway query spec
  const readSpec = r => {
    columns(r.name);
    if (r.kind === 'one' || r.kind === 'versioned') return {coll: r.name, where: whereOf(r.filter)};
    if (r.kind === 'list') { const l = r.limit || MAX_LIMIT; checkLimit(l); return {coll: r.name, where: whereOf(r.filter), orderBy: {field: SEQ_FIELD, direction: 'asc'}, limit: l}; }
    if (r.kind === 'count') return {coll: r.name, where: whereOf(r.filter), count: true}; // TUNEUP R1: a number, never documents
    if (r.kind === 'newest') { const l = r.limit || 1; checkLimit(l); return {coll: r.name, where: whereOf(r.filter), orderBy: {field: SEQ_FIELD, direction: 'desc'}, limit: l}; }
    throw new Error('INVALID_READ');
  };
  // gateway hits → readMany result
  const readResult = (r, hits) => {
    if (r.kind === 'count') return typeof hits === 'number' ? hits : hits.length; // a gateway without aggregation answers with rows
    if (r.kind === 'list' || r.kind === 'newest') return hits.map(d => strip(d.fields));
    if (hits.length > 1) throw new Error('DUPLICATE_KEY');
    if (r.kind === 'versioned') return hits.length ? {row: strip(hits[0].fields), version: hits[0].updateTime || null} : {row: null, version: null};
    return hits.length ? strip(hits[0].fields) : null;
  };
  return Object.freeze({columns, primaryKey, whereOf, checkLimit, strip, withTtl, nextSeq, mapCommitError, checkRequired, checkPatch,
    isPk, createWrite, manyWrite, checkDistinctTargets, readSpec, readResult});
}
