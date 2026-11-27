// READ-ONLY dual read on the synthetic DEV Firestore (VC-ADR-046 phase 2b-1b): the same queries through the legacy store
// (REST gateway, synchronous) and the core store (Firestore Node SDK, asynchronous) must return identical results.
// No writes, no index creation, no row contents printed — only table, kind, row counts and equal / NOT EQUAL.
// Gate + credentials as the other DEV probes (gitignored .env, key outside the repo):
//   P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE node scripts/store-compare-live.mjs
import {Firestore} from '@google-cloud/firestore';
import '../../gas/scripts/load-env.mjs';
import {loadDevFirestoreConfig} from '../../gas/scripts/firestore-node-composition.mjs';
import {createNodeFirestore} from '../../gas/scripts/node-firestore-bridge.mjs';
import {createSdkGateway} from '../src/adapters/firestore/sdk-gateway.mjs';
import {createFirestoreStoreAsync} from '../src/adapters/firestore/store.mjs';

const {key, keyFile, projectId, databaseId} = loadDevFirestoreConfig();
const legacy = createNodeFirestore({key, projectId, databaseId});
const sdk = new Firestore({projectId, databaseId, keyFilename: keyFile, preferRest: true});
const core = createFirestoreStoreAsync({gateway: createSdkGateway({db: sdk})});
const canonical = x => JSON.stringify(x, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v));

const rows = [];
async function compare(label, legacyCall, coreCall) {
  let a, b, ea = null, eb = null;
  try { a = legacyCall(); } catch (e) { ea = e.message; }
  try { b = await coreCall(); } catch (e) { eb = e.message; }
  const equal = ea || eb ? ea === eb : canonical(a) === canonical(b);
  const size = v => (Array.isArray(v) ? v.length : typeof v === 'number' ? v : v ? 1 : 0);
  rows.push({label, equal, legacy: ea ? 'error ' + ea : size(a), core: eb ? 'error ' + eb : size(b)});
}

// samples: real ids from the DEV data (never printed)
const someVehicle = legacy.store.listNewest('vc_vehicles', {}, 1)[0];
const someUser = legacy.store.listNewest('vc_users', {}, 1)[0];
await compare('vc_users one by PK', () => legacy.store.one('vc_users', {user_id: someUser.user_id}), () => core.one('vc_users', {user_id: someUser.user_id}));
await compare('vc_vehicles one by PK', () => legacy.store.one('vc_vehicles', {vehicle_id: someVehicle.vehicle_id}), () => core.one('vc_vehicles', {vehicle_id: someVehicle.vehicle_id}));
await compare('vc_vehicles newest 20', () => legacy.store.listNewest('vc_vehicles', {}, 20), () => core.listNewest('vc_vehicles', {}, 20));
await compare('vc_vehicle_contacts by vehicle', () => legacy.store.list('vc_vehicle_contacts', {vehicle_id: someVehicle.vehicle_id}), () => core.list('vc_vehicle_contacts', {vehicle_id: someVehicle.vehicle_id}));
await compare('vc_vehicle_photos by vehicle', () => legacy.store.list('vc_vehicle_photos', {vehicle_id: someVehicle.vehicle_id}), () => core.list('vc_vehicle_photos', {vehicle_id: someVehicle.vehicle_id}));
await compare('vc_change_audit by entity', () => legacy.store.list('vc_change_audit', {entity_id: someVehicle.vehicle_id}), () => core.list('vc_change_audit', {entity_id: someVehicle.vehicle_id}));
await compare('vc_lookup_audit count PLATE', () => legacy.store.count('vc_lookup_audit', {lookup_source: 'PLATE'}), () => core.count('vc_lookup_audit', {lookup_source: 'PLATE'}));
await compare('vc_settings all', () => legacy.store.list('vc_settings'), () => core.list('vc_settings'));
await compare('vc_reference_values newest 50', () => legacy.store.listNewest('vc_reference_values', {}, 50), () => core.listNewest('vc_reference_values', {}, 50));
const mix = [{kind: 'one', name: 'vc_vehicles', filter: {vehicle_id: someVehicle.vehicle_id}}, {kind: 'list', name: 'vc_vehicle_contacts', filter: {vehicle_id: someVehicle.vehicle_id}},
  {kind: 'count', name: 'vc_vehicles', filter: {status: 'ACTIVE'}}, {kind: 'newest', name: 'vc_change_audit', filter: {entity_id: someVehicle.vehicle_id}, limit: 5}];
await compare('readMany one+list+count+newest', () => legacy.store.readMany(mix), () => core.readMany(mix));

for (const r of rows) console.log(`${r.equal ? 'EQUAL    ' : 'NOT EQUAL'} ${r.label}  legacy=${r.legacy} core=${r.core}`);
const ok = rows.every(r => r.equal);
console.log('STORE_COMPARE ' + JSON.stringify({status: ok ? 'PASS' : 'FAIL', compared: rows.length, equal: rows.filter(r => r.equal).length}));
legacy.bridge.close(); await sdk.terminate();
process.exit(ok ? 0 : 1);
