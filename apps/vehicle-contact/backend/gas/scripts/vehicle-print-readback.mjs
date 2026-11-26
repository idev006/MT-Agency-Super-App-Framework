// Read-only Firestore read-back (independent of the API) for the live print-page test (VC-ADR-042): one vehicle's
// qr_print_state / qr_printed_at and how many QR_PRINTED audit rows it has. Prints one line: READBACK {...}.
//   node scripts/vehicle-print-readback.mjs <vehicleId>
import './load-env.mjs';
import fs from 'node:fs';
import {GoogleAuth} from 'google-auth-library';

const vehicleId = process.argv[2] || '';
if (!/^[A-Za-z0-9_-]{1,100}$/.test(vehicleId)) throw new Error('usage: node scripts/vehicle-print-readback.mjs <vehicleId>');
const key = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
const http = await new GoogleAuth({credentials: key, scopes: ['https://www.googleapis.com/auth/datastore']}).getClient();
const base = `https://firestore.googleapis.com/v1/projects/${process.env.FIRESTORE_PROJECT_ID || key.project_id}/databases/(default)/documents`;
const eq = (field, value) => ({fieldFilter: {field: {fieldPath: field}, op: 'EQUAL', value: {stringValue: value}}});
const query = async (coll, filters) => (await http.request({url: base + ':runQuery', method: 'POST', data: {structuredQuery: {from: [{collectionId: coll}],
  where: filters.length > 1 ? {compositeFilter: {op: 'AND', filters}} : filters[0]}}})).data.filter(x => x.document).map(x => x.document.fields);
const v = (await query('vc_vehicles', [eq('vehicle_id', vehicleId)]))[0];
const audits = (await query('vc_change_audit', [eq('entity_id', vehicleId)])).filter(f => f.action?.stringValue === 'QR_PRINTED').length;
console.log('READBACK ' + JSON.stringify({found: Boolean(v), state: v?.qr_print_state?.stringValue ?? null, printedAt: v?.qr_printed_at?.stringValue ?? null, printedAudits: audits}));
