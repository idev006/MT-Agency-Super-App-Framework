// Drive photo housekeeping (owner 2026-11-25). Fake DriveApp + in-memory store; no network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {housekeepDrivePhotos, STAGING_TTL_DAYS, MIN_ORPHAN_AGE_HOURS} from '../src/infrastructure/media/DrivePhotoHousekeeping.js';

const NOW = Date.parse('2026-11-25T12:00:00Z'), DAY = 86400000;
function setup() {
  const files = new Map();
  const file = (id, ageMs) => files.set(id, {id, trashed: false, created: new Date(NOW - ageMs)});
  file('f-photo', 30 * DAY); file('f-staged-old', 10 * DAY); file('f-staged-new', 1 * DAY); file('f-orphan-old', 3 * DAY); file('f-orphan-new', 3600000);
  const driveApp = {
    getFileById: id => { const f = files.get(id); if (!f) throw new Error('no file'); return {isTrashed: () => f.trashed, setTrashed: v => { f.trashed = v; }}; },
    getFolderById: () => { const list = [...files.values()]; let i = 0;
      return {getFiles: () => ({hasNext: () => i < list.length, next: () => { const f = list[i++]; return {getId: () => f.id, isTrashed: () => f.trashed, setTrashed: v => { f.trashed = v; }, getDateCreated: () => f.created}; }})}; },
  };
  const tables = {
    vc_vehicle_photos: [{photo_id: 'p1', storage_ref: 'f-photo'}],
    vc_photo_staging: [{photo_id: 's-old', status: 'STAGED', created_at: new Date(NOW - 10 * DAY).toISOString(), storage_ref: 'f-staged-old'},
      {photo_id: 's-new', status: 'STAGED', created_at: new Date(NOW - 1 * DAY).toISOString(), storage_ref: 'f-staged-new'},
      {photo_id: 'p1', status: 'CLAIMED', created_at: new Date(NOW - 30 * DAY).toISOString(), storage_ref: 'f-photo'}],
  };
  const store = {list: t => (tables[t] || []).map(r => ({...r})), remove: (t, f) => { tables[t] = tables[t].filter(r => r.photo_id !== f.photo_id); return true; }};
  return {files, tables, driveApp, store};
}

test('HK-01 dry run reports, changes nothing', () => {
  const {files, tables, driveApp, store} = setup();
  const r = housekeepDrivePhotos({store, driveApp, folderId: 'F', nowMs: NOW});
  assert.equal(r.mode, 'DRY_RUN'); assert.equal(r.expiredStaging, 1); assert.equal(r.orphanFiles, 2, 'old orphan + the expired staged file');
  assert.ok([...files.values()].every(f => !f.trashed)); assert.equal(tables.vc_photo_staging.length, 3);
});

test(`HK-02 apply: STAGED > ${STAGING_TTL_DAYS} days → file trashed + row removed; orphan > ${MIN_ORPHAN_AGE_HOURS} h trashed; live and recent files kept`, () => {
  const {files, tables, driveApp, store} = setup();
  const r = housekeepDrivePhotos({store, driveApp, folderId: 'F', nowMs: NOW, apply: true});
  assert.equal(r.status, 'PASS'); assert.equal(r.expiredStagingRemoved, 1);
  const trashed = [...files.values()].filter(f => f.trashed).map(f => f.id).sort();
  assert.deepEqual(trashed, ['f-orphan-old', 'f-staged-old']);
  assert.deepEqual(tables.vc_photo_staging.map(s => s.photo_id).sort(), ['p1', 's-new']);
  const again = housekeepDrivePhotos({store, driveApp, folderId: 'F', nowMs: NOW, apply: true});
  assert.equal(again.trashed, 0, 'idempotent');
});

test('HK-03 refuses without configuration', () => {
  assert.throws(() => housekeepDrivePhotos({store: {}, driveApp: {}, folderId: ''}), /DRIVE_HOUSEKEEPING_NOT_CONFIGURED/);
});
