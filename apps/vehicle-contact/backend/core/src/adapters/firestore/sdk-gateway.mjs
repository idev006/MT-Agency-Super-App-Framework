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
  return Object.freeze({query, count, commit, queryMany, queryManyAndCommit});
}
