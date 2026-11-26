// Log Manager (VC-ADR-043 PR 2): one core, plug-in log kinds and sinks. The five default kinds behave as before (log-policy.test.mjs).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLogManager, firestoreSink} from '../src/application/logging/LogManager.js';
import {LOG_CATEGORIES, createLogKinds, defaultLogPolicy} from '../src/domain/policies/LogPolicy.js';

const NOW = '2026-11-26T00:00:00.000Z';
function memStore({ttl = true} = {}) {
  const rows = [];
  const s = {supportsTtl: ttl, rows, insert: (t, d) => { rows.push([t, d]); return d; },
    writeMany: ops => { for (const o of ops) rows.push([o.table, o.data]); }, sequence: fn => fn(s), one: () => null};
  return s;
}
const exportKind = {code: 'EXPORT', match: [{table: 'vc_export_audit'}], fallbackFor: 'vc_export_audit',
  enabled: true, days: 60, canDisable: true, minDays: 30, allowForever: false};

test('LM-01 default manager: the five kinds, Firestore sink adds expire_at, other tables untouched', () => {
  const m = createLogManager({policy: defaultLogPolicy, now: () => NOW});
  assert.deepEqual(m.kinds.kinds.map(c => c.code), LOG_CATEGORIES.map(c => c.code));
  const s = memStore(), w = m.wrapStore(s);
  w.insert('vc_lookup_audit', {lookup_source: 'PLATE', created_at: NOW});
  w.insert('vc_lookup_audit', {lookup_source: 'PHOTO', created_at: NOW}); // PHOTO off by default
  w.insert('vc_vehicles', {vehicle_id: 'v1'});
  assert.deepEqual(s.rows.map(([t]) => t), ['vc_lookup_audit', 'vc_vehicles']);
  assert.equal(s.rows[0][1].expire_at, '2027-11-26T00:00:00.000Z');
  assert.equal('expire_at' in s.rows[1][1], false);
  const noTtl = memStore({ttl: false});
  m.wrapStore(noTtl).insert('vc_lookup_audit', {lookup_source: 'PLATE', created_at: NOW});
  assert.equal('expire_at' in noTtl.rows[0][1], false, 'no TTL store → no expire_at');
});

test('LM-02 a new log kind is one entry: decided, expired and counted without a code change', () => {
  const kinds = [...LOG_CATEGORIES, exportKind];
  const policy = () => ({...defaultLogPolicy(), EXPORT: {enabled: true, days: 60}});
  const m = createLogManager({policy, now: () => NOW, kinds});
  const s = memStore();
  m.wrapStore(s).insert('vc_export_audit', {created_at: NOW});
  assert.equal(s.rows[0][1].expire_at, '2027-01-25T00:00:00.000Z', '60 days');
  const off = createLogManager({policy: () => ({...policy(), EXPORT: {enabled: false, days: 60}}), now: () => NOW, kinds});
  const s2 = memStore();
  off.wrapStore(s2).sequence(tx => tx.insert('vc_export_audit', {created_at: NOW}));
  assert.equal(s2.rows.length, 0, 'switched off → not written, also inside a sequence');
  const counts = m.counts({count: (t, f) => (t === 'vc_export_audit' ? 7 : 1)});
  assert.equal(counts.EXPORT, 7);
  assert.deepEqual(createLogKinds(kinds).parse(kinds.map(c => ({code: c.code, enabled: true, days: c.days}))).EXPORT, {enabled: true, days: 60});
});

test('LM-03 a sink plug-in: a kind routed to another sink is not written to the store', () => {
  const taken = [];
  const memorySink = {name: 'memory', take: (table, row, d) => { taken.push({table, code: d.code, expireAt: d.expireAt}); return null; }};
  const kinds = [...LOG_CATEGORIES, {...exportKind, sink: 'memory'}];
  const policy = () => ({...defaultLogPolicy(), EXPORT: {enabled: true, days: 60}});
  const m = createLogManager({policy, now: () => NOW, kinds, sinks: {memory: memorySink}});
  const s = memStore(), w = m.wrapStore(s);
  w.insert('vc_export_audit', {created_at: NOW});
  w.writeMany([{op: 'insert', table: 'vc_export_audit', data: {created_at: NOW}}, {op: 'insert', table: 'vc_lookup_audit', data: {lookup_source: 'QR', created_at: NOW}}]);
  assert.equal(taken.length, 2);
  assert.equal(taken[0].code, 'EXPORT');
  assert.deepEqual(s.rows.map(([t]) => t), ['vc_lookup_audit'], 'only the Firestore-sink row reached the store');
});

test('LM-04 refused at start: unknown sink, duplicate kind, bad defaults', () => {
  const policy = defaultLogPolicy, now = () => NOW;
  assert.throws(() => createLogManager({policy, now, kinds: [...LOG_CATEGORIES, {...exportKind, sink: 'nope'}]}), /UNKNOWN_LOG_SINK/);
  assert.throws(() => createLogKinds([...LOG_CATEGORIES, LOG_CATEGORIES[0]]), /INVALID_LOG_KIND/);
  assert.throws(() => createLogKinds([{...exportKind, days: 5}]), /INVALID_LOG_KIND/);
  assert.throws(() => createLogKinds([exportKind, {...exportKind, code: 'EXPORT2'}]), /INVALID_LOG_KIND/, 'two fallbacks for one table');
  assert.equal(firestoreSink().name, 'firestore');
});
