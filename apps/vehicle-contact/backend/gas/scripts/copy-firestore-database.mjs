// Owner (2026-11-25): "สร้างฐานข้อมูลใหม่ โดยให้ไปอยู่ที่เดียวกับ GAS หรือใกล้เคียง ดำเนินการได้".
// Copies the synthetic DEV Firestore database to a new database in the same project (e.g. a US
// region next to GAS): every collection of the schema + the _seq counter, documents byte-for-byte
// (raw Firestore Value JSON, same document ids), then the composite indexes. Refuses a non-empty
// target. Verifies per-collection counts after the copy. Prints names/counts only — never values.
// Run (from backend/gas):
//   P6VC_ALLOW_DB_COPY=COPY_SYNTHETIC_FIRESTORE_DEV SOURCE_DB='(default)' TARGET_DB=p6vc-us \
//     node scripts/copy-firestore-database.mjs [--apply]
import './load-env.mjs';
import fs from 'node:fs';
import {GoogleAuth} from 'google-auth-library';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';

export const COPY_GATE = 'COPY_SYNTHETIC_FIRESTORE_DEV';
export const COLLECTIONS = Object.freeze([...Object.keys(DATABASE_SCHEMA.tables), '__p6vc_seq']);

export async function copyDatabase({env = process.env, apply = false, client} = {}) {
  if (env.P6VC_ALLOW_DB_COPY !== COPY_GATE) return {status: 'BLOCKED', reason: 'MISSING_COPY_GATE'};
  const source = env.SOURCE_DB || '(default)', target = env.TARGET_DB;
  if (!target || target === source) return {status: 'BLOCKED', reason: 'INVALID_TARGET_DB'};
  const key = JSON.parse(fs.readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  const project = env.FIRESTORE_PROJECT_ID || key.project_id;
  const http = client || await new GoogleAuth({credentials: key, scopes: ['https://www.googleapis.com/auth/datastore']}).getClient();
  const dbBase = db => `https://firestore.googleapis.com/v1/projects/${project}/databases/${encodeURIComponent(db)}`;
  const docBase = db => dbBase(db) + '/documents';
  const req = async (url, method = 'GET', data) => (await http.request({url, method, data})).data;

  async function listAll(db, coll) {
    const docs = []; let pageToken = '';
    do {
      const q = `?pageSize=300${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`;
      const r = await req(`${docBase(db)}/${coll}${q}`);
      docs.push(...(r.documents || [])); pageToken = r.nextPageToken || '';
    } while (pageToken);
    return docs;
  }

  const report = {status: 'RUNNING', source, target, apply, collections: {}, indexes: {copied: 0, skipped: 0, failed: []}};
  // Target must be empty (never overwrite or merge into a database that already holds data).
  try { await req(dbBase(target)); } catch (e) { if (e.response?.status === 404) return {...report, status: 'BLOCKED', reason: 'TARGET_DB_NOT_FOUND'}; throw e; }
  for (const coll of COLLECTIONS) {
    const r = await req(`${docBase(target)}/${coll}?pageSize=1`);
    if ((r.documents || []).length) return {...report, status: 'BLOCKED', reason: 'TARGET_NOT_EMPTY', collection: coll};
  }
  for (const coll of COLLECTIONS) {
    const docs = await listAll(source, coll);
    report.collections[coll] = {source: docs.length};
    if (!apply || !docs.length) continue;
    for (let i = 0; i < docs.length; i += 400) {
      const writes = docs.slice(i, i + 400).map(d => ({
        update: {name: d.name.replace(`/databases/${source}/`, `/databases/${target}/`), fields: d.fields || {}},
        currentDocument: {exists: false},
      }));
      await req(`${docBase(target)}:commit`, 'POST', {writes});
    }
  }
  // Composite indexes (single-field indexes are automatic).
  const idx = await req(`${dbBase(source)}/collectionGroups/-/indexes`);
  for (const ix of idx.indexes || []) {
    const coll = ix.name.split('/collectionGroups/')[1].split('/')[0];
    const body = {queryScope: ix.queryScope, fields: ix.fields.filter(f => f.fieldPath !== '__name__')};
    if (!apply) { report.indexes.skipped++; continue; }
    try { await req(`${dbBase(target)}/collectionGroups/${coll}/indexes`, 'POST', body); report.indexes.copied++; }
    catch (e) {
      const status = e.response?.data?.error?.status;
      if (status === 'ALREADY_EXISTS') report.indexes.skipped++;
      else report.indexes.failed.push(coll + ':' + (status || e.response?.status));
    }
  }
  if (apply) {
    for (const coll of COLLECTIONS) report.collections[coll].target = (await listAll(target, coll)).length;
    const mismatch = COLLECTIONS.filter(c => report.collections[c].source !== report.collections[c].target);
    report.status = mismatch.length || report.indexes.failed.length ? 'FAIL' : 'PASS';
    report.mismatch = mismatch;
  } else report.status = 'DRY_RUN';
  return report;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('copy-firestore-database.mjs')) {
  copyDatabase({apply: process.argv.includes('--apply')}).then(r => {
    const total = Object.values(r.collections || {}).reduce((a, c) => a + (c.source || 0), 0);
    console.log('DB_COPY ' + JSON.stringify({status: r.status, reason: r.reason, source: r.source, target: r.target, documents: total,
      collections: Object.keys(r.collections || {}).length, mismatch: r.mismatch, indexes: r.indexes}));
  }).catch(e => { console.log('DB_COPY_ERROR ' + String(e.response?.data?.error?.status || e.message).slice(0, 120)); process.exitCode = 1; });
}
