// N1b PR 3: registration review on the core (registrations.listPending / detail / review / photo). The legacy acceptance
// tests (generated copies) prove the behaviour; these prove what the core does differently: the engine, the read shape
// (no whole-table vehicle read, one bounded pending page) and the derived QR token = the legacy engine's.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAcceptanceHarness} from './support/core-harness.mjs';
import {registrationsListPending, registrationsReview} from '../src/use-cases/registration-review.mjs';
import {createDeriveSecret} from '../src/adapters/security/derive-secret.mjs';
import {createGasSecurity} from '../../gas/src/infrastructure/security/GasSecurity.js';
import {nodeUtilities} from '../../cloudrun/runtime.mjs';

const OPS = ['registrations.listPending', 'registrations.detail', 'registrations.review', 'registrations.photo'];

async function submitted(h) {
  const org = await h.createOrganization(), campaign = await h.createCampaign(), photos = await h.stagePhotos(campaign.campaignToken);
  const r = await h.call('registrations.submit', h.registrationPayload(campaign.campaignToken, org, photos));
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.data;
}

test('N1B-04 the four registration-review operations are answered by the core', () => {
  const h = createAcceptanceHarness();
  for (const op of OPS) assert.equal(h.engineFor(op), 'core', op);
});

test('N1B-05 approval checks duplicates by plate + province — never a whole-table vehicle read', async () => {
  const h = createAcceptanceHarness();
  const sub = await submitted(h);
  const vehicleReads = [];
  const list = h.store.list.bind(h.store);
  h.store.list = (t, f = {}, ...rest) => { if (t === 'vc_vehicles') vehicleReads.push(f); return list(t, f, ...rest); };
  const r = await h.as('reg', 'registrations.review', {requestId: sub.requestId, decision: 'APPROVE', stickerCategory: 'NCO', platePhotoVerified: true});
  h.store.list = list;
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(vehicleReads.length >= 1, 'the duplicate check ran');
  for (const f of vehicleReads) {
    assert.deepEqual(Object.keys(f).sort(), ['plate_normalized', 'province_code', 'status'], 'an equality query, not the table');
    assert.equal(f.status, 'ACTIVE');
  }
});

test('N1B-06 a second ACTIVE vehicle with the same plate + province refuses the approval before any write', async () => {
  const writes = [];
  const request = {request_id: 'r1', vehicle_id: 'v-new', status: 'PENDING_APPROVAL',
    application_json: JSON.stringify({plate_normalized: 'TEST 9', province_code: 'TH-10', photos: []})};
  const store = {
    readMany: async reqs => reqs.map(r => (r.name === 'vc_settings' ? null : r.name === 'vc_registration_requests'
      ? (r.kind === 'versioned' ? {row: request, version: 'v1'} : request) : [])),
    list: async (t, f) => (t === 'vc_vehicles' ? [{vehicle_id: 'v-old', ...f}] : []),
    writeMany: async ops => { writes.push(ops); return true; }
  };
  let n = 0;
  await assert.rejects(registrationsReview({requestId: 'r1', decision: 'APPROVE', stickerCategory: 'NCO', platePhotoVerified: true},
    {userId: 'u-reg'}, {store, now: () => '2026-11-28T00:00:00.000Z', id: () => String(++n).padStart(64, '0'), sha256: x => x,
      deriveSecret: x => 'd:' + x}), /DUPLICATE_VEHICLE/);
  assert.equal(writes.length, 0);
});

test('N1B-07 listPending reads one bounded window + COUNT in one round', async () => {
  const rounds = [];
  const store = {readMany: async reqs => { rounds.push(reqs);
    return [[{request_id: 'r1', vehicle_id: 'v1', submitted_at: 't1', status: 'PENDING_APPROVAL', application_json: '{"secret":1}'}], 7]; }};
  const page = await registrationsListPending({page: 1, pageSize: 10}, null, {store});
  assert.equal(rounds.length, 1);
  assert.deepEqual(rounds[0].map(r => [r.kind, r.filter.status, r.limit]), [['list', 'PENDING_APPROVAL', 10], ['count', 'PENDING_APPROVAL', undefined]]);
  assert.deepEqual(page, {items: [{requestId: 'r1', vehicleId: 'v1', submittedAt: 't1', status: 'PENDING_APPROVAL'}], total: 7, page: 1, pageSize: 10, totalPages: 1});
});

test('N1B-08 deriveSecret is byte-identical to the legacy engine on Cloud Run (same pepper → same registration QR token)', () => {
  const pepper = 'synthetic-test-pepper-0123456789abcdef'; // test value only
  const legacy = createGasSecurity({utilities: nodeUtilities(), urlFetchApp: {},
    propertiesService: {getScriptProperties: () => ({getProperty: k => (k === 'VEHICLE_AUTH_PEPPER' ? pepper : null)})},
    clock: () => '2026-11-28T00:00:00.000Z'});
  const derive = createDeriveSecret(pepper);
  for (const purpose of ['registration-review:evt:req', 'registration-review:' + 'ก'.repeat(20) + ':x'])
    assert.equal(derive(purpose), legacy.deriveSecret(purpose));
  assert.equal(createDeriveSecret(''), null);
  assert.equal(createDeriveSecret(undefined), null);
});

test('N1B-09 review without the pepper refuses (AUTH_PEPPER_NOT_CONFIGURED) and writes nothing', async () => {
  const store = {readMany: async () => { throw new Error('must not read'); }};
  await assert.rejects(registrationsReview({requestId: 'r1', decision: 'REJECT'}, {userId: 'u'}, {store}), /AUTH_PEPPER_NOT_CONFIGURED/);
});
