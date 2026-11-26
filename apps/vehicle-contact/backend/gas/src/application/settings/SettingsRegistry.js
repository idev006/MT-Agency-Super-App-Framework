// System settings registry (owner 2026-11-26, brief item 3 accepted "อนุมัติ เริ่ม PR 1").
// system.config.get / system.config.update are built from a list of setting entries instead of wrappers stacked
// around each other. Each entry owns some keys of vc_settings:
//   keys                 the request keys it accepts in system.config.update {values}
//   view(store)          the fields it adds to the system.config.get response
//   prepare(values, store)  checks ITS keys (throws the error code on a bad value) → {rows: [[key, string]], audit: {action, summary}}
//   afterSave()          optional, e.g. clear a memo
// An update is checked in full first (any bad key → nothing is saved), then every row and one audit row per entry
// that changed are written in one store.sequence (all or nothing).
export function createSettingsOperations({store, security, entries}) {
  const owner = new Map();
  for (const e of entries) for (const k of e.keys) {
    if (owner.has(k)) throw new Error('DUPLICATE_SETTING_KEY');
    owner.set(k, e);
  }
  const get = () => Object.assign({}, ...entries.map(e => e.view(store)));
  function update(p, a) {
    const values = p && p.values;
    if (!values || typeof values !== 'object' || Array.isArray(values) || !Object.keys(values).length
      || Object.keys(values).some(k => !owner.has(k))) throw new Error('INVALID_SETTINGS');
    const plans = entries.filter(e => e.keys.some(k => Object.prototype.hasOwnProperty.call(values, k)))
      .map(e => ({e, plan: e.prepare(Object.fromEntries(e.keys.filter(k => Object.prototype.hasOwnProperty.call(values, k))
        .map(k => [k, values[k]])), store)}));
    const at = security.now();
    store.sequence(() => {
      for (const {plan} of plans) {
        for (const [key, value] of plan.rows) {
          const row = {value, updated_by: a.userId, updated_at: at};
          if (store.one('vc_settings', {key})) store.update('vc_settings', {key}, row);
          else store.insert('vc_settings', {key, ...row});
        }
        store.insert('vc_change_audit', {audit_id: security.secretToken(), actor_id: a.userId, entity_type: 'administration',
          entity_id: 'GLOBAL', action: plan.audit.action, redacted_summary: String(plan.audit.summary || plan.audit.action).slice(0, 400),
          correlation_id: security.secretToken().slice(0, 16), created_at: at});
      }
    });
    for (const {e} of plans) if (typeof e.afterSave === 'function') e.afterSave();
    return get();
  }
  return {'system.config.get': () => get(), 'system.config.update': update};
}

// The two numeric settings (session idle timeout, retention days), stored as strings.
export const NUMERIC_SETTING_LIMITS = Object.freeze({idle_timeout_minutes: 480, retention_days: 3650});
export const numericSettings = () => ({
  keys: Object.keys(NUMERIC_SETTING_LIMITS),
  view(store) {
    const byKey = new Map(store.list('vc_settings').map(r => [r.key, r.value]));
    return Object.fromEntries(Object.keys(NUMERIC_SETTING_LIMITS).map(k => [k, byKey.get(k) ?? null]));
  },
  prepare(values) {
    const rows = Object.entries(values).map(([key, value]) => {
      if (!Number.isSafeInteger(value) || value < 1 || value > NUMERIC_SETTING_LIMITS[key]) throw new Error('INVALID_SETTING_VALUE');
      return [key, String(value)];
    });
    return {rows, audit: {action: 'SETTINGS_UPDATED'}};
  }
});
