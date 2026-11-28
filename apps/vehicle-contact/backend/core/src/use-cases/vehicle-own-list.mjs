// N1b: the owner list is scoped by the authorized session identity, with a bounded page and COUNT in one read round.
import {pageWindow, pageOf} from '../../../gas/src/application/pagination/Pagination.js';
import {STICKER_SETTING_KEY, stickerCategoriesFrom, resolveSticker}
  from '../../../gas/src/domain/policies/StickerCategoryPolicy.js';

const PAGE_OPTIONS = {defaultLimit: 50, maxLegacyLimit: 100};
const rowOf = v => ({vehicleId: v.vehicle_id, plate: v.plate_normalized, province: v.province_code,
  vehicleType: v.vehicle_type, brand: v.make, model: v.model, color: v.color,
  stickerCategory: v.sticker_category || '', status: v.status, version: Number(v.version)});

export async function vehiclesListMine(p, actor, {store}) {
  const window = pageWindow(p, PAGE_OPTIONS);
  const filter = {owner_user_id: String(actor.userId), status: 'ACTIVE'};
  const [setting, rows, total] = await store.readMany([
    {kind: 'one', name: 'vc_settings', filter: {key: STICKER_SETTING_KEY}},
    {kind: 'list', name: 'vc_vehicles', filter, limit: window.n},
    {kind: 'count', name: 'vc_vehicles', filter}
  ]);
  const stickers = stickerCategoriesFrom(setting);
  const page = pageOf((rows || []).map(rowOf), Number(total), window);
  const decorate = row => ({...row, sticker: resolveSticker(row.stickerCategory, stickers)});
  return Array.isArray(page) ? page.map(decorate) : {...page, items: page.items.map(decorate)};
}
