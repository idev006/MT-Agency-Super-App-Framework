// Firestore composite indexes as code. The SSOT is contracts/firestore-indexes.v1.json (every query
// shape the application uses: equality fields + _seq order). This script only ADDS missing indexes and
// waits until each is READY; it never deletes or edits one. Synthetic DEV only; explicit gate.
//   P6VC_ALLOW_INDEX_ADMIN=ENSURE_FIRESTORE_INDEXES FIRESTORE_DATABASE_ID='(default)' \
//     node scripts/ensure-firestore-indexes.mjs [--apply]
import './load-env.mjs';
import fs from 'node:fs';
import {GoogleAuth} from 'google-auth-library';

export const INDEX_GATE = 'ENSURE_FIRESTORE_INDEXES';
export const INDEX_SSOT = JSON.parse(fs.readFileSync(new URL('../../../contracts/firestore-indexes.v1.json', import.meta.url), 'utf8'));
const shapeOf = fields => fields.map(f => f.fieldPath + ':' + f.order).join(',');

export async function ensureIndexes({env = process.env, apply = false, client, sleep = ms => new Promise(r => setTimeout(r, ms)), maxPolls = 90} = {}) {
  if (env.P6VC_ALLOW_INDEX_ADMIN !== INDEX_GATE) return {status: 'BLOCKED', reason: 'MISSING_INDEX_GATE'};
  const key = JSON.parse(fs.readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  const project = env.FIRESTORE_PROJECT_ID || key.project_id, db = env.FIRESTORE_DATABASE_ID || '(default)';
  const http = client || await new GoogleAuth({credentials: key, scopes: ['https://www.googleapis.com/auth/datastore']}).getClient();
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/${encodeURIComponent(db)}`;
  const listLive = async () => ((await http.request({url: `${base}/collectionGroups/-/indexes`})).data.indexes || [])
    .map(i => ({coll: i.name.split('/collectionGroups/')[1].split('/')[0], state: i.state,
      shape: shapeOf(i.fields.filter(f => f.fieldPath !== '__name__'))}));
  const want = INDEX_SSOT.indexes.map(i => ({coll: i.collection, shape: shapeOf(i.fields), fields: i.fields}));
  let live = await listLive();
  const missing = want.filter(w => !live.some(l => l.coll === w.coll && l.shape === w.shape));
  const report = {status: 'RUNNING', database: db, declared: want.length, live: live.length, missing: missing.map(m => m.coll + '(' + m.shape + ')'), created: []};
  if (!apply) return {...report, status: missing.length ? 'MISSING' : 'PASS'};
  for (const m of missing) {
    await http.request({url: `${base}/collectionGroups/${m.coll}/indexes`, method: 'POST',
      data: {queryScope: 'COLLECTION', fields: m.fields.map(f => ({fieldPath: f.fieldPath, order: f.order}))}});
    report.created.push(m.coll + '(' + m.shape + ')');
  }
  for (let i = 0; i < maxPolls; i++) {
    live = await listLive();
    const notReady = want.filter(w => !live.some(l => l.coll === w.coll && l.shape === w.shape && l.state === 'READY'));
    if (!notReady.length) return {...report, status: 'PASS'};
    await sleep(10000);
  }
  return {...report, status: 'FAIL', reason: 'INDEX_NOT_READY_IN_TIME'};
}

if (process.argv[1]?.endsWith('ensure-firestore-indexes.mjs')) {
  ensureIndexes({apply: process.argv.includes('--apply')}).then(r => {
    console.log('INDEXES ' + JSON.stringify(r));
    if (!['PASS', 'MISSING'].includes(r.status)) process.exitCode = 1;
  }).catch(e => { console.log('INDEXES_ERROR ' + String(e.response?.data?.error?.status || e.message).slice(0, 120)); process.exitCode = 1; });
}
