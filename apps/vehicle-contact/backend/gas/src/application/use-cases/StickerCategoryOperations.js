// Person type / sticker colour along the workflow (owner 2026-11-26: "ควรตั้งค่าได้ทั้งสี และ ประเภทบุคคล ... ต้อง
// ตรวจสอบจาก workflows"). Wraps the existing operations (no new API op) so VehicleOperations stays small:
//   settings    stickerSettings()         — the settings-registry entry: a system admin edits the list (system.config.get/update)
//   register    campaigns.validate        — the public form gets the ACTIVE person types to choose from
//               registrations.submit      — the registrant's choice is checked against the list (optional)
//   approve     registrations.detail      — the reviewer sees the declared type + the list
//               registrations.review      — APPROVE needs a type (the reviewer's choice, else the declared one)
//   maintain    vehicles.update           — change it later (ACTIVE types only)
//   show/print  vehicles.list/listMine, qr.export — each vehicle carries its resolved sticker (detail: in its shared flow)
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

  // campaigns.validate / references.registration: decorated inside their shared flows (application/flows/RegistrationFlows.js)
  // registrations.submit: the person type is checked inside its shared flow (application/flows/RegistrationSubmitFlow.js)
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
  // vehicles.detail: decorated inside the shared detail flow (application/flows/VehicleReadFlows.js) — one source
  wrap('qr.export', (inner, p, a) => { const out = inner(p, a), l = list(); return {...out, items: out.items.map(x => withSticker(l, x))}; });
  return h;
}

// Settings-registry entry (system.config.get/update): the list with each colour's ink; codes are never deleted.
export const stickerSettings = () => ({
  keys: [STICKER_SETTING_KEY],
  view: store => ({[STICKER_SETTING_KEY]: loadStickerCategories(store).map(c => ({...c, ink: stickerInk(c.hex)}))}),
  prepare(values, store) {
    const next = parseStickerCategories(values[STICKER_SETTING_KEY]);
    if (loadStickerCategories(store).some(c => !next.some(n => n.code === c.code))) throw new Error('STICKER_CATEGORY_IN_USE'); // deactivate, never delete
    return {rows: [[STICKER_SETTING_KEY, JSON.stringify(next)]], audit: {action: 'STICKER_CATEGORIES_UPDATED'}};
  }
});
