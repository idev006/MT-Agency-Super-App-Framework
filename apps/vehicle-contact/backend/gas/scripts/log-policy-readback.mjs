// Read-only Firestore read-back (independent of the API) for the live settings UI test: vc_settings.log_policy and the
// LOG_POLICY_UPDATED audit rows (VC-ADR-040). Prints one line: READBACK {...}. No secrets printed.
//   node scripts/log-policy-readback.mjs
import './load-env.mjs';
import fs from 'node:fs';
import {GoogleAuth} from 'google-auth-library';

const key = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
const http = await new GoogleAuth({credentials: key, scopes: ['https://www.googleapis.com/auth/datastore']}).getClient();
const base = `https://firestore.googleapis.com/v1/projects/${process.env.FIRESTORE_PROJECT_ID || key.project_id}/databases/(default)/documents`;
const query = async (coll, field, value) => (await http.request({url: base + ':runQuery', method: 'POST', data: {structuredQuery: {from: [{collectionId: coll}],
  where: {fieldFilter: {field: {fieldPath: field}, op: 'EQUAL', value: {stringValue: value}}}}}})).data.filter(x => x.document).map(x => x.document.fields);
const row = (await query('vc_settings', 'key', 'log_policy'))[0];
const audits = (await query('vc_change_audit', 'action', 'LOG_POLICY_UPDATED'))
  .map(f => ({at: f.created_at.stringValue, summary: f.redacted_summary.stringValue, expire: f.expire_at?.timestampValue || null}))
  .sort((a, b) => a.at.localeCompare(b.at));
console.log('READBACK ' + JSON.stringify({policy: row ? JSON.parse(row.value.stringValue) : null, updatedAt: row?.updated_at?.stringValue || null,
  lastAudit: audits.at(-1) || null, audits: audits.length}));
