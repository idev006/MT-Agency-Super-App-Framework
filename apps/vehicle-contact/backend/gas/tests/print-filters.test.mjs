// VC-ADR-042 QR print filters (owner 2026-11-26: "ที่หน้านี้ "พิมพ์ QR" ควร filter ได้นะ คิดในมุมมองของ actor").
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAcceptanceHarness, assertOk, assertError} from './acceptance-fixture.mjs';
import {withPrintStateStore} from '../src/application/use-cases/VehicleListOperations.js';

function approved(h, org, camp, plate, type) {
  const r = assertOk(assert, h.call('registrations.submit', h.registrationPayload(camp.campaignToken, org, h.stagePhotos(camp.campaignToken),
    {plate, idempotencyKey: 'k-' + plate})), 'submit ' + plate);
  return assertOk(assert, h.as('reg', 'registrations.review', {requestId: r.requestId, decision: 'APPROVE', stickerCategory: type, platePhotoVerified: true}), 'approve ' + plate);
}
const ids = page => page.items.map(x => x.vehicleId).sort();

test('PRINT-01 new vehicles are NOT_PRINTED; "printed" moves them between the filters; a new QR brings them back', () => {
  const h = createAcceptanceHarness(), org = h.createOrganization(), camp = h.createCampaign();
  const a = approved(h, org, camp, 'กข 1001', 'NCO'), b = approved(h, org, camp, 'กข 1002', 'SENIOR_OFFICER');
  assert.ok(h.read('vc_vehicles').every(v => v.qr_print_state === 'NOT_PRINTED'));
  const list = f => assertOk(assert, h.as('reg', 'vehicles.list', {page: 1, pageSize: 50, ...f}), JSON.stringify(f));
  assert.deepEqual(ids(list({printState: 'NOT_PRINTED'})), [a.vehicleId, b.vehicleId].sort());
  const m = assertOk(assert, h.as('reg', 'qr.markPrinted', {vehicleIds: [a.vehicleId, 'nope']}), 'mark');
  assert.equal(m.marked, 1); assert.deepEqual(m.skipped, ['nope']);
  assert.deepEqual(ids(list({printState: 'NOT_PRINTED'})), [b.vehicleId]);
  const printed = list({printState: 'PRINTED'}).items;
  assert.deepEqual(printed.map(x => [x.vehicleId, x.qrPrintState, Boolean(x.qrPrintedAt)]), [[a.vehicleId, 'PRINTED', true]]);
  assert.ok(h.read('vc_change_audit').some(x => x.action === 'QR_PRINTED' && x.entity_id === a.vehicleId), 'audited');
  // the sticker was lost → a new QR → it must be printed again
  assertOk(assert, h.as('reg', 'qr.replace', {vehicleId: a.vehicleId, reason: 'LOST'}), 'replace');
  const v = h.read('vc_vehicles').find(x => x.vehicle_id === a.vehicleId);
  assert.equal(v.qr_print_state, 'NOT_PRINTED'); assert.equal(v.qr_printed_at, '');
  // a vehicle without an ACTIVE QR is skipped (nothing to print)
  assertOk(assert, h.as('reg', 'qr.revoke', {vehicleId: b.vehicleId, reason: 'ADMIN_REVOKE'}), 'revoke');
  assert.deepEqual(assertOk(assert, h.as('reg', 'qr.markPrinted', {vehicleIds: [b.vehicleId]}), 'mark revoked').skipped, [b.vehicleId]);
});

test('PRINT-02 filters by organization, person type and plate; rows carry the organization; options for the filter bar', () => {
  const h = createAcceptanceHarness(), camp = h.createCampaign();
  const o1 = h.createOrganization();
  const o2 = assertOk(assert, h.as('sys', 'organizations.create', {name: 'สภ.ทดสอบสอง', type: 'POLICE'}), 'org2').organizationId;
  const a = approved(h, o1, camp, 'กข 2001', 'NCO'), b = approved(h, o2, camp, 'กข 2002', 'NCO'), c = approved(h, o2, camp, 'กข 2003', 'PUBLIC');
  const list = f => assertOk(assert, h.as('reg', 'vehicles.list', {page: 1, pageSize: 50, ...f}), JSON.stringify(f));
  assert.deepEqual(ids(list({organizationId: o2})), [b.vehicleId, c.vehicleId].sort());
  assert.deepEqual(ids(list({stickerCategory: 'nco'})), [a.vehicleId, b.vehicleId].sort(), 'type code is case-insensitive');
  assert.deepEqual(ids(list({organizationId: o2, stickerCategory: 'NCO'})), [b.vehicleId]);
  assert.deepEqual(ids(list({plate: 'กข 2003'})), [c.vehicleId], 'plate with a space');
  assert.deepEqual(ids(list({plate: 'กข2003', organizationId: o1})), [], 'plate + other filters');
  const row = list({plate: 'กข2002'}).items[0];
  assert.equal(row.organizationName, 'สภ.ทดสอบสอง'); assert.equal(row.organizationId, o2);
  const withOptions = list({withFilterOptions: true});
  assert.ok(withOptions.filterOptions.organizations.some(o => o.id === o2 && o.name === 'สภ.ทดสอบสอง'));
  assert.ok(withOptions.filterOptions.stickerCategories.some(t => t.code === 'NCO' && /^#/.test(t.hex)));
  assert.deepEqual(withOptions.filterOptions.printStates, ['NOT_PRINTED', 'PRINTED']);
  assert.equal(list({}).filterOptions, undefined, 'options only when asked');
  for (const bad of [{printState: 'MAYBE'}, {stickerCategory: 'x y'}, {plate: '<script>'}])
    assertError(assert, h.as('reg', 'vehicles.list', {page: 1, pageSize: 50, ...bad}), 'INVALID_REQUEST', JSON.stringify(bad));
  assertError(assert, h.as('staff', 'qr.markPrinted', {vehicleIds: [a.vehicleId]}), 'FORBIDDEN', 'staff cannot mark printed');
  assertError(assert, h.as('reg', 'qr.markPrinted', {vehicleIds: []}), 'INVALID_VEHICLE_IDS', 'empty list');
});

test('PRINT-03 the store rule: a new ACTIVE QR resets the vehicle on every write path, in the same batch', () => {
  const log = [];
  const base = {insert: (t, d) => log.push(['insert', t, d]), update: (t, k) => log.push(['update', t, k]),
    writeMany: ops => log.push(['writeMany', ops.map(o => [o.op, o.table, o.fields || o.data.qr_print_state || ''])]), sequence: fn => fn(base)};
  const s = withPrintStateStore(base);
  s.insert('vc_qr_tokens', {vehicle_id: 'v1', status: 'ACTIVE'});
  s.insert('vc_qr_tokens', {vehicle_id: 'v1', status: 'REVOKED'});
  s.writeMany([{op: 'insert', table: 'vc_vehicles', data: {vehicle_id: 'v2'}}, {op: 'insert', table: 'vc_qr_tokens', data: {vehicle_id: 'v2', status: 'ACTIVE'}},
    {op: 'insert', table: 'vc_qr_tokens', data: {vehicle_id: 'v3', status: 'ACTIVE'}}]);
  s.sequence(tx => tx.insert('vc_qr_tokens', {vehicle_id: 'v4', status: 'ACTIVE'}));
  assert.deepEqual(log, [
    ['insert', 'vc_qr_tokens', {vehicle_id: 'v1', status: 'ACTIVE'}], ['update', 'vc_vehicles', {vehicle_id: 'v1'}],
    ['insert', 'vc_qr_tokens', {vehicle_id: 'v1', status: 'REVOKED'}],
    ['writeMany', [['insert', 'vc_vehicles', 'NOT_PRINTED'], ['insert', 'vc_qr_tokens', ''], ['insert', 'vc_qr_tokens', ''],
      ['update', 'vc_vehicles', {qr_print_state: 'NOT_PRINTED', qr_printed_at: ''}]]],
    ['insert', 'vc_qr_tokens', {vehicle_id: 'v4', status: 'ACTIVE'}], ['update', 'vc_vehicles', {vehicle_id: 'v4'}]]);
});
