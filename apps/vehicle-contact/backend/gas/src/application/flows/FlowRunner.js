// One use case, two engines (VC-ADR-046 phase 2b, "functional core, imperative shell"): a use case is written ONCE as a
// generator that yields effects instead of calling the store; a runner performs them. The legacy engine runs flows with
// runFlowSync (its store is synchronous); the Node core runs the same flow with runFlowAsync (its store returns promises).
// Effects — plain data, no I/O inside the flow:
//   {reads: [{kind: 'one'|'list'|'newest'|'count'|'versioned', name, filter, limit?}], inserts?: [[table, row], ...]}
//        → array of results in order (rows written in the same round as the reads, like store.readMany)
//   {patch: {table, filter, fields}}     → true (field-masked write by primary key; update() where patch is missing)
//   {cacheGet: key}                      → string | null   (no cache → null; cache errors are ignored)
//   {cachePut: {key, value, seconds}}    → null
function readsFallback(store, reads) {
  return reads.map(r => r.kind === 'one' ? store.one(r.name, r.filter)
    : r.kind === 'count' ? (typeof store.count === 'function' ? store.count(r.name, r.filter) : store.list(r.name, r.filter).length)
    : r.kind === 'newest' ? store.listNewest(r.name, r.filter, r.limit || 1)
    : r.kind === 'versioned' ? {row: store.one(r.name, r.filter), version: null}
    : store.list(r.name, r.filter));
}

// Returns the effect's result, or a promise of it when the store is asynchronous.
function perform(effect, {store, cache}) {
  if (!effect || typeof effect !== 'object') throw new Error('INVALID_EFFECT');
  if (Array.isArray(effect.reads)) {
    const inserts = Array.isArray(effect.inserts) ? effect.inserts : [];
    if (typeof store.readMany === 'function') return store.readMany(effect.reads, inserts.length ? {inserts} : {});
    for (const [table, row] of inserts) store.insert(table, row); // synchronous stores only (the async core store has readMany)
    return readsFallback(store, effect.reads);
  }
  if (effect.patch) {
    const {table, filter, fields} = effect.patch;
    return typeof store.patch === 'function' ? store.patch(table, filter, fields) : store.update(table, filter, fields);
  }
  if (effect.cacheGet !== undefined) {
    if (!cache) return null;
    try { return cache.get(effect.cacheGet) ?? null; } catch { return null; }
  }
  if (effect.cachePut) {
    if (cache) try { cache.put(effect.cachePut.key, effect.cachePut.value, effect.cachePut.seconds); } catch { /* optional */ }
    return null;
  }
  throw new Error('INVALID_EFFECT');
}

export function runFlowSync(flow, {store, cache = null}) {
  let step = flow.next();
  while (!step.done) {
    let result;
    try { result = perform(step.value, {store, cache}); }
    catch (e) { step = flow.throw(e); continue; } // same as runFlowAsync: the flow sees store errors
    step = flow.next(result);
  }
  return step.value;
}

export async function runFlowAsync(flow, {store, cache = null}) {
  if (typeof store.readMany !== 'function') throw new Error('ASYNC_STORE_NEEDS_READMANY');
  let step = flow.next();
  while (!step.done) {
    let result;
    try { result = await perform(step.value, {store, cache}); }
    catch (e) { step = flow.throw(e); continue; } // the flow sees the store error exactly as the sync engine does
    step = flow.next(result);
  }
  return step.value;
}
