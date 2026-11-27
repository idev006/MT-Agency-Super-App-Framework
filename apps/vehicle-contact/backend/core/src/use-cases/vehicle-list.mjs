// VC-ADR-042 admin vehicle list + QR print state, as native async use cases (VC-ADR-051 N1a). The rules (filters, row
// shape, labels, the print plan) are the legacy engine's pure functions (VehicleListOperations.js); here the reads run in
// parallel rounds on the core store:
//   vehicles.list   round 1: the page window + COUNT + the sticker list (+ ACTIVE organizations when withFilterOptions)
//                   round 2: the page's labels (colour / vehicle type / organization names)
//   qr.markPrinted  round 1: each vehicle + its ACTIVE QRs; then one batch write (PRINTED + an audit row each)
import {pageWindow, pageOf} from '../../../gas/src/application/pagination/Pagination.js';
import {vehicleListFilters, vehicleListRow, matchesFilters, pageLabelPlan, filterOptionsOf, markPrintedIds, markPrintedReads, markPrintedPlan}
  from '../../../gas/src/application/use-cases/VehicleListOperations.js';
import {STICKER_SETTING_KEY, stickerCategoriesFrom, resolveSticker} from '../../../gas/src/domain/policies/StickerCategoryPolicy.js';

const PAGE_OPTIONS = {defaultLimit: 50, maxLegacyLimit: 100};

export async function vehiclesList(p, _principal, {store}) {
  const {f, plate} = vehicleListFilters(p);
  const w = pageWindow(p, PAGE_OPTIONS);
  const options = p.withFilterOptions === true;
  const reqs = [{kind: 'one', name: 'vc_settings', filter: {key: STICKER_SETTING_KEY}},
    ...(options ? [{kind: 'list', name: 'vc_organizations', filter: {status: 'ACTIVE'}}] : []),
    ...(plate
      // a plate is a few rows at most: read them by equality, the other filters in memory, page in memory
      ? [{kind: 'list', name: 'vc_vehicles', filter: {plate_normalized: plate, status: 'ACTIVE'}}]
      : [{kind: 'list', name: 'vc_vehicles', filter: f, limit: w.n}, {kind: 'count', name: 'vc_vehicles', filter: f}])];
  const got = await store.readMany(reqs);
  const stickers = stickerCategoriesFrom(got[0]);
  const orgRows = options ? got[1] || [] : null;
  const rest = got.slice(options ? 2 : 1);
  let page;
  if (plate) {
    const rows = (rest[0] || []).filter(matchesFilters(f));
    page = pageOf(rows.slice(0, w.n).map(vehicleListRow), rows.length, w);
  } else page = pageOf((rest[0] || []).map(vehicleListRow), Number(rest[1]), w);
  const labels = pageLabelPlan(Array.isArray(page) ? page : page.items);
  labels.apply(labels.reqs.length ? await store.readMany(labels.reqs) : []);
  const out = options && !Array.isArray(page) ? {...page, filterOptions: filterOptionsOf(orgRows, stickers)} : page;
  // each vehicle carries its resolved sticker (person type / colour) — the legacy withStickerCategories decoration
  const withSticker = row => ({...row, sticker: resolveSticker(row.stickerCategory, stickers)});
  return Array.isArray(out) ? out.map(withSticker) : {...out, items: (out.items || []).map(withSticker)};
}

export async function qrMarkPrinted(p, a, {store, now, id}) {
  const ids = markPrintedIds(p);
  const {ops, marked, skipped, at} = markPrintedPlan(ids, await store.readMany(markPrintedReads(ids)), {at: now(), actorId: a.userId, id});
  if (ops.length) await store.writeMany(ops);
  return {marked: marked.length, skipped, printedAt: at};
}
