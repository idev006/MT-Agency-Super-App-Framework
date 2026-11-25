// T2: field-level Firestore config as code (contracts/firestore-field-config.v1.json): TTL policies and
// single-field index exemptions. ADD-ONLY: it turns config on where missing and never turns any off.
// Dry run lists what is missing; --apply needs the gate and then waits until each change is live.
//   P6VC_ALLOW_INDEX_ADMIN=ENSURE_FIRESTORE_INDEXES node scripts/ensure-firestore-field-config.mjs [--apply]
import './load-env.mjs';
import fs from 'node:fs';
import {GoogleAuth} from 'google-auth-library';
import {INDEX_GATE} from './ensure-firestore-indexes.mjs';

export const FIELD_SSOT = JSON.parse(fs.readFileSync(new URL('../../../contracts/firestore-field-config.v1.json', import.meta.url), 'utf8'));
const exempt = f => f && f.indexConfig && !f.indexConfig.usesAncestorConfig && (f.indexConfig.indexes || []).length === 0;
const ttlOn = f => f && f.ttlConfig && ['ACTIVE', 'CREATING'].includes(f.ttlConfig.state);
const ttlActive = f => f && f.ttlConfig && f.ttlConfig.state === 'ACTIVE';

export async function ensureFieldConfig({env = process.env, apply = false, client, sleep = ms => new Promise(r => setTimeout(r, ms)), maxPolls = 90} = {}) {
  if (env.P6VC_ALLOW_INDEX_ADMIN !== INDEX_GATE) return {status: 'BLOCKED', reason: 'MISSING_INDEX_GATE'};
  const key = JSON.parse(fs.readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  const project = env.FIRESTORE_PROJECT_ID || key.project_id, db = env.FIRESTORE_DATABASE_ID || '(default)';
  const http = client || await new GoogleAuth({credentials: key, scopes: ['https://www.googleapis.com/auth/datastore']}).getClient();
  const fieldUrl = (c, f) => `https://firestore.googleapis.com/v1/projects/${project}/databases/${encodeURIComponent(db)}/collectionGroups/${c}/fields/${f}`;
  const get = async (c, f) => { try { return (await http.request({url: fieldUrl(c, f)})).data; } catch (e) { if (e.response?.status === 404) return null; throw e; } };
  const want = [...FIELD_SSOT.ttl.map(t => ({kind: 'ttl', ...t})), ...FIELD_SSOT.indexExemptions.map(x => ({kind: 'exempt', ...x}))];
  const missing = [];
  for (const w of want) { const f = await get(w.collection, w.field); if (w.kind === 'ttl' ? !ttlOn(f) : !exempt(f)) missing.push(w); }
  const report = {database: db, declared: want.length, missing: missing.map(m => `${m.kind}:${m.collection}.${m.field}`), applied: []};
  if (!apply) return {...report, status: missing.length ? 'MISSING' : 'PASS'};
  // One field config change at a time (Firestore serialises them per database).
  for (const m of missing) {
    const mask = m.kind === 'ttl' ? 'ttlConfig' : 'indexConfig';
    const body = m.kind === 'ttl' ? {ttlConfig: {}} : {indexConfig: {indexes: []}};
    await http.request({url: `${fieldUrl(m.collection, m.field)}?updateMask=${mask}`, method: 'PATCH', data: body});
    report.applied.push(`${m.kind}:${m.collection}.${m.field}`);
    for (let i = 0; i < maxPolls; i++) {
      const f = await get(m.collection, m.field);
      if (m.kind === 'ttl' ? ttlActive(f) : exempt(f)) break;
      if (i === maxPolls - 1) return {...report, status: 'FAIL', reason: 'NOT_READY_IN_TIME', at: `${m.collection}.${m.field}`};
      await sleep(10000);
    }
  }
  return {...report, status: 'PASS'};
}

if (process.argv[1]?.endsWith('ensure-firestore-field-config.mjs')) {
  ensureFieldConfig({apply: process.argv.includes('--apply')}).then(r => {
    console.log('FIELDS ' + JSON.stringify(r));
    if (!['PASS', 'MISSING'].includes(r.status)) process.exitCode = 1;
  }).catch(e => { console.log('FIELDS_ERROR ' + String(e.response?.data?.error?.status || e.message).slice(0, 160)); process.exitCode = 1; });
}
