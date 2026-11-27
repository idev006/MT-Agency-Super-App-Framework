// L4 Drive SSOT audit as ONE shared flow (VC-ADR-046 phase 2c-3): offline proof with a fake DriveApp + in-memory rows. The GAS
// editor runs it on Drive directly (sync); the core's job runs it async through the SIGNED bridge — same report.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {drivePhotoAuditFlow} from '../src/application/flows/DrivePhotoAuditFlow.js';
import {runFlowSync} from '../src/application/flows/FlowRunner.js';
import {createDrivePhotos} from '../src/infrastructure/media/DrivePhotos.js';
import {createMediaBridgeServer} from '../src/infrastructure/media/MediaBridgeServer.js';
import {nodeUtilities} from '../../cloudrun/runtime.mjs';
import {createMediaBridgeGateway} from '../../core/src/adapters/outbound/gateways/media-bridge.mjs';
import {JOBS} from '../../core/src/facade/jobs.mjs';

const FOLDER = 'FOLDER', SECRET = 's'.repeat(40), utilities = nodeUtilities();
function fakeDrive(files) {
  const inFolder = files.filter(f => (f.folder || FOLDER) === FOLDER);
  const mk = f => ({getId: () => f.id, isTrashed: () => !!f.trashed, getMimeType: () => f.mime, getSize: () => f.size, getDateCreated: () => new Date(0)});
  const iterator = (start = 0) => { let i = start; return {hasNext: () => i < inFolder.length, next: () => mk(inFolder[i++]), getContinuationToken: () => 'pos-' + i}; };
  return {getFolderById: id => { assert.equal(id, FOLDER); return {getFiles: () => iterator()}; }, continueFileIterator: t => iterator(Number(String(t).slice(4)))};
}
const store = (photos, staging) => ({list: t => t === 'vc_vehicle_photos' ? photos : staging});
const audit = (photos, staging, files, pageSize = 500) => {
  const p = createDrivePhotos({driveApp: fakeDrive(files), utilities, folderId: FOLDER});
  return runFlowSync(drivePhotoAuditFlow(), {store: store(photos, staging), media: {...p, list: t => p.list(t, pageSize)}});
};

test('AUDIT-01 PASS when every live row has its file (in the folder, mime, size); orphans are reported, not failed', () => {
  const files = [{id: 'f1', mime: 'image/png', size: 70}, {id: 'f2', mime: 'image/png', size: 70}, {id: 'orphan1', mime: 'image/png', size: 5}];
  const r = audit([{photo_id: 'p1', storage_ref: 'f1', status: 'ACTIVE', mime_type: 'image/png', size_bytes: 70}],
    [{photo_id: 'p1', storage_ref: 'f1', status: 'CLAIMED', mime_type: 'image/png', size_bytes: 70}, {photo_id: 'p2', storage_ref: 'f2', status: 'STAGED', mime_type: 'image/png', size_bytes: 70}], files);
  assert.equal(r.status, 'PASS'); assert.equal(r.folder.unreferencedFiles, 1); assert.equal(r.folder.scanned, 3);
});

test('AUDIT-02 FAIL on missing / not in the folder, trashed, mime/size mismatch and staging→photo ref drift', () => {
  const files = [{id: 't', mime: 'image/png', size: 1, trashed: true}, {id: 'w', mime: 'image/png', size: 1, folder: 'OTHER'}, {id: 'm', mime: 'image/jpeg', size: 1}, {id: 's', mime: 'image/png', size: 2}, {id: 'x', mime: 'image/png', size: 1}];
  const row = (id, ref) => ({photo_id: id, storage_ref: ref, status: 'ACTIVE', mime_type: 'image/png', size_bytes: 1});
  const r = audit([row('a', 'gone'), row('b', 't'), row('c', 'w'), row('d', 'm'), row('e', 's'), row('f', 'x')], [{photo_id: 'f', storage_ref: 'other', status: 'REVOKED'}], files);
  assert.equal(r.status, 'FAIL');
  assert.deepEqual(r.issues, {missing: 2, trashed: 1, mimeMismatch: 1, sizeMismatch: 1, stagingRefMismatch: 1}, 'gone + moved to another folder = missing');
});

test('AUDIT-03 photos.replace history (version 2, old file trashed, CLAIMED staging on the old file) is NOT a defect', () => {
  const files = [{id: 'new', mime: 'image/png', size: 2}, {id: 'old', mime: 'image/png', size: 1, trashed: true}];
  const r = audit([{photo_id: 'p1', storage_ref: 'new', status: 'ACTIVE', version: 2, mime_type: 'image/png', size_bytes: 2}],
    [{photo_id: 'p1', storage_ref: 'old', status: 'CLAIMED', mime_type: 'image/png', size_bytes: 1}], files);
  assert.equal(r.status, 'PASS'); assert.equal(r.checked.replacedPhotos, 1);
});

test('AUDIT-04 paging gives the same report; the core job through the SIGNED bridge = the GAS editor run', async () => {
  const files = [{id: 'f1', mime: 'image/png', size: 70}, {id: 'f2', mime: 'image/png', size: 9}, {id: 'o', mime: 'image/png', size: 5}];
  const photos = [{photo_id: 'p1', storage_ref: 'f1', status: 'ACTIVE', mime_type: 'image/png', size_bytes: 70}, {photo_id: 'p2', storage_ref: 'f2', status: 'ACTIVE', mime_type: 'image/png', size_bytes: 8}];
  const want = audit(photos, [], files);
  assert.equal(want.status, 'FAIL'); assert.deepEqual(audit(photos, [], files, 1), want, 'one file per page');
  const props = {VEHICLE_MEDIA_BRIDGE_SECRET: SECRET, VEHICLE_PHOTOS_FOLDER_ID: FOLDER};
  const server = createMediaBridgeServer({propertiesService: {getScriptProperties: () => ({getProperty: k => props[k] ?? null})}, utilities, driveApp: fakeDrive(files)});
  const ops = [];
  const media = createMediaBridgeGateway({secret: SECRET, http: {request: async ({body}) => { const q = JSON.parse(body); ops.push(q.op); return {json: server.handle(q)}; }}});
  const asyncStore = {readMany: async reqs => reqs.map(r => store(photos, []).list(r.name))};
  assert.deepEqual(await JOBS['drive-photo-audit']({store: asyncStore, media}), want);
  assert.deepEqual([...new Set(ops)], ['list'], 'read-only: the audit uses only the bridge op list');
});
