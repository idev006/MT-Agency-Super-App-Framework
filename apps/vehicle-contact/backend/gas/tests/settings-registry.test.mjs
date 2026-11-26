// Settings registry: system.config.get/update built from one list of entries (no stacked wrappers); an update is all or nothing.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAcceptanceHarness, assertOk, assertError} from './acceptance-fixture.mjs';
import {createSettingsOperations} from '../src/application/settings/SettingsRegistry.js';

const stickers = cfg => cfg.sticker_categories.map(({ink, ...c}) => c.code === 'NCO' ? {...c, hex: '#0055AA'} : c);
const logs = (cfg, over = {}) => cfg.log_policy.map(({code, enabled, days}) => ({code, enabled, days, ...(over[code] || {})}));
const settingsRows = h => JSON.stringify(h.read('vc_settings').map(({key, value}) => [key, value]).sort());
const audits = h => h.read('vc_change_audit').filter(x => x.entity_type === 'administration').map(x => x.action);

test('SET-01 one bad key refuses the whole update: nothing is saved, nothing is audited', () => {
  const h = createAcceptanceHarness();
  const cfg = assertOk(assert, h.as('sys', 'system.config.get', {}), 'get');
  const before = settingsRows(h), auditsBefore = audits(h).length;
  assertError(assert, h.as('sys', 'system.config.update', {values: {idle_timeout_minutes: 45, sticker_categories: stickers(cfg),
    log_policy: logs(cfg, {LOOKUP: {days: 5}})}}), 'INVALID_LOG_POLICY', 'bad log policy');
  assertError(assert, h.as('sys', 'system.config.update', {values: {log_policy: logs(cfg, {PHOTO: {enabled: true}}), idle_timeout_minutes: 0}}),
    'INVALID_REQUEST', 'bad number (public code, as before)');
  assertError(assert, h.as('sys', 'system.config.update', {values: {idle_timeout_minutes: 45, sticker_categories: stickers(cfg).slice(1)}}),
    'STICKER_CATEGORY_IN_USE', 'deleting a type');
  assert.equal(settingsRows(h), before, 'vc_settings unchanged');
  assert.equal(audits(h).length, auditsBefore, 'no audit row');
});

test('SET-02 unknown or empty values are refused (INVALID_SETTINGS → public INVALID_REQUEST, as before)', () => {
  const h = createAcceptanceHarness();
  assertError(assert, h.as('sys', 'system.config.update', {values: {}}), 'INVALID_REQUEST', 'empty');
  assertError(assert, h.as('sys', 'system.config.update', {values: {idle_timeout_minutes: 45, nope: 1}}), 'INVALID_REQUEST', 'unknown key');
});

test('SET-03 a mixed update saves every key in one go, one audit row per kind; key order does not matter', () => {
  const run = order => {
    const h = createAcceptanceHarness();
    const cfg = assertOk(assert, h.as('sys', 'system.config.get', {}), 'get');
    const values = {idle_timeout_minutes: 45, retention_days: 400, sticker_categories: stickers(cfg), log_policy: logs(cfg, {PHOTO: {enabled: true, days: 30}})};
    const keys = order === 'reverse' ? Object.keys(values).reverse() : Object.keys(values);
    const auditsBefore = audits(h).length;
    const out = assertOk(assert, h.as('sys', 'system.config.update', {values: Object.fromEntries(keys.map(k => [k, values[k]]))}), 'save ' + order);
    assert.equal(out.idle_timeout_minutes, '45');
    assert.equal(out.retention_days, '400');
    assert.equal(out.sticker_categories.find(c => c.code === 'NCO').hex.toLowerCase(), '#0055aa');
    assert.equal(out.log_policy.find(c => c.code === 'PHOTO').enabled, true, 'new policy visible at once (memo cleared)');
    assert.ok(out.log_counts && typeof out.log_counts === 'object');
    assert.deepEqual(audits(h).slice(auditsBefore).sort(), ['LOG_POLICY_UPDATED', 'SETTINGS_UPDATED', 'STICKER_CATEGORIES_UPDATED']);
    return settingsRows(h).replace(/"20\d\d-[^"]*"/g, '');
  };
  assert.equal(run('forward'), run('reverse'));
});

test('SET-04 the registry core: a new entry needs no wrapper; a key owned twice is refused at start', () => {
  const rows = new Map(), audit = [];
  const store = {
    list: () => [...rows].map(([key, v]) => ({key, ...v})), one: (t, {key}) => (rows.has(key) ? {key, ...rows.get(key)} : null),
    update: (t, {key}, row) => rows.set(key, row), insert: (t, row) => (t === 'vc_settings' ? rows.set(row.key, row) : audit.push(row)),
    sequence: fn => fn()
  };
  const security = {now: () => '2026-11-26T00:00:00.000Z', secretToken: () => 'x'.repeat(32)};
  const greeting = {keys: ['greeting'], view: s => ({greeting: s.one('vc_settings', {key: 'greeting'})?.value ?? null}),
    prepare: v => { if (typeof v.greeting !== 'string') throw new Error('INVALID_GREETING'); return {rows: [['greeting', v.greeting]], audit: {action: 'GREETING_UPDATED'}}; }};
  const ops = createSettingsOperations({store, security, entries: [greeting]});
  assert.deepEqual(ops['system.config.get']({}, {}), {greeting: null});
  assert.deepEqual(ops['system.config.update']({values: {greeting: 'hi'}}, {userId: 'u1'}), {greeting: 'hi'});
  assert.equal(audit[0].action, 'GREETING_UPDATED');
  assert.throws(() => ops['system.config.update']({values: {greeting: 1}}, {userId: 'u1'}), /INVALID_GREETING/);
  assert.throws(() => createSettingsOperations({store, security, entries: [greeting, greeting]}), /DUPLICATE_SETTING_KEY/);
});
