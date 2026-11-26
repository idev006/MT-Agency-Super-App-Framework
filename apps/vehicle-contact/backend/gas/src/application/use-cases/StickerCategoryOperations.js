// Person type / sticker colour along the workflow (owner 2026-11-26: "ควรตั้งค่าได้ทั้งสี และ ประเภทบุคคล ... ต้อง
// ตรวจสอบจาก workflows"). Wraps the existing operations (no new API op) so VehicleOperations stays small:
//   settings    system.config.get/update  — a system admin edits the list (person type, colour name, colour, size, active)
//   register    campaigns.validate        — the public form gets the ACTIVE person types to choose from
//               registrations.submit      — the registrant's choice is checked against the list (optional)
//   approve     registrations.detail      — the reviewer sees the declared type + the list
//               registrations.review      — APPROVE needs a type (the reviewer's choice, else the declared one)
//   maintain    vehicles.update           — change it later (ACTIVE types only)
//   show/print  vehicles.list/listMine/detail, qr.export — each vehicle carries its resolved sticker (label, colour, size)
// Codes are never deleted (a vehicle may use one): an admin sets a type inactive instead.
import {STICKER_SETTING_KEY, loadStickerCategories, parseStickerCategories, resolveSticker, stickerCategory, stickerInk}
  from '../../domain/policies/StickerCategoryPolicy.js';

export function withStickerCategories(handlers, {store, security}) {
  const list = () => loadStickerCategories(store);
  const full = l => l.map(c => ({...c, ink: stickerInk(c.hex)}));
  const choices = l => full(l).filter(c => c.active);
  const h = {...handlers};
  const wrap = (op, fn) => { const inner = h[op]; h[op] = (p, a) => fn(inner, p || {}, a); };
  const withSticker = (l, row) => ({...row, sticker: resolveSticker(row.stickerCategory, l)});

  wrap('system.config.get', (inner, p, a) => ({...inner(p, a), [STICKER_SETTING_KEY]: full(list())}));
  wrap('system.config.update', (inner, p, a) => {
    const values = p.values && typeof p.values === 'object' && !Array.isArray(p.values) ? p.values : null;
    if (!values || !Object.prototype.hasOwnProperty.call(values, STICKER_SETTING_KEY)) return {...inner(p, a), [STICKER_SETTING_KEY]: full(list())};
    const next = parseStickerCategories(values[STICKER_SETTING_KEY]);
    if (list().some(c => !next.some(n => n.code === c.code))) throw new Error('STICKER_CATEGORY_IN_USE'); // deactivate, never delete
    const rest = {...values}; delete rest[STICKER_SETTING_KEY];
    if (Object.keys(rest).length) inner({...p, values: rest}, a); // the numeric settings first (they validate and may refuse)
    const at = security.now(), row = {value: JSON.stringify(next), updated_by: a.userId, updated_at: at};
    store.sequence(() => {
      if (store.one('vc_settings', {key: STICKER_SETTING_KEY})) store.update('vc_settings', {key: STICKER_SETTING_KEY}, row);
      else store.insert('vc_settings', {key: STICKER_SETTING_KEY, ...row});
      store.insert('vc_change_audit', {audit_id: security.secretToken(), actor_id: a.userId, entity_type: 'administration', entity_id: 'GLOBAL',
        action: 'STICKER_CATEGORIES_UPDATED', redacted_summary: 'STICKER_CATEGORIES_UPDATED', correlation_id: security.secretToken().slice(0, 16), created_at: at});
    });
    return {...handlers['system.config.get']({}, a), [STICKER_SETTING_KEY]: full(next)};
  });

  wrap('campaigns.validate', (inner, p, a) => ({...inner(p, a), stickerCategories: choices(list()).map(({code, label}) => ({code, label}))}));
  wrap('references.registration', (inner, p, a) => ({...inner(p, a), stickerCategories: full(list())}));
  wrap('registrations.submit', (inner, p, a) => {
    const q = {...p};
    if (q.stickerCategory === '' || q.stickerCategory === undefined) delete q.stickerCategory;
    else q.stickerCategory = stickerCategory(q.stickerCategory, list());
    return inner(q, a);
  });
  wrap('registrations.detail', (inner, p, a) => {
    const out = inner(p, a), l = list();
    return {...out, sticker: resolveSticker(out.application?.sticker_category || '', l), stickerCategories: choices(l)};
  });
  wrap('registrations.review', (inner, p, a) => {
    if (p.decision !== 'APPROVE') return inner(p, a);
    const l = list();
    let code = typeof p.stickerCategory === 'string' && p.stickerCategory.trim() ? p.stickerCategory : '';
    if (!code) {
      const r = typeof p.requestId === 'string' ? store.one('vc_registration_requests', {request_id: p.requestId}) : null;
      try { code = r ? JSON.parse(r.application_json).sticker_category || '' : ''; } catch { code = ''; }
    }
    if (!code) throw new Error('STICKER_CATEGORY_REQUIRED');
    return inner({...p, stickerCategory: stickerCategory(code, l)}, a);
  });
  wrap('vehicles.update', (inner, p, a) => (p.stickerCategory === undefined ? inner(p, a)
    : inner({...p, stickerCategory: stickerCategory(p.stickerCategory, list())}, a)));
  for (const op of ['vehicles.list', 'vehicles.listMine']) {
    wrap(op, (inner, p, a) => {
      const out = inner(p, a), l = list();
      return Array.isArray(out) ? out.map(x => withSticker(l, x)) : {...out, items: (out.items || []).map(x => withSticker(l, x))};
    });
  }
  wrap('vehicles.detail', (inner, p, a) => {
    const out = inner(p, a), l = list();
    return out ? {...withSticker(l, out), stickerCategories: choices(l)} : out;
  });
  wrap('qr.export', (inner, p, a) => { const out = inner(p, a), l = list(); return {...out, items: out.items.map(x => withSticker(l, x))}; });
  return h;
}
