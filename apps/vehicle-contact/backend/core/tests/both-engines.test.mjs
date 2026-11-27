// VC-ADR-046 phase 2b: an operation ported to the core must answer EXACTLY like the legacy engine. The same envelopes go
// to the legacy router + controller (acceptance harness) and to the core facade, over the same data.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAcceptanceHarness, assertOk} from '../../gas/tests/acceptance-fixture.mjs';
import {createCoreFacade, FLOWS} from '../src/facade/operations.mjs';

// the harness's synchronous in-memory store behind promises — what the core's Firestore store looks like to a flow
const asyncOf = store => ({
  readMany: async (reqs, opts = {}) => { for (const [t, row] of opts.inserts || []) store.insert(t, row);
    return reqs.map(r => r.kind === 'one' ? store.one(r.name, r.filter) : r.kind === 'count' ? store.list(r.name, r.filter).length : store.list(r.name, r.filter)); },
  patch: async (t, f, fields) => (store.update(t, f, fields), true),
  insert: async (t, row) => store.insert(t, row)
});

function setup() {
  const h = createAcceptanceHarness();
  const org = h.createOrganization(), camp = h.createCampaign();
  const r = assertOk(assert, h.call('registrations.submit', h.registrationPayload(camp.campaignToken, org, h.stagePhotos(camp.campaignToken))), 'submit');
  const v = assertOk(assert, h.as('reg', 'registrations.review', {requestId: r.requestId, decision: 'APPROVE', stickerCategory: 'NCO', platePhotoVerified: true}), 'approve');
  const core = createCoreFacade({store: asyncOf(h.store), now: () => h.security.now(), sha256: x => h.security.sha256(x)});
  const env = (op, payload, actor, extra = {}) => ({apiVersion: 'v1', group: op.split('.')[0], action: op.split('.').slice(1).join('.'), payload,
    ...(actor ? {sessionToken: h.tokens[actor]} : {}), requestId: 'syntheticAcceptance', ...extra});
  const legacy = e => h.call(e.group + '.' + e.action, e.payload, Object.keys(h.tokens).find(k => h.tokens[k] === e.sessionToken) || null, {version: e.apiVersion});
  return {h, v, core, env, legacy};
}

test('BOTH-01 vehicles.history: the core answers exactly like the legacy engine (success and every refusal)', async () => {
  const {v, core, env, legacy} = setup();
  const cases = [
    ['staff reads the trail', env('vehicles.history', {vehicleId: v.vehicleId}, 'staff')],
    ['admin reads the trail', env('vehicles.history', {vehicleId: v.vehicleId}, 'sys')],
    ['unknown vehicle → empty trail', env('vehicles.history', {vehicleId: 'no-such-vehicle'}, 'staff')],
    ['no session', env('vehicles.history', {vehicleId: v.vehicleId}, null)],
    ['role without the permission', env('vehicles.history', {vehicleId: v.vehicleId}, 'owner')],
    ['missing vehicleId', env('vehicles.history', {}, 'staff')],
    ['unknown payload field', env('vehicles.history', {vehicleId: v.vehicleId, role: 'SYSTEM_ADMIN'}, 'staff')],
    ['formula-looking id', env('vehicles.history', {vehicleId: '=HYPERLINK()'}, 'staff')],
    ['bad api version', env('vehicles.history', {vehicleId: v.vehicleId}, 'staff', {apiVersion: 'v9'})]
  ];
  for (const [name, e] of cases) {
    const want = legacy(e), got = await core.dispatch(e, 'POST');
    assert.deepEqual(got, want, name);
  }
  const ok = await core.dispatch(env('vehicles.history', {vehicleId: v.vehicleId}, 'staff'), 'POST');
  assert.equal(ok.ok, true);
  assert.ok(ok.data.length >= 1 && ok.data.every(row => row.entity_id === v.vehicleId), 'the approval is in the trail');
});

test('BOTH-02 the core only answers what it has a flow for; GET goes to the legacy', async () => {
  const {core, env} = setup();
  assert.deepEqual(core.operations, Object.keys(FLOWS));
  assert.deepEqual(core.operations, ['vehicles.history'], 'phase 2b-2a ports exactly one operation');
  const r = await core.dispatch(env('vehicles.lookup', {plate: 'x', province: 'TH-10'}, 'staff'), 'POST');
  assert.equal(r.error.code, 'NOT_FOUND', 'an operation without a flow is not answered by the core');
});
