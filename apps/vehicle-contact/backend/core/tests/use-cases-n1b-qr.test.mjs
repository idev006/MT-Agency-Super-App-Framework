// N1b PR 5: QR administration on the core. Behaviour: the generated legacy acceptance copies (actor-usecase-acceptance,
// print-filters, acceptance-failures). These prove the engine, one read round + one commit, and the export shape.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAcceptanceHarness} from './support/core-harness.mjs';
import {qrIssue, qrReplace, qrRevoke, qrExport} from '../src/use-cases/qr-manage.mjs';

const AT = '2026-11-28T00:00:00.000Z';
const deps = (store) => { let n = 0; return {store, now: () => AT, id: () => (++n).toString(16).padStart(64, '0'), sha256: x => 'sha:' + x}; };
const world = active => { const s = {rounds: 0, commits: []};
  s.readMany = async () => { s.rounds++; return [{vehicle_id: 'v1', status: 'ACTIVE'}, active]; };
  s.writeMany = async ops => { s.commits.push(ops); return true; };
  return s; };

test('N1B-16 qr.issue / revoke / replace / export are answered by the core', () => {
  const h = createAcceptanceHarness();
  for (const op of ['qr.issue', 'qr.revoke', 'qr.replace', 'qr.export']) assert.equal(h.engineFor(op), 'core', op);
});

test('N1B-17 qr.replace = one read round and ONE commit: revoke the old + insert the new (replaces_qr_id) + audit', async () => {
  const s = world([{qr_id: 'q-old', status: 'ACTIVE'}]);
  const r = await qrReplace({vehicleId: 'v1', reason: 'LOST'}, {userId: 'u-reg'}, deps(s));
  assert.equal(s.rounds, 1);
  assert.equal(s.commits.length, 1);
  const [revoke, insert, audit] = s.commits[0];
  assert.deepEqual([revoke.key.qr_id, revoke.fields.status, revoke.fields.revoke_reason], ['q-old', 'REVOKED', 'LOST']);
  assert.deepEqual([insert.table, insert.data.replaces_qr_id, insert.data.status, insert.data.token_digest], ['vc_qr_tokens', 'q-old', 'ACTIVE', 'sha:' + r.token]);
  assert.equal(audit.data.action, 'QR_REPLACED');
  assert.equal(r.qrId, insert.data.qr_id);
});

test('N1B-18 qr.issue refuses an ACTIVE QR and a bad reason before any write; revoke of nothing writes nothing', async () => {
  const s = world([{qr_id: 'q1', status: 'ACTIVE'}]);
  await assert.rejects(qrIssue({vehicleId: 'v1', reason: 'NEW'}, {userId: 'u'}, deps(s)), /QR_ALREADY_ACTIVE/);
  await assert.rejects(qrIssue({vehicleId: 'v1', reason: 'OTHER'}, {userId: 'u'}, deps(s)), /INVALID_QR_REASON/);
  const none = world([]);
  assert.deepEqual(await qrRevoke({vehicleId: 'v1', reason: 'LOST'}, {userId: 'u'}, deps(none)), {vehicleId: 'v1', revoked: false});
  assert.equal(s.commits.length + none.commits.length, 0);
});

test('N1B-19 qr.export: one read round (person types + every vehicle and its ACTIVE QR), one audit batch for READY codes only', async () => {
  const rounds = [], commits = [];
  const token = 'a'.repeat(64);
  const store = {readMany: async reqs => { rounds.push(reqs); return [null,
    {vehicle_id: 'v1', status: 'ACTIVE', sticker_category: 'NCO'}, [{qr_id: 'q1', qr_token: token, issued_at: 't'}],
    {vehicle_id: 'v2', status: 'ACTIVE'}, [{qr_id: 'q2', qr_token: ''}],
    null, []]; },
  writeMany: async ops => { commits.push(ops); }};
  const out = await qrExport({vehicleIds: ['v1', 'v2', 'v3', 'v1']}, {userId: 'u-reg'}, deps(store));
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].length, 7, 'settings + 3 distinct vehicles × 2');
  assert.deepEqual(out.items.map(x => x.status), ['READY', 'REISSUE_NEEDED', 'NOT_FOUND']);
  assert.equal(out.items[0].token, token);
  assert.equal(out.items[0].sticker.code, 'NCO');
  assert.equal(out.items[2].sticker, null);
  assert.equal(out.ready, 1);
  assert.deepEqual(commits.map(c => c.map(o => [o.data.entity_id, o.data.action])), [[['v1', 'QR_EXPORTED']]]);
});
