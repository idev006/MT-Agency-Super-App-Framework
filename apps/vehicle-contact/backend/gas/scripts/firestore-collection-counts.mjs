// Read-only: document count per collection via Firestore COUNT aggregation (billed ~1 read per
// 1,000 index entries — never a full read). Used to size read cost before/after the tune-up.
//   node scripts/firestore-collection-counts.mjs   (FIRESTORE_DATABASE_ID defaults to '(default)')
import './load-env.mjs';
import fs from 'node:fs';
import {GoogleAuth} from 'google-auth-library';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';

export async function collectionCounts({env = process.env, client} = {}) {
  const key = JSON.parse(fs.readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  const project = env.FIRESTORE_PROJECT_ID || key.project_id, db = env.FIRESTORE_DATABASE_ID || '(default)';
  const http = client || await new GoogleAuth({credentials: key, scopes: ['https://www.googleapis.com/auth/datastore']}).getClient();
  const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/${encodeURIComponent(db)}/documents:runAggregationQuery`;
  const names = Object.keys(DATABASE_SCHEMA.tables);
  const counts = await Promise.all(names.map(async coll => {
    const r = await http.request({url, method: 'POST', data: {structuredAggregationQuery: {
      structuredQuery: {from: [{collectionId: coll}]}, aggregations: [{alias: 'n', count: {}}]}}});
    return [coll, Number(r.data?.[0]?.result?.aggregateFields?.n?.integerValue || 0)];
  }));
  return {database: db, counts: Object.fromEntries(counts.sort((a, b) => b[1] - a[1]))};
}

if (process.argv[1]?.endsWith('firestore-collection-counts.mjs')) {
  collectionCounts().then(r => console.log('COUNTS ' + JSON.stringify(r, null, 1)))
    .catch(e => { console.log('COUNTS_ERROR ' + String(e.response?.data?.error?.status || e.message).slice(0, 120)); process.exitCode = 1; });
}
