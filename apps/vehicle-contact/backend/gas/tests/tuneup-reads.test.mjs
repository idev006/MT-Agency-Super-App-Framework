// TUNEUP (owner 2026-11-25: "ทำไมถึงมีการใช้งานมากนัก" + "query + filter ที่ Firestore ... ประหยัดค่าใช้จ่าย").
// Read budgets over the REAL REST gateway + a fake server that bills like Firestore
// (query = max(1, docs returned); COUNT = 1 per 1,000 entries). Before the tune-up these
// operations read the whole collection on every call.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFirestoreStore} from '../src/infrastructure/persistence/firestore/FirestoreStore.js';
import {createFirestoreRestGateway} from '../src/infrastructure/persistence/firestore/FirestoreRestGateway.js';
import {createMediaRetentionOperations} from '../src/application/use-cases/MediaRetentionOperations.js';
import {createVehicleOperations} from '../src/application/use-cases/VehicleOperations.js';
import {createVehicleListOperations} from '../src/application/use-cases/VehicleListOperations.js';
import {createReferenceOperations} from '../src/application/use-cases/ReferenceOperations.js';
import {createProcessMemo} from '../src/composition/Container.js';
import {pageWindow, pageOf, readPage} from '../src/application/pagination/Pagination.js';
import {createCloudRunApplication, createMemoryCache, METADATA_TOKEN_URL} from '../../cloudrun/runtime.mjs';
import {createFakeFirestoreRest, makeFakeUtilities, fakeServiceAccountKey, PROJECT, DATABASE} from './fake-firestore-rest-server.mjs';

function setup() {
  const fake = createFakeFirestoreRest();
  const key = fakeServiceAccountKey();
  const gw = createFirestoreRestGateway({utilities: makeFakeUtilities(), urlFetchApp: fake, clientEmail: key.client_email,
    privateKey: key.private_key, projectId: PROJECT, databaseId: DATABASE, clock: () => '2026-11-25T00:00:00.000Z'});
  return {fake, store: createFirestoreStore({firestore: gw})};
}
const at = i => new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString();
const security = {now: () => '2026-11-25T00:00:00.000Z', secretToken: () => 'tok' + Math.random().toString(16).slice(2), sha256: s => 'h' + String(s).length};
const billed = (fake, fn) => { const b = fake.state.billedReads; const out = fn(); return {out, reads: fake.state.billedReads - b}; };

test('TUNE-01 COUNT aggregation: a number in one cheap read, never the documents', () => {
  const {fake, store} = setup();
  for (let i = 0; i < 2500; i++) fake.state.seed('vc_lookup_audit', 'a' + i, {audit_id: 'a' + i, vehicle_id: i % 2 ? 'v1' : 'v2', _seq: i});
  const r = billed(fake, () => store.count('vc_lookup_audit'));
  assert.equal(r.out, 2500); assert.equal(r.reads, 3, '2,500 entries = 3 billed reads, not 2,500');
  const [n, rows] = store.readMany([{kind: 'count', name: 'vc_lookup_audit', filter: {vehicle_id: 'v1'}}, {kind: 'list', name: 'vc_lookup_audit', filter: {vehicle_id: 'v1'}, limit: 5}]);
  assert.equal(n, 1250); assert.equal(rows.length, 5, 'list honours the window limit');
});

test('TUNE-02 pageWindow/pageOf/readPage keep the paginate() contract', () => {
  assert.deepEqual(pageWindow({page: 3, pageSize: 10}), {legacy: false, page: 3, pageSize: 10, n: 30});
  assert.deepEqual(pageWindow({}, {defaultLimit: 50}), {legacy: true, n: 50});
  assert.throws(() => pageWindow({page: 1, pageSize: 7}), /INVALID_PAGINATION/);
  assert.throws(() => pageWindow({limit: 500}, {maxLegacyLimit: 100}), /INVALID_LIMIT/);
  const rows = Array.from({length: 30}, (_, i) => i);
  assert.deepEqual(pageOf(rows, 95, pageWindow({page: 3, pageSize: 10})), {items: rows.slice(20, 30), total: 95, page: 3, pageSize: 10, totalPages: 10});
  // a store without readMany/count falls back to the full read with the same result
  const plain = {list: () => Array.from({length: 12}, (_, i) => ({i}))};
  assert.deepEqual(readPage(plain, {name: 'x', map: r => r.i}, {page: 2, pageSize: 5}).items, [5, 6, 7, 8, 9]);
});

test('TUNE-03 audit.query reads one window per trail + 2 counts (was 1,487+ docs per page); same order as the full sort', () => {
  const {fake, store} = setup();
  for (let i = 0; i < 600; i++) fake.state.seed('vc_lookup_audit', 'l' + i, {audit_id: 'l' + i, actor_id: 'u', vehicle_id: 'v', lookup_source: 'DETAIL', created_at: at(2 * i), _seq: 2 * i});
  for (let i = 0; i < 600; i++) fake.state.seed('vc_change_audit', 'c' + i, {audit_id: 'c' + i, actor_id: 'u', entity_id: 'v', action: 'X', created_at: at(2 * i + 1), _seq: 2 * i + 1});
  const ops = createMediaRetentionOperations({store, security, drivePhotos: {}, campaigns: {}});
  const p1 = billed(fake, () => ops['audit.query']({page: 1, pageSize: 10}));
  assert.equal(p1.out.total, 1200); assert.equal(p1.out.totalPages, 120);
  assert.deepEqual(p1.out.items.map(x => x.eventId), ['c599', 'l599', 'c598', 'l598', 'c597', 'l597', 'c596', 'l596', 'c595', 'l595']);
  assert.ok(p1.reads <= 22, `page 1 billed ${p1.reads} reads (budget 22; before: 1,200)`);
  const p3 = ops['audit.query']({page: 3, pageSize: 10});
  assert.deepEqual(p3.items.map(x => x.eventId), ['c589', 'l589', 'c588', 'l588', 'c587', 'l587', 'c586', 'l586', 'c585', 'l585']);
  const byVehicle = ops['audit.query']({vehicleId: 'v', page: 1, pageSize: 5});
  assert.equal(byVehicle.total, 1200);
  assert.equal(ops['audit.export']({}).rows.length, 100, 'export keeps its legacy limit of 100');
});

function seedVehicles(fake, n) {
  for (let i = 0; i < n; i++) fake.state.seed('vc_vehicles', 'v' + i, {vehicle_id: 'v' + i, plate_normalized: 'กข' + i, province_code: '10',
    status: i % 3 === 2 ? 'CANCELLED' : 'ACTIVE', owner_user_id: i < 4 ? 'owner-1' : '', vehicle_type: '', color: '', make: 'M', model: 'X', version: 1, created_at: at(i), _seq: i});
}

test('TUNE-04 vehicles.list / listMine / lookup query by key, not the whole registry', () => {
  const {fake, store} = setup();
  seedVehicles(fake, 300);
  const ops = {...createVehicleOperations({store, security, campaigns: {}, references: {}}), ...createVehicleListOperations({store, security})};
  const list = billed(fake, () => ops['vehicles.list']({page: 2, pageSize: 10}));
  assert.equal(list.out.total, 200); assert.deepEqual(list.out.items.map(v => v.vehicleId), ['v15', 'v16', 'v18', 'v19', 'v21', 'v22', 'v24', 'v25', 'v27', 'v28']);
  assert.ok(list.reads <= 21, `vehicles.list billed ${list.reads} (budget 21; before: 300)`);
  const mine = billed(fake, () => ops['vehicles.listMine']({}, {userId: 'owner-1'}));
  assert.deepEqual(mine.out.map(v => v.vehicleId), ['v0', 'v1', 'v3']); assert.ok(mine.reads <= 3, `listMine billed ${mine.reads}`);
  const actor = {userId: 'a1', permissions: ['vehicle.lookup']};
  const found = billed(fake, () => ops['vehicles.lookup']({plate: 'กข7', province: '10'}, actor));
  assert.equal(found.out.vehicleId, 'v7');
  assert.ok(found.reads <= 12, `lookup billed ${found.reads} (before: 300 + the view)`);
  assert.equal(ops['vehicles.lookup']({plate: 'กข8', province: '10'}, actor), null, 'a cancelled vehicle is not found');
});

test('TUNE-05 reference rows are memoized per process; organizations stay live and ACTIVE-only', () => {
  const reads = [];
  const store = {readMany(reqs) { reads.push(reqs.map(r => r.name)); return reqs.map(r => (r.name === 'vc_organizations' ? [{organization_id: 'o1', name: 'สภ.หนึ่ง', status: 'ACTIVE'}] : r.kind === 'one' ? null : [])); }};
  let now = 0;
  const memo = createProcessMemo(1000, () => now);
  const refs = createReferenceOperations({store, security: {sha256: s => String(s.length)}, memo});
  refs['references.registration'](); refs['references.registration']();
  assert.deepEqual(reads[0].sort(), ['vc_organizations', 'vc_reference_values', 'vc_settings']);
  assert.deepEqual(reads[1].sort(), ['vc_organizations', 'vc_settings'], 'second call: reference rows from the memo, organizations live');
  now = 1001; refs['references.registration']();
  assert.ok(reads[2].includes('vc_reference_values'), 'the memo expires');
  const noMemo = createReferenceOperations({store, security: {sha256: s => String(s.length)}});
  reads.length = 0; noMemo['references.registration'](); noMemo['references.registration']();
  assert.ok(reads.every(r => r.includes('vc_reference_values')), 'GAS (no memo) reads every time, as before');
});

test('TUNE-06 Cloud Run keeps the Firestore access token across requests (was re-minted per request); sessions are still never cached', () => {
  const calls = [];
  const reply = (code, body) => ({getResponseCode: () => code, getContentText: () => JSON.stringify(body)});
  const fetchSync = (url, opts = {}) => {
    calls.push(String(url));
    if (url === METADATA_TOKEN_URL) return reply(200, {access_token: 'identity-token', expires_in: 3599});
    if (String(url).endsWith(':runQuery')) return reply(200, [{readTime: 'x'}]);
    return reply(200, {});
  };
  const app = createCloudRunApplication({env: {P6VC_AUTH_PEPPER: 'x'.repeat(48), FIRESTORE_PROJECT_ID: 'p'}, fetchSync});
  const req = n => ({apiVersion: 'v1', group: 'vehicles', action: 'lookup', payload: {plate: 'กข1', province: '10'}, requestId: 'req_tune_' + n, sessionToken: 'a'.repeat(64)});
  app.dispatch(req(1), 'POST'); app.dispatch(req(2), 'POST'); app.dispatch(req(3), 'POST');
  assert.equal(calls.filter(u => u === METADATA_TOKEN_URL).length, 1, 'one token for three requests');
  assert.equal(calls.filter(u => u.endsWith(':runQuery')).length, 3, 'each request still checks its session in Firestore');
  const c = createMemoryCache(() => 0); c.put('k', 'v', 10); assert.equal(c.get('k'), 'v'); c.remove('k'); assert.equal(c.get('k'), null);
});
