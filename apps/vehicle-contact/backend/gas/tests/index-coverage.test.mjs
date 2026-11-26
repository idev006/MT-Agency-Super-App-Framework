// Live finding 2026-11-25 (0.9.30): qr.export failed on Firestore (FAILED_PRECONDITION) because its query
// (vc_qr_tokens: vehicle_id + status, _seq order) had no composite index — the offline tests used a fake
// that did not enforce indexes. Guard: run the list-heavy operations against the STRICT fake server that
// knows ONLY the indexes declared in contracts/firestore-indexes.v1.json, exactly like live Firestore.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFirestoreStore} from '../src/infrastructure/persistence/firestore/FirestoreStore.js';
import {createFirestoreRestGateway} from '../src/infrastructure/persistence/firestore/FirestoreRestGateway.js';
import {createVehicleOperations} from '../src/application/use-cases/VehicleOperations.js';
import {createVehicleListOperations} from '../src/application/use-cases/VehicleListOperations.js';
import {createMediaRetentionOperations} from '../src/application/use-cases/MediaRetentionOperations.js';
import {INDEX_SSOT} from '../scripts/ensure-firestore-indexes.mjs';
import {createFakeFirestoreRest, makeFakeUtilities, fakeServiceAccountKey, PROJECT, DATABASE} from './fake-firestore-rest-server.mjs';

function strictStore() {
  const fake = createFakeFirestoreRest({strictIndexes: true});
  for (const i of INDEX_SSOT.indexes) fake.state.addIndex(i.collection, i.fields);
  const key = fakeServiceAccountKey();
  const gw = createFirestoreRestGateway({utilities: makeFakeUtilities(), urlFetchApp: fake, clientEmail: key.client_email,
    privateKey: key.private_key, projectId: PROJECT, databaseId: DATABASE, clock: () => '2026-11-25T00:00:00.000Z'});
  return {fake, store: createFirestoreStore({firestore: gw})};
}
let n = 0;
const security = {now: () => '2026-11-25T00:00:00.000Z', secretToken: () => (++n).toString(16).padStart(64, '0'), sha256: v => 'h' + String(v).length, deriveSecret: p => 'd:' + p};

test('IX-03 the list-heavy operations only issue queries that a declared index backs (strict fake = live Firestore)', () => {
  const {fake, store} = strictStore();
  fake.state.seed('vc_vehicles', 'v1', {vehicle_id: 'v1', plate_normalized: 'กข1', province_code: '10', status: 'ACTIVE', owner_user_id: 'o1', version: 1, make: 'M', model: 'X', color: '', vehicle_type: '', created_at: 'x', _seq: 1});
  fake.state.seed('vc_qr_tokens', 'q1', {qr_id: 'q1', vehicle_id: 'v1', status: 'ACTIVE', qr_token: 'a'.repeat(64), issued_at: 'x', _seq: 2});
  const ops = {...createVehicleOperations({store, security, campaigns: {}, references: {}}), ...createVehicleListOperations({store, security})};
  const audit = createMediaRetentionOperations({store, security, drivePhotos: {}, campaigns: {}});
  const admin = {userId: 'u1', permissions: ['qr.manage', 'vehicle.list', 'vehicle.lookup']};
  assert.equal(ops['qr.export']({vehicleIds: ['v1']}, admin).items[0].status, 'READY', 'qr.export');
  assert.equal(ops['vehicles.list']({page: 1, pageSize: 10}, admin).total, 1, 'vehicles.list');
  assert.equal(ops['vehicles.listMine']({}, {userId: 'o1'}).length, 1, 'vehicles.listMine');
  // VC-ADR-042: every print filter combination and the plate search are backed by a declared index
  for (const f of [{organizationId: 'o9'}, {stickerCategory: 'NCO'}, {printState: 'NOT_PRINTED'}, {organizationId: 'o9', stickerCategory: 'NCO'},
    {organizationId: 'o9', printState: 'PRINTED'}, {stickerCategory: 'NCO', printState: 'PRINTED'}, {organizationId: 'o9', stickerCategory: 'NCO', printState: 'PRINTED'}, {plate: 'กข1'}])
    assert.ok(ops['vehicles.list']({page: 1, pageSize: 10, ...f}, admin), 'vehicles.list ' + JSON.stringify(f));
  assert.equal(ops['qr.markPrinted']({vehicleIds: ['v1']}, admin).marked, 1, 'qr.markPrinted');
  assert.ok(ops['qr.history']({vehicleId: 'v1'}, admin).items.length === 1, 'qr.history');
  assert.ok(audit['audit.query']({vehicleId: 'v1', page: 1, pageSize: 10}).total >= 1, 'audit.query by vehicle');
  assert.ok(audit['audit.query']({page: 1, pageSize: 10}).total >= 1, 'audit.query');
});
