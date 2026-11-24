// DB-copy tooling (owner 2026-11-25: new Firestore DB near GAS). Proves the gate, the refusal to
// write into a missing or non-empty target, create-only writes (exists:false), index copy and the
// per-collection count verification — against an in-memory fake of the Firestore REST API.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {copyDatabase, COPY_GATE, COLLECTIONS} from '../scripts/copy-firestore-database.mjs';

const keyFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'p6vc-copy-')), 'key.json');
fs.writeFileSync(keyFile, JSON.stringify({project_id: 'p'}));
const env = extra => ({P6VC_ALLOW_DB_COPY: COPY_GATE, SOURCE_DB: '(default)', TARGET_DB: 'us', GOOGLE_APPLICATION_CREDENTIALS: keyFile, ...extra});

function fakeClient({targetExists = true, targetDocs = {}} = {}) {
  const dbs = {'(default)': {}, us: targetExists ? {...targetDocs} : null};
  const coll = COLLECTIONS[0];
  dbs['(default)'][coll] = Array.from({length: 450}, (_, i) => ({name: `projects/p/databases/(default)/documents/${coll}/d${i}`, fields: {n: {integerValue: String(i)}}}));
  const indexes = {'(default)': [{name: `projects/p/databases/(default)/collectionGroups/${coll}/indexes/i1`, queryScope: 'COLLECTION', fields: [{fieldPath: 'a', order: 'ASCENDING'}, {fieldPath: '__name__', order: 'ASCENDING'}]}], us: []};
  const commits = [];
  const err = s => Object.assign(new Error('http ' + s), {response: {status: s}});
  return {commits, indexes, request: async ({url, method = 'GET', data}) => {
    const m = url.match(/databases\/([^/?:]+)(.*)$/); const db = decodeURIComponent(m[1]); const rest = m[2];
    if (!dbs[db]) throw err(404);
    if (rest === '') return {data: {name: db}};
    if (rest === '/documents:commit') {
      for (const w of data.writes) {
        assert.deepEqual(w.currentDocument, {exists: false});
        assert.ok(w.update.name.includes('/databases/us/'));
        const c = w.update.name.split('/documents/')[1].split('/')[0];
        (dbs[db][c] ||= []).push(w.update);
      }
      commits.push(data.writes.length); return {data: {}};
    }
    if (rest.startsWith('/collectionGroups/-/indexes')) return {data: {indexes: indexes[db]}};
    if (method === 'POST' && rest.includes('/indexes')) { indexes[db].push(data); return {data: {}}; }
    const c = rest.split('/documents/')[1].split('?')[0];
    const size = Number(/pageSize=(\d+)/.exec(rest)[1]); const tok = Number(/pageToken=(\d+)/.exec(rest)?.[1] || 0);
    const all = dbs[db][c] || []; const page = all.slice(tok, tok + size);
    return {data: {documents: page, ...(tok + size < all.length ? {nextPageToken: String(tok + size)} : {})}};
  }};
}

test('DBCOPY-01 without the gate or with target == source nothing runs', async () => {
  assert.equal((await copyDatabase({env: {}, client: fakeClient()})).reason, 'MISSING_COPY_GATE');
  assert.equal((await copyDatabase({env: env({TARGET_DB: '(default)'}), client: fakeClient()})).reason, 'INVALID_TARGET_DB');
});

test('DBCOPY-02 a missing or non-empty target is refused before any write', async () => {
  assert.equal((await copyDatabase({env: env(), apply: true, client: fakeClient({targetExists: false})})).reason, 'TARGET_DB_NOT_FOUND');
  const c = fakeClient({targetDocs: {[COLLECTIONS[1]]: [{name: 'x', fields: {}}]}});
  const r = await copyDatabase({env: env(), apply: true, client: c});
  assert.equal(r.reason, 'TARGET_NOT_EMPTY'); assert.equal(c.commits.length, 0);
});

test('DBCOPY-03 dry run writes nothing; apply copies create-only in batches, copies indexes, verifies counts', async () => {
  const dry = fakeClient();
  const d = await copyDatabase({env: env(), client: dry});
  assert.equal(d.status, 'DRY_RUN'); assert.equal(dry.commits.length, 0); assert.equal(dry.indexes.us.length, 0);
  const c = fakeClient();
  const r = await copyDatabase({env: env(), apply: true, client: c});
  assert.equal(r.status, 'PASS'); assert.deepEqual(c.commits, [400, 50]);
  assert.equal(r.collections[COLLECTIONS[0]].target, 450); assert.deepEqual(r.mismatch, []);
  assert.equal(r.indexes.copied, 1);
  assert.deepEqual(c.indexes.us[0].fields.map(f => f.fieldPath), ['a'], '__name__ is implicit and stripped');
});
