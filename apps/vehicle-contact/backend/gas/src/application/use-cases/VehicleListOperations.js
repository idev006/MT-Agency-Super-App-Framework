// Admin vehicle list + QR print state (owner 2026-11-26: "ที่หน้านี้ "พิมพ์ QR" ควร filter ได้นะ คิดในมุมมองของ actor"
// → "Build it (defaults)"). VC-ADR-042.
//   vehicles.list    optional filters: organizationId, stickerCategory, printState (NOT_PRINTED | PRINTED), plate.
//                    Equality filters → the requested window + a COUNT (indexes in contracts/firestore-indexes.v1.json).
//                    A plate search reads the few rows of that plate and filters the rest in memory.
//                    Rows carry organizationName, qrPrintState, qrPrintedAt; withFilterOptions adds the choices.
//   qr.markPrinted   the admin confirms after printing ("พิมพ์ครบแล้ว"): vehicles with an ACTIVE QR → PRINTED.
//   withPrintStateStore  every new ACTIVE QR (approval, qr.issue, qr.replace) puts the vehicle back to NOT_PRINTED,
//                        on whatever write path the use case takes (one place; no use case edits).
import {readPage} from '../pagination/Pagination.js';
import {loadStickerCategories} from '../../domain/policies/StickerCategoryPolicy.js';

export const PRINT_STATES = Object.freeze(['NOT_PRINTED', 'PRINTED']);
export const MARK_PRINTED_MAX = 100;
const NOT_PRINTED = {qr_print_state: 'NOT_PRINTED', qr_printed_at: ''};

export function withPrintStateStore(store) {
  const isNewQr = (table, data) => table === 'vc_qr_tokens' && data && data.status === 'ACTIVE' && data.vehicle_id;
  const vehicleRow = (table, data) => (table === 'vc_vehicles' && data && !data.qr_print_state ? {...NOT_PRINTED, ...data} : data);
  const wrap = s => {
    const out = {...s};
    out.insert = (table, data) => {
      const r = s.insert(table, vehicleRow(table, data));
      if (isNewQr(table, data)) s.update('vc_vehicles', {vehicle_id: data.vehicle_id}, NOT_PRINTED);
      return r;
    };
    if (typeof s.writeMany === 'function') out.writeMany = ops => {
      const created = new Set(ops.filter(o => o.op === 'insert' && o.table === 'vc_vehicles').map(o => String(o.data.vehicle_id)));
      const next = ops.map(o => (o.op === 'insert' ? {...o, data: vehicleRow(o.table, o.data)} : o));
      for (const o of ops) if (o.op === 'insert' && isNewQr(o.table, o.data) && !created.has(String(o.data.vehicle_id)))
        next.push({op: 'update', table: 'vc_vehicles', key: {vehicle_id: o.data.vehicle_id}, fields: NOT_PRINTED});
      return s.writeMany(next);
    };
    if (typeof s.sequence === 'function') out.sequence = fn => s.sequence(tx => fn(tx && typeof tx === 'object' ? wrap(tx) : tx));
    return Object.freeze(out);
  };
  return wrap(store);
}

const PLATE = /^[\p{L}\p{N}]{1,12}$/u;
const clean = v => (typeof v === 'string' ? v.trim() : '');

export function createVehicleListOperations({store, security}) {
  const readAll = reqs => (typeof store.readMany === 'function' ? store.readMany(reqs)
    : reqs.map(r => (r.kind === 'one' ? store.one(r.name, r.filter) : store.list(r.name, r.filter))));
  const listRow = v => ({vehicleId: v.vehicle_id, plate: v.plate_normalized, province: v.province_code, vehicleType: v.vehicle_type,
    brand: v.make, model: v.model, color: v.color, stickerCategory: v.sticker_category || '', status: v.status, version: Number(v.version),
    createdAt: v.created_at, organizationId: v.organization_id || '', qrPrintState: v.qr_print_state || 'NOT_PRINTED', qrPrintedAt: v.qr_printed_at || ''});

  function filters(p) {
    const f = {status: 'ACTIVE'};
    const org = clean(p.organizationId), type = clean(p.stickerCategory).toUpperCase(), state = clean(p.printState).toUpperCase();
    const plate = clean(p.plate).replace(/[\s-]/g, '');
    if (org) { if (org.length > 100) throw new Error('INVALID_FILTER'); f.organization_id = org; }
    if (type) { if (!/^[A-Z0-9_]{1,40}$/.test(type)) throw new Error('INVALID_FILTER'); f.sticker_category = type; }
    if (state) { if (!PRINT_STATES.includes(state)) throw new Error('INVALID_FILTER'); f.qr_print_state = state; }
    if (plate && !PLATE.test(plate)) throw new Error('INVALID_FILTER');
    // fields in the same (alphabetical) order as the declared composite indexes
    return {f: Object.fromEntries(Object.entries(f).sort(([a], [b]) => a.localeCompare(b))), plate};
  }

  // labels for the CURRENT page only: colour / vehicle type (reference ids) + organization names, one parallel round
  function withLabels(page) {
    const rows = Array.isArray(page) ? page : page.items;
    const refKeys = [...new Set(rows.flatMap(r => [r.color && 'COLOR-' + r.color, r.vehicleType && 'VEHICLE_TYPE-' + r.vehicleType]).filter(Boolean))];
    const orgIds = [...new Set(rows.map(r => r.organizationId).filter(Boolean))];
    const reqs = [...refKeys.map(k => ({kind: 'one', name: 'vc_reference_values', filter: {reference_id: 'REF-' + k}})),
      ...orgIds.map(o => ({kind: 'one', name: 'vc_organizations', filter: {organization_id: o}}))];
    const got = reqs.length ? readAll(reqs) : [];
    const label = new Map(refKeys.map((k, i) => [k, (got[i] && got[i].label_th) || '']));
    const org = new Map(orgIds.map((o, i) => [o, (got[refKeys.length + i] && got[refKeys.length + i].name) || '']));
    for (const r of rows) {
      r.colorLabel = label.get('COLOR-' + r.color) || ''; r.vehicleTypeLabel = label.get('VEHICLE_TYPE-' + r.vehicleType) || '';
      r.organizationName = org.get(r.organizationId) || '';
    }
    return page;
  }

  function filterOptions() {
    const orgs = store.list('vc_organizations', {status: 'ACTIVE'}).map(o => ({id: o.organization_id, name: o.name}))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'th'));
    const types = loadStickerCategories(store).map(c => ({code: c.code, label: c.label, colour: c.colour, hex: c.hex, size: c.size, active: c.active}));
    return {organizations: orgs, stickerCategories: types, printStates: PRINT_STATES};
  }

  function vehicleList(p) {
    const {f, plate} = filters(p);
    let page;
    if (plate) {
      // a plate is a few rows at most: read them by equality, apply the other filters in memory, page in memory
      const rows = store.list('vc_vehicles', {plate_normalized: plate, status: 'ACTIVE'})
        .filter(v => Object.entries(f).every(([k, val]) => k === 'qr_print_state' ? (v[k] || 'NOT_PRINTED') === val : v[k] === val));
      page = readPage({list: () => rows}, {name: 'vc_vehicles', map: listRow}, p, {defaultLimit: 50, maxLegacyLimit: 100});
    } else page = readPage(store, {name: 'vc_vehicles', filter: f, map: listRow}, p, {defaultLimit: 50, maxLegacyLimit: 100});
    withLabels(page);
    if (p.withFilterOptions === true && !Array.isArray(page)) return {...page, filterOptions: filterOptions()};
    return page;
  }

  function markPrinted(p, a) {
    const ids = Array.isArray(p.vehicleIds) ? [...new Set(p.vehicleIds.map(String))] : [];
    if (!ids.length || ids.length > MARK_PRINTED_MAX || ids.some(x => !/^[A-Za-z0-9_-]{1,100}$/.test(x))) throw new Error('INVALID_VEHICLE_IDS');
    const rows = readAll(ids.flatMap(v => [{kind: 'one', name: 'vc_vehicles', filter: {vehicle_id: v}},
      {kind: 'list', name: 'vc_qr_tokens', filter: {vehicle_id: v, status: 'ACTIVE'}}]));
    const at = security.now(), marked = [], skipped = [];
    ids.forEach((v, i) => {
      const vehicle = rows[2 * i], qrs = rows[2 * i + 1] || [];
      if (!vehicle || vehicle.status !== 'ACTIVE' || qrs.length !== 1) skipped.push(v); else marked.push(v);
    });
    const ops = marked.flatMap(v => [
      {op: 'update', table: 'vc_vehicles', key: {vehicle_id: v}, fields: {qr_print_state: 'PRINTED', qr_printed_at: at}},
      {op: 'insert', table: 'vc_change_audit', data: {audit_id: security.secretToken(), actor_id: a.userId, entity_type: 'qr', entity_id: v,
        action: 'QR_PRINTED', redacted_summary: 'QR_PRINTED', correlation_id: security.secretToken().slice(0, 16), created_at: at}}]);
    if (ops.length) {
      if (typeof store.writeMany === 'function') store.writeMany(ops);
      else store.sequence(() => { for (const o of ops) o.op === 'insert' ? store.insert(o.table, o.data) : store.update(o.table, o.key, o.fields); });
    }
    return {marked: marked.length, skipped, printedAt: at};
  }

  return Object.freeze({'vehicles.list': vehicleList, 'qr.markPrinted': markPrinted});
}
