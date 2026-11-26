// Log policy (owner 2026-11-26: "การเก็บประวัติต่างๆ ไม่จำเป็นหรอก ว่าเก็บกระทั่งการดูรูป เปลืองค่าใช้จ่าย" → "ควรให้
// system admin ตั้งค่าการบันทึก logs ต่างๆ ได้" → "Build it (defaults)"). VC-ADR-040.
// A system admin chooses, per kind of log, whether it is written and how many days it is kept. Firestore deletes a
// row by itself once its expire_at has passed (TTL policy, no read and no job). Some logs cannot be switched off:
//   CONTACT  who read whose phone number — the only way to trace a leaked number
//   CHANGE   before/after of approvals, edits, QR, accounts, settings — the vehicle history tab reads it
//   LOGIN    sign-in attempts — the account lock after repeated wrong passwords reads it
// Stored in vc_settings key "log_policy" as JSON [{code, enabled, days}]; missing / unreadable → the defaults.
export const LOG_SETTING_KEY = 'log_policy';
export const LOG_MAX_DAYS = 3650;
export const LOG_EXPIRE_FIELD = 'expire_at'; // the Firestore TTL field (FirestoreStore TTL_FIELD)

// match: which rows a kind governs — [{table, field, values}] (no field = the rest of that table). A row belongs to the first
// kind whose match names its value; otherwise to the kind that owns the table (fallback).
export const LOG_CATEGORIES = Object.freeze([
  {code: 'LOOKUP', match: [{table: 'vc_lookup_audit', field: 'lookup_source', values: ['PLATE', 'QR', 'DETAIL']}],
    fallbackFor: 'vc_lookup_audit', enabled: true, days: 365, canDisable: true, minDays: 30, allowForever: false},
  {code: 'CONTACT', match: [{table: 'vc_lookup_audit', field: 'lookup_source', values: ['CONTACT']}], enabled: true, days: 365, canDisable: false, minDays: 90, allowForever: false},
  // a photo view is a photo view wherever it is written: vehicle photos (lookup log) and the reviewer opening a
  // pending registration's photo (change log, REGISTRATION_PHOTO_VIEWED) — both follow this switch (live read-back 0.9.35)
  {code: 'PHOTO', match: [{table: 'vc_lookup_audit', field: 'lookup_source', values: ['PHOTO']},
    {table: 'vc_change_audit', field: 'action', values: ['REGISTRATION_PHOTO_VIEWED']}], enabled: false, days: 90, canDisable: true, minDays: 30, allowForever: false},
  {code: 'CHANGE', match: [{table: 'vc_change_audit'}], fallbackFor: 'vc_change_audit', enabled: true, days: 1825, canDisable: false, minDays: 365, allowForever: true},
  {code: 'LOGIN', match: [{table: 'vc_security_events'}], fallbackFor: 'vc_security_events', enabled: true, days: 90, canDisable: false, minDays: 30, allowForever: false}
].map(c => Object.freeze({...c, match: Object.freeze(c.match.map(m => Object.freeze({...m})))})));

// A log-kind registry (VC-ADR-043 PR 2 "plug-in log kinds"): every rule below works on a given list of kinds, so a new
// kind is one more entry, not a code change. The exports after it are bound to the five kinds above.
// A kind: {code, match: [{table, field?, values?}], fallbackFor?, enabled, days, canDisable, minDays, allowForever, sink?}
export function createLogKinds(kinds) {
  const byCode = new Map();
  for (const c of kinds) {
    if (!c || typeof c.code !== 'string' || byCode.has(c.code) || !Array.isArray(c.match) || !c.match.length) throw new Error('INVALID_LOG_KIND');
    byCode.set(c.code, c);
  }
  const fallback = kinds.filter(c => c.fallbackFor).map(c => c.fallbackFor);
  if (new Set(fallback).size !== fallback.length) throw new Error('INVALID_LOG_KIND');
  const tables = Object.freeze([...new Set(kinds.flatMap(c => c.match.map(m => m.table)))]);
  const validDays = (c, d) => Number.isSafeInteger(d) && (d === 0 ? c.allowForever : d >= c.minDays && d <= LOG_MAX_DAYS);
  if (kinds.some(c => typeof c.enabled !== 'boolean' || !validDays(c, c.days))) throw new Error('INVALID_LOG_KIND');
  const defaults = () => Object.fromEntries(kinds.map(c => [c.code, {enabled: c.enabled, days: c.days}]));

  // Admin input [{code, enabled, days}] → policy {CODE: {enabled, days}}. Strict: every code once, known codes only.
  function parse(raw) {
    if (!Array.isArray(raw) || raw.length !== kinds.length) throw new Error('INVALID_LOG_POLICY');
    const out = {};
    for (const x of raw) {
      const c = x && typeof x === 'object' ? byCode.get(x.code) : null;
      if (!c || out[c.code] || typeof x.enabled !== 'boolean' || !validDays(c, x.days)) throw new Error('INVALID_LOG_POLICY');
      if (!x.enabled && !c.canDisable) throw new Error('LOG_REQUIRED');
      out[c.code] = {enabled: x.enabled, days: x.days};
    }
    return out;
  }
  // Stored JSON → policy; anything unreadable falls back per code to the default (never "log nothing" by accident).
  function read(value) {
    const policy = defaults();
    let list = [];
    try { list = JSON.parse(value || '[]'); } catch { list = []; }
    for (const x of Array.isArray(list) ? list : []) {
      const c = x && byCode.get(x.code);
      if (!c || typeof x.enabled !== 'boolean' || !validDays(c, x.days)) continue;
      policy[c.code] = {enabled: c.canDisable ? x.enabled : true, days: x.days};
    }
    return policy;
  }
  // Which kind governs a row about to be written (null = not governed).
  function category(table, row) {
    const hit = kinds.find(c => c.match.some(m => m.table === table && m.field && m.values.includes(String(row && row[m.field] || ''))));
    return hit || kinds.find(c => c.fallbackFor === table) || null;
  }
  // COUNT specs per kind: [{table, filter, sign}] — the fallback kind counts its whole table minus what other kinds claim.
  function countSpecs(code) {
    const c = byCode.get(code);
    const own = c.match.flatMap(m => m.field ? m.values.map(v => ({table: m.table, filter: {[m.field]: v}, sign: 1})) : []);
    if (!c.fallbackFor || c.match.some(m => m.table === c.fallbackFor && m.field)) return own;
    const claimed = kinds.filter(o => o.code !== code).flatMap(o => o.match.filter(m => m.table === c.fallbackFor && m.field)
      .flatMap(m => m.values.map(v => ({table: m.table, filter: {[m.field]: v}, sign: -1}))));
    return [{table: c.fallbackFor, filter: {}, sign: 1}, ...claimed];
  }
  // {write, expireAt, code, sink}: expireAt is an ISO time, or null when kept without limit.
  function decision(policy, table, row, nowIso) {
    const c = category(table, row);
    if (!c) return {write: true, expireAt: null, code: null, sink: null};
    const p = policy[c.code] || {enabled: c.enabled, days: c.days};
    const enabled = c.canDisable ? p.enabled : true;
    const base = Date.parse(row && row.created_at || nowIso);
    const expireAt = p.days > 0 && Number.isFinite(base) ? new Date(base + p.days * 86400000).toISOString() : null;
    return {write: enabled, expireAt, code: c.code, sink: c.sink || LOG_DEFAULT_SINK};
  }
  const list = policy => kinds.map(c => ({code: c.code, enabled: policy[c.code].enabled,
    days: policy[c.code].days, canDisable: c.canDisable, minDays: c.minDays, maxDays: LOG_MAX_DAYS, allowForever: c.allowForever,
    defaultEnabled: c.enabled, defaultDays: c.days}));
  return Object.freeze({kinds, tables, defaults, parse, read, category, countSpecs, decision, list});
}
export const LOG_DEFAULT_SINK = 'firestore';

const DEFAULT_KINDS = createLogKinds(LOG_CATEGORIES);
export const LOG_TABLES = DEFAULT_KINDS.tables;
export const defaultLogPolicy = () => DEFAULT_KINDS.defaults();
export const parseLogPolicy = raw => DEFAULT_KINDS.parse(raw);
export const readLogPolicy = value => DEFAULT_KINDS.read(value);
export const loadLogPolicy = (store, kinds = DEFAULT_KINDS) => {
  const row = store.one('vc_settings', {key: LOG_SETTING_KEY});
  return kinds.read(row && row.value);
};
export const logCategory = (table, row) => DEFAULT_KINDS.category(table, row);
export const logCountSpecs = code => DEFAULT_KINDS.countSpecs(code);
export const logDecision = (policy, table, row, nowIso) => DEFAULT_KINDS.decision(policy, table, row, nowIso);
export const logPolicyList = policy => DEFAULT_KINDS.list(policy);
export const defaultLogKinds = () => DEFAULT_KINDS;
