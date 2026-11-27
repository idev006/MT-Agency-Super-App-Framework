// The Node core's Firestore store (port Store, async) — the same storage rules as the legacy FirestoreStore, imported from
// ONE place (backend/gas/src/infrastructure/persistence/firestore/FirestoreRules.js); only the I/O is asynchronous.
// Single-round paths only (every write is one atomic commit with preconditions). sequence() (multi-step transactions) is
// not offered yet: the operations the core answers in phase 2 need reads, append-only inserts and field-masked patches.
import {createFirestoreRules, SEQ_FIELD, MAX_LIMIT} from '../../../../gas/src/infrastructure/persistence/firestore/FirestoreRules.js';

export function createFirestoreStoreAsync({gateway}) {
  if (!gateway) throw new Error('STORAGE_NOT_CONFIGURED');
  const R = createFirestoreRules();
  const {columns, primaryKey, whereOf, checkLimit, strip, mapCommitError, checkPatch, isPk} = R;
  const commit = async writes => { try { await gateway.commit(writes); } catch (e) { throw mapCommitError(e); } };

  async function one(name, filter) {
    columns(name);
    const hits = await gateway.query(name, {where: whereOf(filter)});
    if (hits.length > 1) throw new Error('DUPLICATE_KEY');
    return hits.length ? strip(hits[0].fields) : null;
  }
  async function list(name, filter = {}, limit = MAX_LIMIT) {
    columns(name); checkLimit(limit);
    return (await gateway.query(name, {where: whereOf(filter), orderBy: {field: SEQ_FIELD, direction: 'asc'}, limit})).map(d => strip(d.fields));
  }
  async function listNewest(name, filter = {}, limit = MAX_LIMIT) {
    columns(name); checkLimit(limit);
    return (await gateway.query(name, {where: whereOf(filter), orderBy: {field: SEQ_FIELD, direction: 'desc'}, limit})).map(d => strip(d.fields));
  }
  async function count(name, filter = {}) { columns(name); return gateway.count(name, {where: whereOf(filter)}); }
  async function insert(name, data) { await commit([R.createWrite(name, data)]); return {...data}; }
  async function resolveId(name, filter) {
    if (isPk(name, filter)) return String(filter[primaryKey(name)]);
    const hits = await gateway.query(name, {where: whereOf(filter)});
    if (hits.length !== 1) throw new Error(hits.length ? 'DUPLICATE_KEY' : 'NOT_FOUND');
    return hits[0].id;
  }
  async function update(name, filter, fields) {
    checkPatch(columns(name), fields);
    await commit([{type: 'patch', coll: name, id: await resolveId(name, filter), fields}]);
    return strip({...filter, ...fields});
  }
  async function remove(name, filter) {
    columns(name);
    await commit([{type: 'delete', coll: name, id: await resolveId(name, filter)}]);
    return true;
  }
  async function writeMany(ops) {
    const writes = ops.map(R.manyWrite);
    if (!writes.length) return true;
    R.checkDistinctTargets(writes);
    await commit(writes);
    return true;
  }
  async function readMany(reqs, opts = {}) {
    const inserts = Array.isArray(opts.inserts) ? opts.inserts : [];
    const specs = reqs.map(R.readSpec);
    let results;
    if (inserts.length) {
      const writes = inserts.map(([table, data]) => R.createWrite(table, data));
      try { results = (await gateway.queryManyAndCommit(specs, writes)).slice(0, specs.length); } catch (e) { throw mapCommitError(e); }
    } else results = await gateway.queryMany(specs);
    return results.map((hits, i) => R.readResult(reqs[i], hits));
  }
  async function patch(name, filter, fields) {
    const cols = columns(name);
    if (!fields || !Object.keys(fields).length || Object.keys(fields).some(k => !cols.some(c => c.name === k))) throw new Error('INVALID_PATCH');
    if (!isPk(name, filter)) throw new Error('PATCH_REQUIRES_PRIMARY_KEY');
    try { await gateway.commit([{type: 'patch', coll: name, id: String(filter[primaryKey(name)]), fields}]); }
    catch (e) { if (e && e.code === 'NOT_FOUND') throw new Error('NOT_FOUND'); throw e; }
    return true;
  }
  const withLock = fn => fn();
  const sequence = () => { throw new Error('SEQUENCE_NOT_SUPPORTED'); };
  return Object.freeze({one, list, listNewest, count, insert, update, remove, withLock, sequence, readMany, patch, writeMany, supportsTtl: true});
}
