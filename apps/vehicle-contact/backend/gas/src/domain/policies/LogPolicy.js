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
export const LOG_TABLES = Object.freeze([...new Set(LOG_CATEGORIES.flatMap(c => c.match.map(m => m.table)))]);
const BY_CODE = new Map(LOG_CATEGORIES.map(c => [c.code, c]));

export const defaultLogPolicy = () => Object.fromEntries(LOG_CATEGORIES.map(c => [c.code, {enabled: c.enabled, days: c.days}]));

const validDays = (c, d) => Number.isSafeInteger(d) && (d === 0 ? c.allowForever : d >= c.minDays && d <= LOG_MAX_DAYS);

// Admin input [{code, enabled, days}] → policy {CODE: {enabled, days}}. Strict: every code once, known codes only.
export function parseLogPolicy(raw) {
  if (!Array.isArray(raw) || raw.length !== LOG_CATEGORIES.length) throw new Error('INVALID_LOG_POLICY');
  const out = {};
  for (const x of raw) {
    const c = x && typeof x === 'object' ? BY_CODE.get(x.code) : null;
    if (!c || out[c.code] || typeof x.enabled !== 'boolean' || !validDays(c, x.days)) throw new Error('INVALID_LOG_POLICY');
    if (!x.enabled && !c.canDisable) throw new Error('LOG_REQUIRED');
    out[c.code] = {enabled: x.enabled, days: x.days};
  }
  return out;
}

// Stored JSON → policy; anything unreadable falls back per code to the default (never "log nothing" by accident).
export function readLogPolicy(value) {
  const policy = defaultLogPolicy();
  let list = [];
  try { list = JSON.parse(value || '[]'); } catch { list = []; }
  for (const x of Array.isArray(list) ? list : []) {
    const c = x && BY_CODE.get(x.code);
    if (!c || typeof x.enabled !== 'boolean' || !validDays(c, x.days)) continue;
    policy[c.code] = {enabled: c.canDisable ? x.enabled : true, days: x.days};
  }
  return policy;
}

export const loadLogPolicy = store => {
  const row = store.one('vc_settings', {key: LOG_SETTING_KEY});
  return readLogPolicy(row && row.value);
};

// Which category governs a row about to be written (null = not governed).
export function logCategory(table, row) {
  const hit = LOG_CATEGORIES.find(c => c.match.some(m => m.table === table && m.field && m.values.includes(String(row && row[m.field] || ''))));
  return hit || LOG_CATEGORIES.find(c => c.fallbackFor === table) || null;
}

// COUNT specs per kind: [{table, filter}] — the fallback kind counts its whole table minus what other kinds claim.
export function logCountSpecs(code) {
  const c = BY_CODE.get(code);
  const own = c.match.flatMap(m => m.field ? m.values.map(v => ({table: m.table, filter: {[m.field]: v}, sign: 1})) : []);
  if (!c.fallbackFor || c.match.some(m => m.table === c.fallbackFor && m.field)) return own;
  const claimed = LOG_CATEGORIES.filter(o => o.code !== code).flatMap(o => o.match.filter(m => m.table === c.fallbackFor && m.field)
    .flatMap(m => m.values.map(v => ({table: m.table, filter: {[m.field]: v}, sign: -1}))));
  return [{table: c.fallbackFor, filter: {}, sign: 1}, ...claimed];
}

// {write, expireAt}: expireAt is an ISO time, or null when kept without limit.
export function logDecision(policy, table, row, nowIso) {
  const c = logCategory(table, row);
  if (!c) return {write: true, expireAt: null, code: null};
  const p = policy[c.code] || {enabled: c.enabled, days: c.days};
  const enabled = c.canDisable ? p.enabled : true;
  const base = Date.parse(row && row.created_at || nowIso);
  const expireAt = p.days > 0 && Number.isFinite(base) ? new Date(base + p.days * 86400000).toISOString() : null;
  return {write: enabled, expireAt, code: c.code};
}

export const logPolicyList = policy => LOG_CATEGORIES.map(c => ({code: c.code, enabled: policy[c.code].enabled,
  days: policy[c.code].days, canDisable: c.canDisable, minDays: c.minDays, maxDays: LOG_MAX_DAYS, allowForever: c.allowForever,
  defaultEnabled: c.enabled, defaultDays: c.days}));
