// Log policy (VC-ADR-040): a system admin turns each kind of log on/off and sets how long it is kept.
//   withLogPolicyStore  — the store the operations write through, via the Log Manager (application/logging/LogManager.js):
//                         a row of a switched-off kind is not written; a kept row goes to its sink (Firestore: expire_at + TTL).
//   logPolicySettings   — the settings-registry entry: system.config.get shows log_policy (+ row counts), update saves it.
// The policy is read at most once a minute per server process (memo) and only when a log row is about to be written.
import {LOG_SETTING_KEY, LOG_CATEGORIES, defaultLogPolicy, loadLogPolicy, logPolicyList, parseLogPolicy} from '../../domain/policies/LogPolicy.js';
import {createLogManager} from '../logging/LogManager.js';

export function createLogPolicyReader(store, memo = null) {
  return function policy() {
    const cached = memo ? memo.get() : undefined;
    if (cached) return cached;
    let value;
    try { value = loadLogPolicy(store); } catch { value = defaultLogPolicy(); }
    if (memo) memo.put(value);
    return value;
  };
}

// The store every operation writes through: the Log Manager decides each log row (VC-ADR-043 PR 2).
export function withLogPolicyStore(store, {policy, now, manager = null}) {
  return (manager || createLogManager({policy, now})).wrapStore(store);
}

const summary = (before, after) => LOG_CATEGORIES.map(c => {
  const b = before[c.code], a = after[c.code], parts = [];
  if (b.enabled !== a.enabled) parts.push(a.enabled ? 'ON' : 'OFF');
  if (b.days !== a.days) parts.push(`${b.days}->${a.days}d`);
  return parts.length ? `${c.code} ${parts.join(' ')}` : '';
}).filter(Boolean).join('; ') || 'NO_CHANGE';

// Settings-registry entry (system.config.get/update): the policy (+ row counts); a change is audited before→after.
// counts come from the Log Manager (its kinds); the clock is not used for counting.
export const logPolicySettings = ({policy, memo = null, manager = null}) => ({
  keys: [LOG_SETTING_KEY],
  view: store => ({[LOG_SETTING_KEY]: logPolicyList(policy()),
    log_counts: (manager || createLogManager({policy, now: () => new Date(0).toISOString()})).counts(store)}),
  prepare(values, store) {
    const next = parseLogPolicy(values[LOG_SETTING_KEY]), before = loadLogPolicy(store);
    return {rows: [[LOG_SETTING_KEY, JSON.stringify(LOG_CATEGORIES.map(c => ({code: c.code, ...next[c.code]})))]],
      audit: {action: 'LOG_POLICY_UPDATED', summary: 'LOG_POLICY_UPDATED ' + summary(before, next)}};
  },
  afterSave() { if (memo) memo.clear(); } // this process sees the new policy now; others within a minute
});
