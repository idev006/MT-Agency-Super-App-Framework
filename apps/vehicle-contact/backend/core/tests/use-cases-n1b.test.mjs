import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qrHistory} from '../src/use-cases/qr-history.mjs';
import {createAcceptanceHarness} from './support/core-harness.mjs';

test('N1B-01 qr.history is answered by the core and resolves names in two read rounds without exposing codes', async () => {
  const h = createAcceptanceHarness();
  assert.equal(h.engineFor('qr.history'), 'core');
  const reads = [];
  const store = {readMany: async reqs => {
    reads.push(reqs);
    if (reads.length === 1) return [{vehicle_id: 'v1'}, [
      {qr_id: 'q1', status: 'REVOKED', issued_at: '2026-01-01', issued_by: 'u1', revoked_by: 'u2',
        qr_token: 'must-never-leak', token_digest: 'must-never-leak'},
      {qr_id: 'q2', status: 'ACTIVE', issued_at: '2026-01-01', issued_by: 'u2', qr_token: 'must-never-leak'}
    ]];
    return [{display_name: 'Issuer'}, {display_name: 'Revoker'}];
  }};
  const result = await qrHistory({vehicleId: 'v1'}, null, {store});
  assert.equal(reads.length, 2);
  assert.deepEqual(reads[0].map(r => r.name), ['vc_vehicles', 'vc_qr_tokens']);
  assert.deepEqual(reads[1].map(r => r.filter.user_id), ['u1', 'u2']);
  assert.deepEqual(result.items.map(r => r.qrId), ['q2', 'q1'], 'later insertion wins equal timestamp');
  assert.equal(result.items[1].issuedByName, 'Issuer');
  assert.equal(result.items[1].revokedByName, 'Revoker');
  assert.ok(!JSON.stringify(result).includes('must-never-leak'));
});

test('N1B-02 qr.history refuses a missing vehicle before user lookups', async () => {
  let rounds = 0;
  const store = {readMany: async () => { rounds++; return [null, []]; }};
  await assert.rejects(qrHistory({vehicleId: 'missing'}, null, {store}), /NOT_FOUND/);
  assert.equal(rounds, 1);
});
