// VC-ADR-042 one-off backfill: vehicles approved before 0.9.37 have no qr_print_state, so the equality filter
// "ยังไม่พิมพ์" (NOT_PRINTED) cannot find them. Sets qr_print_state=NOT_PRINTED, qr_printed_at='' where the field is
// missing. Touches only those two fields (update mask); never another field, never a delete. Idempotent.
//   node scripts/backfill-qr-print-state.mjs            dry run: counts only
//   P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV node scripts/backfill-qr-print-state.mjs --apply
import './load-env.mjs';
import fs from 'node:fs';
import {GoogleAuth} from 'google-auth-library';

export function planBackfill(docs) {
  return docs.filter(d => !d.fields || !('qr_print_state' in d.fields)).map(d => d.name);
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && process.env.P6VC_ALLOW_OWNER_DEV_WRITES !== 'RUN_SYNTHETIC_OWNER_DEV') throw new Error('owner-dev synthetic write guard is required for --apply');
  const key = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  const project = process.env.FIRESTORE_PROJECT_ID || key.project_id;
  const http = await new GoogleAuth({credentials: key, scopes: ['https://www.googleapis.com/auth/datastore']}).getClient();
  const root = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
  const docs = (await http.request({url: root + ':runQuery', method: 'POST',
    data: {structuredQuery: {from: [{collectionId: 'vc_vehicles'}], select: {fields: [{fieldPath: 'qr_print_state'}]}}}})).data
    .filter(x => x.document).map(x => x.document);
  const todo = planBackfill(docs);
  console.log('BACKFILL_PLAN ' + JSON.stringify({vehicles: docs.length, missing: todo.length, apply}));
  if (!apply || !todo.length) return;
  let done = 0;
  for (let i = 0; i < todo.length; i += 400) {
    const writes = todo.slice(i, i + 400).map(name => ({
      update: {name, fields: {qr_print_state: {stringValue: 'NOT_PRINTED'}, qr_printed_at: {stringValue: ''}}},
      updateMask: {fieldPaths: ['qr_print_state', 'qr_printed_at']}, currentDocument: {exists: true}}));
    await http.request({url: root + ':commit', method: 'POST', data: {writes}});
    done += writes.length;
  }
  console.log('BACKFILL_DONE ' + JSON.stringify({updated: done}));
}

if (process.argv[1] && process.argv[1].endsWith('backfill-qr-print-state.mjs')) main().catch(e => { console.log('BACKFILL_ERROR ' + String(e.message).slice(0, 200)); process.exitCode = 1; });
