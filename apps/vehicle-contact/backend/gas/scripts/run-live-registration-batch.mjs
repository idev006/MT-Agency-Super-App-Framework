// Live registration batch (owner 2026-11-26: "automate test ด้วยการรับลงทะเบียนรถ 20 รายการ ส่วนภาพให้สร้างโดยมีคำระบุ
// ด้านอยู่บนภาพ ... ทุกคันใช้ภาพเดียวกันในการอัพโหลด"; answers: real test system via API, submit + approve with mixed types).
// Through the Cloudflare Worker (the same path as the web app):
//   campaign → per vehicle: upload the 5 labelled photos (scripts/fixtures/registration-photos) → submit (real reference
//   codes + reference version; 2 of 3 declare a person type, the rest leave it to the reviewer) → approve (reviewer sets
//   the type when none was declared) → check: vehicles.list, detail (5 photos), qr.export READY with the type's colour.
// Synthetic data only (plates start with ฑฆ = synthetic prefix; contact names say "ทดสอบอัตโนมัติ"). The reset button or the
// purge tool removes it. Report: test-results/p6vc-live-registration-batch.json (no passwords, tokens or QR codes).
//   P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV node scripts/run-live-registration-batch.mjs [--count 20]
import './load-env.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';

const endpoint = process.env.P6VC_WORKER_FRONTEND_URL;
const origin = process.env.P6VC_FRONTEND_ORIGIN || 'https://idev006.github.io';
const user = process.env.P6VC_ADMIN_USER, password = process.env.P6VC_ADMIN_PASS;
const argCount = process.argv.indexOf('--count');
const COUNT = argCount > 0 ? Number(process.argv[argCount + 1]) : 20;
assert.match(endpoint || '', /^https:\/\/[a-z0-9.-]+\.workers\.dev\/api\/frontend$/, 'P6VC_WORKER_FRONTEND_URL must be the Worker /api/frontend endpoint');
assert.ok(user && password, 'P6VC_ADMIN_USER and P6VC_ADMIN_PASS are required (gitignored .env)');
assert.equal(process.env.P6VC_ALLOW_OWNER_DEV_WRITES, 'RUN_SYNTHETIC_OWNER_DEV', 'owner-dev synthetic write guard is required');
assert.ok(Number.isInteger(COUNT) && COUNT >= 1 && COUNT <= 100, '--count 1..100');

const SLOTS = ['FRONT', 'REAR', 'LEFT', 'RIGHT', 'FRONT_ANGLE'];
const photoDir = new URL('./fixtures/registration-photos/', import.meta.url);
const PHOTOS = Object.fromEntries(SLOTS.map(s => [s, fs.readFileSync(new URL(s + '.jpg', photoDir)).toString('base64')]));
const TYPES = ['GENERAL_OFFICER', 'SENIOR_OFFICER', 'JUNIOR_OFFICER', 'NCO', 'CO_RESIDENT', 'PUBLIC'];

let sessionToken = null;
async function call(operation, payload = {}, {auth = true} = {}) {
  const [group, ...rest] = operation.split('.');
  const body = {apiVersion: 'v1', group, action: rest.join('.'), payload, requestId: randomUUID(), ...(auth && sessionToken ? {sessionToken} : {})};
  const res = await fetch(endpoint, {method: 'POST', headers: {'content-type': 'application/json', origin, accept: 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(90000)});
  return res.json();
}
const ok = (j, label) => { if (!j.ok) throw new Error(label + ' -> ' + JSON.stringify(j.error)); return j.data; };
const report = {startedAt: new Date().toISOString(), endpoint, count: COUNT, vehicles: [], checks: {}, timings: {}};
const persist = () => { fs.mkdirSync('test-results', {recursive: true}); fs.writeFileSync('test-results/p6vc-live-registration-batch.json', JSON.stringify(report, null, 2) + '\n'); };
const pick = (list, i) => list[i % list.length];

try {
  sessionToken = ok(await call('auth.login', {username: user, password}, {auth: false}), 'login').sessionToken;
  report.backendVersion = ok(await call('system.health', {}, {auth: false}), 'health').backendVersion;
  const refs = ok(await call('references.registration'), 'references');
  const L = refs.lists;
  for (const k of ['provinces', 'plateTypes', 'vehicleTypes', 'relationships', 'brands', 'colors']) assert.ok(L[k]?.length, 'reference list ' + k);
  assert.ok(refs.organizations?.length, 'an ACTIVE organization is needed');
  const t = Date.now();
  const camp = ok(await call('campaigns.create', {name: `ทดสอบอัตโนมัติ ลงทะเบียน ${COUNT} คัน ${new Date(t).toISOString().slice(0, 16)}`,
    startsAt: new Date(t - 60000).toISOString(), endsAt: new Date(t + 6 * 3600000).toISOString(), maxSubmissions: COUNT + 5}), 'campaign');
  report.campaignId = camp.campaignId;
  // 4-digit plate numbers from the clock: a new range each run (a taken plate is retried with the next number)
  let plateNo = 1000 + (Math.floor(t / 1000) % 8000);
  const started = Date.now();
  for (let i = 0; i < COUNT; i++) {
    const v0 = Date.now();
    const photos = await Promise.all(SLOTS.map(async slot => ({slot, photoId: ok(await call('photos.upload',
      {campaignToken: camp.campaignToken, slot, base64Image: PHOTOS[slot], mimeType: 'image/jpeg'}, {auth: false}), 'upload ' + slot).photoId})));
    const brand = pick(L.brands, i * 7), models = (L.models || []).filter(m => m.parentCode === brand.code);
    const declared = i % 3 !== 2 ? pick(TYPES, i) : ''; // every third vehicle: no declared type → the reviewer sets it
    let sub, plate;
    for (let attempt = 0; attempt < 5; attempt++) {
      plate = 'ฑฆ' + (plateNo++);
      sub = await call('registrations.submit', {campaignToken: camp.campaignToken, plate, province: pick(L.provinces, i * 11).code,
        plateType: L.plateTypes[0].code, vehicleType: pick(L.vehicleTypes, i).code, brand: brand.code, model: models[0]?.code || models[0]?.label || 'ทดสอบ',
        color: pick(L.colors, i * 3).code, organizationId: pick(refs.organizations, i).code, relationship: pick(L.relationships, i).code,
        contactName: `ผู้ประสานงานทดสอบอัตโนมัติ ${i + 1}`, contactPhone: `+6680${String(1000000 + i).padStart(7, '0')}`,
        photos, idempotencyKey: `batch-${t}-${i}-${attempt}`, referenceVersion: refs.version, ...(declared ? {stickerCategory: declared} : {})}, {auth: false});
      if (sub.ok || sub.error?.code !== 'DUPLICATE_VEHICLE') break;
    }
    const s = ok(sub, 'submit ' + plate);
    const type = declared || pick(TYPES, i);
    const rev = ok(await call('registrations.review', {requestId: s.requestId, decision: 'APPROVE', platePhotoVerified: true,
      ...(declared ? {} : {stickerCategory: type})}), 'approve ' + plate);
    assert.equal(rev.status, 'APPROVED');
    report.vehicles.push({n: i + 1, plate, vehicleId: rev.vehicleId, declaredType: declared || null, type, ms: Date.now() - v0});
    console.log(`REGISTERED ${i + 1}/${COUNT} ${plate} type=${type}${declared ? '' : ' (set by reviewer)'} ${Date.now() - v0}ms`);
  }
  report.timings.totalMs = Date.now() - started;
  report.timings.perVehicleMs = Math.round(report.timings.totalMs / COUNT);

  // checks through the API (an independent Firestore read-back follows in the run notes)
  const ids = report.vehicles.map(v => v.vehicleId);
  const exp = ok(await call('qr.export', {vehicleIds: ids}), 'qr.export');
  const byId = new Map(exp.items.map(x => [x.vehicleId, x]));
  report.checks.qrExportReady = exp.items.filter(x => x.status === 'READY').length;
  report.checks.typeMatches = report.vehicles.filter(v => byId.get(v.vehicleId)?.sticker?.code === v.type).length;
  const d = ok(await call('vehicles.detail', {vehicleId: ids[0]}), 'detail');
  report.checks.firstVehiclePhotos = (d.photos || []).length;
  report.checks.firstVehicleSticker = d.sticker ? `${d.sticker.label} ${d.sticker.hex} ${d.sticker.size}cm` : null;
  const pass = report.checks.qrExportReady === COUNT && report.checks.typeMatches === COUNT && report.checks.firstVehiclePhotos === 5;
  report.result = pass ? 'PASS' : 'FAIL';
  console.log('BATCH ' + JSON.stringify({result: report.result, ...report.checks, ...report.timings}));
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  report.result = 'ERROR'; report.error = String(e.message).slice(0, 300); console.log('BATCH_ERROR ' + report.error); process.exitCode = 1;
} finally {
  if (sessionToken) { try { await call('auth.logout'); } catch {} sessionToken = null; }
  report.finishedAt = new Date().toISOString(); persist();
}
