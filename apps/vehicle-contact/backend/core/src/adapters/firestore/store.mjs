// The Node core's Firestore store (port Store, async) — the same storage rules as the legacy FirestoreStore, imported from
// ONE place (backend/gas/src/infrastructure/persistence/firestore/FirestoreRules.js); only the I/O is asynchronous.
// Two paths, as in the legacy store: the FAST path on the gateway (every write one atomic commit with preconditions) and the
// TRANSACTION path inside sequence(fn) (VC-ADR-046 phase 3 wave 0): fn gets a store bound to one read-write transaction with
// buffered writes and read-your-writes (sdk-gateway runTransaction = the legacy REST gateway's semantics). fn may run more
// than once (Firestore retries a contended transaction), so it must not have side effects outside the store it is given.
import {createFirestoreRules, SEQ_FIELD, MAX_LIMIT} from '../../../../gas/src/infrastructure/persistence/firestore/FirestoreRules.js';

export function createFirestoreStoreAsync({gateway}) {
  if (!gateway) throw new Error('STORAGE_NOT_CONFIGURED');
  const R = createFirestoreRules();
  const {columns, primaryKey, whereOf, checkLimit, strip, mapCommitError, checkPatch, isPk} = R;

  function build(gw) {
    const fast = typeof gw.commit === 'function'; // the transaction object has get/create/update/delete/query instead
    const commit = async writes => { try { await gw.commit(writes); } catch (e) { throw mapCommitError(e); } };
    const txWrite = async fn => { try { return await fn(); } catch (e) { throw mapCommitError(e); } };

    async function one(name, filter) {
      columns(name);
      const hits = await gw.query(name, {where: whereOf(filter)});
      if (hits.length > 1) throw new Error('DUPLICATE_KEY');
      return hits.length ? strip(hits[0].fields) : null;
    }
    async function list(name, filter = {}, limit = MAX_LIMIT) {
      columns(name); checkLimit(limit);
      return (await gw.query(name, {where: whereOf(filter), orderBy: {field: SEQ_FIELD, direction: 'asc'}, limit})).map(d => strip(d.fields));
    }
    async function listNewest(name, filter = {}, limit = MAX_LIMIT) {
      columns(name); checkLimit(limit);
      return (await gw.query(name, {where: whereOf(filter), orderBy: {field: SEQ_FIELD, direction: 'desc'}, limit})).map(d => strip(d.fields));
    }
    async function count(name, filter = {}) {
      columns(name);
      if (typeof gw.count === 'function') return gw.count(name, {where: whereOf(filter)});
      return (await gw.query(name, {where: whereOf(filter)})).length;
    }
    async function insert(name, data) {
      const w = R.createWrite(name, data);
      if (fast) await commit([w]); else await txWrite(() => gw.create(name, w.id, w.fields));
      return {...data};
    }
    async function resolveId(name, filter) {
      if (isPk(name, filter)) return String(filter[primaryKey(name)]);
      const hits = await gw.query(name, {where: whereOf(filter)});
      if (hits.length !== 1) throw new Error(hits.length ? 'DUPLICATE_KEY' : 'NOT_FOUND');
      return hits[0].id;
    }
    async function update(name, filter, fields) {
      checkPatch(columns(name), fields);
      const id = await resolveId(name, filter);
      if (fast) { await commit([{type: 'patch', coll: name, id, fields}]); return strip({...filter, ...fields}); }
      const current = await gw.get(name, id);
      if (!current) throw new Error('NOT_FOUND');
      await txWrite(() => gw.update(name, id, fields));
      return strip({...current, ...fields});
    }
    async function remove(name, filter) {
      columns(name);
      const id = await resolveId(name, filter);
      if (fast) await commit([{type: 'delete', coll: name, id}]); else await txWrite(() => gw.delete(name, id));
      return true;
    }
    async function writeMany(ops) {
      const writes = ops.map(R.manyWrite);
      if (!writes.length) return true;
      R.checkDistinctTargets(writes);
      if (fast) { await commit(writes); return true; }
      for (const o of ops) {
        if (o.op === 'insert') await insert(o.table, o.data);
        else if (o.op === 'update') await update(o.table, o.key, o.fields);
        else await remove(o.table, o.key);
      }
      return true;
    }
    async function readMany(reqs, opts = {}) {
      const inserts = Array.isArray(opts.inserts) ? opts.inserts : [];
      if (!fast) { // inside a transaction: inserts first (read-your-writes), then the reads one by one
        for (const [table, data] of inserts) await insert(table, data);
        const out = [];
        for (const r of reqs) out.push(r.kind === 'one' ? await one(r.name, r.filter) : r.kind === 'versioned' ? {row: await one(r.name, r.filter), version: null}
          : r.kind === 'newest' ? await listNewest(r.name, r.filter, r.limit || 1) : r.kind === 'count' ? await count(r.name, r.filter)
            : await list(r.name, r.filter, r.limit || MAX_LIMIT));
        return out;
      }
      const specs = reqs.map(R.readSpec);
      let results;
      if (inserts.length) {
        const writes = inserts.map(([table, data]) => R.createWrite(table, data));
        try { results = (await gw.queryManyAndCommit(specs, writes)).slice(0, specs.length); } catch (e) { throw mapCommitError(e); }
      } else results = await gw.queryMany(specs);
      return results.map((hits, i) => R.readResult(reqs[i], hits));
    }
    async function patch(name, filter, fields) {
      const cols = columns(name);
      if (!fields || !Object.keys(fields).length || Object.keys(fields).some(k => !cols.some(c => c.name === k))) throw new Error('INVALID_PATCH');
      if (!isPk(name, filter)) throw new Error('PATCH_REQUIRES_PRIMARY_KEY');
      if (!fast) { await update(name, filter, fields); return true; }
      try { await gw.commit([{type: 'patch', coll: name, id: String(filter[primaryKey(name)]), fields}]); }
      catch (e) { if (e && e.code === 'NOT_FOUND') throw new Error('NOT_FOUND'); throw e; }
      return true;
    }
    const withLock = fn => fn(); // every Firestore write is already atomic
    async function sequence(fn) {
      if (!fast) return fn(build(gw)); // nested: the same transaction
      if (typeof gw.runTransaction !== 'function') throw new Error('SEQUENCE_NOT_SUPPORTED');
      return gw.runTransaction(tx => fn(build(tx)));
    }
    return Object.freeze({one, list, listNewest, count, insert, update, remove, withLock, sequence, readMany, patch, writeMany, supportsTtl: true});
  }
  return build(gateway);
}
