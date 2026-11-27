// Firestore document gateway on the official Node SDK (VC-ADR-046 phase 2b) — the asynchronous twin of
// backend/gas/src/infrastructure/persistence/firestore/FirestoreRestGateway.js. Same interface the store rules expect
// (query, count, commit, queryMany, queryManyAndCommit) and the SAME value rules as the REST gateway, so both engines
// read and write identical documents: undefined → null, Date ⇄ timestamp, integers as integers, nested maps/arrays.
import {Timestamp} from '@google-cloud/firestore';

const GRPC = {5: 'NOT_FOUND', 6: 'ALREADY_EXISTS', 9: 'FAILED_PRECONDITION'};
const plainObject = v => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof Timestamp);
const mapValues = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
export const toFirestore = v => v === undefined ? null : v instanceof Date ? Timestamp.fromDate(v)
  : Array.isArray(v) ? v.map(toFirestore) : plainObject(v) ? mapValues(v, toFirestore) : v;
export const fromFirestore = v => v instanceof Timestamp ? v.toDate()
  : Array.isArray(v) ? v.map(fromFirestore) : plainObject(v) ? mapValues(v, fromFirestore) : v;
// a document version token that keeps nanoseconds (a Date would lose them and break the precondition)
const versionOf = t => (t ? `ts:${t.seconds}:${t.nanoseconds}` : null);
const timestampOf = token => { const m = /^ts:(\d+):(\d+)$/.exec(String(token || '')); if (!m) throw new Error('INVALID_VERSION'); return new Timestamp(Number(m[1]), Number(m[2])); };
const mapError = e => Object.assign(new Error(GRPC[e?.code] || e?.message || 'FIRESTORE_ERROR'), {code: GRPC[e?.code] || e?.code});

export function createSdkGateway({db}) {
  if (!db || typeof db.collection !== 'function') throw new Error('STORAGE_NOT_CONFIGURED');
  const build = (coll, {where = [], orderBy, limit} = {}) => {
    let q = db.collection(coll);
    for (const w of where) q = q.where(w.field, '==', toFirestore(w.value));
    if (orderBy) q = q.orderBy(orderBy.field, orderBy.direction === 'desc' ? 'desc' : 'asc');
    if (limit !== undefined) q = q.limit(limit);
    return q;
  };
  async function query(coll, spec) {
    const snap = await build(coll, spec).get().catch(e => { throw mapError(e); });
    return snap.docs.map(d => ({id: d.id, fields: fromFirestore(d.data()), updateTime: versionOf(d.updateTime)}));
  }
  async function count(coll, {where = []} = {}) {
    const snap = await build(coll, {where}).count().get().catch(e => { throw mapError(e); });
    return snap.data().count;
  }
  // writes: [{type:'create'|'patch'|'delete', coll, id, fields?, ifUpdateTime?}] — ONE atomic batch with preconditions
  async function commit(writes) {
    const batch = db.batch();
    for (const w of writes) {
      const ref = db.collection(w.coll).doc(w.id);
      if (w.type === 'create') batch.create(ref, toFirestore(w.fields));                       // must not exist
      else if (w.type === 'patch') batch.update(ref, toFirestore(w.fields), ...(w.ifUpdateTime ? [{lastUpdateTime: timestampOf(w.ifUpdateTime)}] : [])); // must exist
      else if (w.type === 'delete') batch.delete(ref, {exists: true});
      else throw new Error('INVALID_WRITE');
    }
    await batch.commit().catch(e => { throw mapError(e); });
    return true;
  }
  const queryMany = specs => Promise.all(specs.map(s => (s.count ? count(s.coll, s) : query(s.coll, s))));
  async function queryManyAndCommit(specs, writes) {
    const [results] = await Promise.all([queryMany(specs), commit(writes)]);
    return results;
  }
  // A read-write transaction with the SAME semantics as the legacy REST gateway's runTransaction (VC-ADR-046 phase 3 wave 0):
  // reads go through the SDK transaction; writes are BUFFERED (read-your-writes overlay for get and query) and applied when
  // fn returns — so every SDK read happens before any SDK write, as the SDK requires. create = must not exist, update = must
  // exist (the merged document), delete = must exist. fn may run more than once (the SDK retries on contention): it gets a
  // fresh buffer each time. An error thrown by fn rolls back (nothing is written) and reaches the caller unchanged.
  async function runTransaction(fn) {
    try {
      return await db.runTransaction(async t => {
        const pending = new Map();
        const key = (c, id) => c + '/' + id;
        const fail = code => { throw Object.assign(new Error(code), {code}); };
        const serverGet = async (c, id) => { const s = await t.get(db.collection(c).doc(id)); return s.exists ? fromFirestore(s.data()) : null; };
        const tx = {
          async get(c, id) {
            const p = pending.get(key(c, id));
            if (p) return p.type === 'delete' ? null : {...p.fields};
            const f = await serverGet(c, id); return f ? {...f} : null;
          },
          async create(c, id, fields) {
            const p = pending.get(key(c, id));
            if (p && p.type !== 'delete') fail('ALREADY_EXISTS');
            if (!p && await serverGet(c, id)) fail('ALREADY_EXISTS');
            pending.set(key(c, id), {type: 'create', coll: c, id, fields: {...fields}});
            return id;
          },
          async update(c, id, fields) {
            const current = await tx.get(c, id);
            if (!current) fail('NOT_FOUND');
            const p = pending.get(key(c, id));
            pending.set(key(c, id), {type: p && p.type === 'create' ? 'create' : 'update', coll: c, id, fields: {...current, ...fields}});
          },
          async delete(c, id) {
            if (!await tx.get(c, id)) fail('NOT_FOUND');
            const p = pending.get(key(c, id));
            if (p && p.type === 'create') pending.delete(key(c, id)); // created and deleted here: net no-op
            else pending.set(key(c, id), {type: 'delete', coll: c, id});
          },
          async query(c, opts = {}) {
            const snap = await t.get(build(c, {...opts, limit: undefined}));
            const byId = new Map(snap.docs.map(d => [d.id, {id: d.id, fields: fromFirestore(d.data())}]));
            for (const p of pending.values()) {
              if (p.coll !== c) continue;
              if (p.type === 'delete') byId.delete(p.id); else byId.set(p.id, {id: p.id, fields: {...p.fields}});
            }
            let docs = [...byId.values()];
            for (const w of opts.where || []) docs = docs.filter(d => d.fields[w.field] === w.value);
            if (opts.orderBy) {
              const f = opts.orderBy.field, dir = opts.orderBy.direction === 'desc' ? -1 : 1;
              docs.sort((a, b) => { const av = a.fields[f], bv = b.fields[f]; return (av < bv ? -1 : av > bv ? 1 : 0) * dir; });
            }
            if (opts.limit !== undefined) docs = docs.slice(0, opts.limit);
            return docs.map(d => ({id: d.id, fields: {...d.fields}}));
          }
        };
        const result = await fn(tx);
        for (const p of pending.values()) {
          const ref = db.collection(p.coll).doc(p.id);
          if (p.type === 'delete') t.delete(ref, {exists: true});
          else if (p.type === 'create') t.create(ref, toFirestore(p.fields));
          else t.update(ref, toFirestore(p.fields));
        }
        return result;
      });
    } catch (e) { throw (typeof e?.code === 'number' && GRPC[e.code]) ? mapError(e) : e; }
  }
  return Object.freeze({query, count, commit, queryMany, queryManyAndCommit, runTransaction});
}
