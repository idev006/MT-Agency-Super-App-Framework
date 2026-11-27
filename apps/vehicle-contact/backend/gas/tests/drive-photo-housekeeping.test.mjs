// Drive photo housekeeping (owner 2026-11-25) as ONE shared flow (VC-ADR-046 phase 2c). Fake DriveApp + in-memory store; no
// network. The GAS editor runs it on Drive directly (sync runner); the core's job runs it async through the signed bridge.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {drivePhotoHousekeepingFlow, STAGING_TTL_DAYS, MIN_ORPHAN_AGE_HOURS} from '../src/application/flows/DrivePhotoHousekeepingFlow.js';
import {runFlowSync, runFlowAsync} from '../src/application/flows/FlowRunner.js';
import {createDrivePhotos} from '../src/infrastructure/media/DrivePhotos.js';
import {createMediaBridgeServer} from '../src/infrastructure/media/MediaBridgeServer.js';
import {nodeUtilities} from '../../cloudrun/runtime.mjs';
import {createMediaBridgeGateway} from '../../core/src/adapters/outbound/gateways/media-bridge.mjs';
import {JOBS} from '../../core/src/facade/jobs.mjs';

const NOW = Date.parse('2026-11-25T12:00:00Z'), DAY = 86400000, FOLDER = 'F', SECRET = 's'.repeat(40);
const utilities = nodeUtilities();
function setup() {
  const files = new Map();
  const file = (id, ageMs) => files.set(id, {id, trashed: false, created: new Date(NOW - ageMs)});
  file('f-photo', 30 * DAY); file('f-staged-old', 10 * DAY); file('f-staged-new', 1 * DAY); file('f-orphan-old', 3 * DAY); file('f-orphan-new', 3600000);
  const handle = f => ({getId: () => f.id, isTrashed: () => f.trashed, setTrashed: v => { f.trashed = v; }, getDateCreated: () => f.created});
  // a folder iterator with Drive's continuation token (token = position)
  const iterator = (start = 0) => { const list = [...files.values()]; let i = start;
    return {hasNext: () => i < list.length, next: () => handle(list[i++]), getContinuationToken: () => 'pos-' + i}; };
  const driveApp = {
    getFileById: id => { const f = files.get(id); if (!f) throw new Error('no file'); return handle(f); },
    getFolderById: id => { assert.equal(id, FOLDER); return {getFiles: () => iterator()}; },
    continueFileIterator: token => iterator(Number(String(token).slice(4)))
  };
  const tables = {
    vc_vehicle_photos: [{photo_id: 'p1', storage_ref: 'f-photo'}],
    vc_photo_staging: [{photo_id: 's-old', status: 'STAGED', created_at: new Date(NOW - 10 * DAY).toISOString(), storage_ref: 'f-staged-old'},
      {photo_id: 's-new', status: 'STAGED', created_at: new Date(NOW - 1 * DAY).toISOString(), storage_ref: 'f-staged-new'},
      {photo_id: 'p1', status: 'CLAIMED', created_at: new Date(NOW - 30 * DAY).toISOString(), storage_ref: 'f-photo'}],
  };
  const store = {list: t => (tables[t] || []).map(r => ({...r})), remove: (t, f) => { tables[t] = tables[t].filter(r => r.photo_id !== f.photo_id); return true; }};
  const asyncStore = {readMany: async reqs => reqs.map(r => store.list(r.name)), remove: async (t, f) => store.remove(t, f)};
  return {files, tables, driveApp, store, asyncStore};
}
const photosOf = (driveApp, pageSize) => { const p = createDrivePhotos({driveApp, utilities, folderId: FOLDER}); return {...p, list: t => p.list(t, pageSize)}; };
const run = (w, apply, pageSize = 500) => runFlowSync(drivePhotoHousekeepingFlow({apply, nowMs: NOW}), {store: w.store, media: photosOf(w.driveApp, pageSize)});
const trashedIds = files => [...files.values()].filter(f => f.trashed).map(f => f.id).sort();

test('HK-01 dry run reports, changes nothing', () => {
  const w = setup();
  const r = run(w, false);
  assert.equal(r.mode, 'DRY_RUN'); assert.equal(r.expiredStaging, 1); assert.equal(r.orphanFiles, 2, 'old orphan + the expired staged file');
  assert.equal(r.scanned, 5);
  assert.deepEqual(trashedIds(w.files), []); assert.equal(w.tables.vc_photo_staging.length, 3);
});

test(`HK-02 apply: STAGED > ${STAGING_TTL_DAYS} days → file trashed + row removed; orphan > ${MIN_ORPHAN_AGE_HOURS} h trashed; live and recent files kept`, () => {
  const w = setup();
  const r = run(w, true);
  assert.equal(r.status, 'PASS'); assert.equal(r.expiredStagingRemoved, 1);
  assert.deepEqual(trashedIds(w.files), ['f-orphan-old', 'f-staged-old']);
  assert.deepEqual(w.tables.vc_photo_staging.map(s => s.photo_id).sort(), ['p1', 's-new']);
  assert.equal(run(w, true).trashed, 0, 'idempotent');
});

test('HK-03 the folder is read page by page (continuation token): same result as one page', () => {
  const a = setup(), b = setup();
  assert.deepEqual(run(a, true, 2), run(b, true, 500));
  assert.deepEqual(trashedIds(a.files), trashedIds(b.files));
});

test('HK-04 a file that cannot be trashed: counted, its staging row kept, status PARTIAL', () => {
  const w = setup();
  const media = {...photosOf(w.driveApp), trash: ref => { if (ref === 'f-staged-old') throw new Error('drive'); return true; }};
  const r = runFlowSync(drivePhotoHousekeepingFlow({apply: true, nowMs: NOW}), {store: w.store, media});
  assert.equal(r.status, 'PARTIAL'); assert.equal(r.trashFailed, 1); assert.equal(r.expiredStagingRemoved, 0);
  assert.ok(w.tables.vc_photo_staging.some(s => s.photo_id === 's-old'));
});

test('HK-05 the core job (async, through the SIGNED bridge to the GAS bridge server) = the GAS editor run', async () => {
  const gasRun = setup(), coreRun = setup();
  const want = run(gasRun, true);
  const props = {VEHICLE_MEDIA_BRIDGE_SECRET: SECRET, VEHICLE_PHOTOS_FOLDER_ID: FOLDER};
  const server = createMediaBridgeServer({propertiesService: {getScriptProperties: () => ({getProperty: k => props[k] ?? null})}, utilities, driveApp: coreRun.driveApp});
  const ops = [];
  const http = {request: async ({body}) => { const req = JSON.parse(body); ops.push(req.op); return {json: server.handle(req)}; }};
  const media = createMediaBridgeGateway({http, secret: SECRET});
  const got = await JOBS['drive-photo-housekeeping']({store: coreRun.asyncStore, media, apply: true, nowMs: NOW});
  assert.deepEqual(got, want);
  assert.deepEqual(trashedIds(coreRun.files), trashedIds(gasRun.files));
  assert.deepEqual(coreRun.tables, gasRun.tables);
  assert.deepEqual([...new Set(ops)].sort(), ['list', 'trash'], 'the job uses only the bridge ops list + trash');
});

test('HK-06 bridge list: bad page token refused with a fixed code; flow refuses without a clock', async () => {
  const w = setup();
  assert.throws(() => createDrivePhotos({driveApp: w.driveApp, utilities, folderId: FOLDER}).list(''), /INVALID_PAGE_TOKEN/);
  assert.throws(() => runFlowSync(drivePhotoHousekeepingFlow({apply: false}), {store: w.store, media: photosOf(w.driveApp)}), /INVALID_CLOCK/);
  assert.throws(() => runFlowSync(drivePhotoHousekeepingFlow({apply: false, nowMs: NOW}), {store: w.store}), /MEDIA_NOT_CONFIGURED/);
});
