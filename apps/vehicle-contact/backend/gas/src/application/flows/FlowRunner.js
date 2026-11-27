// One use case, two engines (VC-ADR-046 phase 2b, "functional core, imperative shell"): a use case is written ONCE as a
// generator that yields effects instead of calling the store; a runner performs them. The legacy engine runs flows with
// runFlowSync (its store is synchronous); the Node core runs the same flow with runFlowAsync (its store returns promises).
// Effects — plain data, no I/O inside the flow:
//   {reads: [{kind: 'one'|'list'|'newest'|'count'|'versioned', name, filter, limit?}], inserts?: [[table, row], ...]}
//        → array of results in order (rows written in the same round as the reads, like store.readMany)
//   {insert: {table, row}}               → the row (append-only, e.g. an access-audit row; the store's log policy applies)
//   {patch: {table, filter, fields}}     → true (field-masked write by primary key; update() where patch is missing)
//   {remove: {table, filter}}            → true (one row; a job's cleanup, e.g. an expired photo staging row)
//   {writeMany: [op, ...]}               → true (several writes in ONE all-or-nothing commit: store.writeMany; insert / update /
//        remove one by one where the store has none). ops: {op:'insert',table,data} | {op:'update',table,key,fields,ifVersion?} | {op:'remove',table,key}
//   {mediaRead: {ref}}                   → {base64Image, mime_type, ...} (photo file through the media port)
//   {mediaList: {pageToken}}             → {files: [{id, createdMs, trashed}], nextPageToken} (one page of the photo folder)
//   {mediaTrash: {ref}}                  → true (photo file to the Drive trash)
//   {mediaUpload: {base64, mime}}        → {storage_ref, mime_type, size_bytes} (a new photo file through the media port)
//   {mediaOrganize: {folderId, path, files}} → {folderId} (VC-ADR-050: a vehicle's photos into its own folder)
//   {mediaStat: [ref, ...]}              → {files: [{id, exists, trashed, mime, size}]}
//   {memoGet: key}                       → value | undefined (a process memo for slow-changing rows; no memo → undefined)
//   {memoPut: {key, value}}              → null
//   {transaction: () => subFlow}         → the sub-flow's result, its effects performed on ONE read-write transaction
//        (store.sequence). A FACTORY, not a generator: Firestore re-runs a contended transaction, so each run needs a fresh
//        sub-flow. A sub-flow must keep its effects to the store (no media / cache) — only the store is rolled back.
//   {hashPassword: password}             → 'pbkdf2-sha256$…' (the password port; one hash rule, engine-specific PBKDF2)
//   {verifyPassword: {password, stored}} → boolean (stored null = the dummy check for an unknown user: same work, false)
//   {passwordNeedsRehash: stored}        → boolean (a port without needsRehash → false)
//   {verifyGoogle: idToken}              → {sub} (the Google OIDC port; none configured → GOOGLE_OIDC_NOT_CONFIGURED)
//   {cacheRemove: [key, ...]}            → null (no cache → nothing; cache errors are ignored)
//   {cacheGet: key}                      → string | null   (no cache → null; cache errors are ignored)
//   {cachePut: {key, value, seconds}}    → null
function readsFallback(store, reads) {
  // a store without one() answers a 'one' read with the first listed row (as VehicleView did)
  return reads.map(r => r.kind === 'one' ? (typeof store.one === 'function' ? store.one(r.name, r.filter) : (store.list(r.name, r.filter) || [])[0] || null)
    : r.kind === 'count' ? (typeof store.count === 'function' ? store.count(r.name, r.filter) : store.list(r.name, r.filter).length)
    : r.kind === 'newest' ? store.listNewest(r.name, r.filter, r.limit || 1)
    : r.kind === 'versioned' ? {row: store.one(r.name, r.filter), version: null}
    : store.list(r.name, r.filter, ...(r.limit ? [r.limit] : [])));
}

// Returns the effect's result, or a promise of it when the store is asynchronous.
function perform(effect, {store, cache, media, passwords, google, memo, run}) {
  if (!effect || typeof effect !== 'object') throw new Error('INVALID_EFFECT');
  // a store whose sequence() passes no transaction store (in-memory / legacy stores run the callback on themselves) → itself
  if (typeof effect.transaction === 'function') return store.sequence(s => run(effect.transaction(), {store: s || store, passwords}));
  if (effect.verifyGoogle !== undefined) { if (!google) throw new Error('GOOGLE_OIDC_NOT_CONFIGURED'); return google.verify(effect.verifyGoogle); }
  if (Array.isArray(effect.cacheRemove)) {
    if (cache) for (const k of effect.cacheRemove) try { cache.remove(k); } catch { /* optional */ }
    return null;
  }
  if (effect.passwordNeedsRehash !== undefined) return !!(passwords && typeof passwords.needsRehash === 'function' && passwords.needsRehash(effect.passwordNeedsRehash));
  if (effect.hashPassword !== undefined || effect.verifyPassword) {
    if (!passwords) throw new Error('PASSWORDS_NOT_CONFIGURED');
    return effect.verifyPassword ? passwords.verify(effect.verifyPassword.password, effect.verifyPassword.stored) : passwords.hash(effect.hashPassword);
  }
  if (Array.isArray(effect.reads)) {
    const inserts = Array.isArray(effect.inserts) ? effect.inserts : [];
    if (typeof store.readMany === 'function') return store.readMany(effect.reads, inserts.length ? {inserts} : {});
    for (const [table, row] of inserts) store.insert(table, row); // synchronous stores only (the async core store has readMany)
    return readsFallback(store, effect.reads);
  }
  if (effect.insert) return store.insert(effect.insert.table, effect.insert.row);
  if (effect.remove) return store.remove(effect.remove.table, effect.remove.filter);
  if (Array.isArray(effect.writeMany)) {
    if (typeof store.writeMany === 'function') return store.writeMany(effect.writeMany);
    for (const o of effect.writeMany) { if (o.op === 'insert') store.insert(o.table, o.data); else if (o.op === 'update') store.update(o.table, o.key, o.fields); else store.remove(o.table, o.key); }
    return true; // synchronous stores only (the async core store has writeMany)
  }
  if (effect.memoGet !== undefined) return memo ? memo.get(effect.memoGet) : undefined;
  if (effect.memoPut) { if (memo) memo.put(effect.memoPut.key, effect.memoPut.value); return null; }
  if (effect.mediaRead || effect.mediaList || effect.mediaTrash || effect.mediaUpload || effect.mediaOrganize || effect.mediaStat) {
    if (!media) throw new Error('MEDIA_NOT_CONFIGURED');
    if (effect.mediaRead) return media.read(effect.mediaRead.ref);
    if (effect.mediaUpload) return media.upload(effect.mediaUpload.base64, effect.mediaUpload.mime);
    if (effect.mediaOrganize) return media.organize(effect.mediaOrganize);
    if (effect.mediaStat) return media.stat(effect.mediaStat);
    if (effect.mediaList) return media.list(effect.mediaList.pageToken ?? null);
    return media.trash(effect.mediaTrash.ref);
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

export function runFlowSync(flow, {store, cache = null, media = null, passwords = null, google = null, memo = null}) {
  let step = flow.next();
  while (!step.done) {
    let result;
    try { result = perform(step.value, {store, cache, media, passwords, google, memo, run: runFlowSync}); }
    catch (e) { step = flow.throw(e); continue; } // same as runFlowAsync: the flow sees store errors
    step = flow.next(result);
  }
  return step.value;
}

export async function runFlowAsync(flow, {store, cache = null, media = null, passwords = null, google = null, memo = null}) {
  if (typeof store.readMany !== 'function') throw new Error('ASYNC_STORE_NEEDS_READMANY');
  let step = flow.next();
  while (!step.done) {
    let result;
    try { result = await perform(step.value, {store, cache, media, passwords, google, memo, run: runFlowAsync}); }
    catch (e) { step = flow.throw(e); continue; } // the flow sees the store error exactly as the sync engine does
    step = flow.next(result);
  }
  return step.value;
}
