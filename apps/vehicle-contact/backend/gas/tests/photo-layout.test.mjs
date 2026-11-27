// VC-ADR-050: an approved vehicle's photos in their own Drive folder, named by side, shared by link. Fake Drive with real folders.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vehicleFolderPath, photoFileName, organizeRequest, VEHICLES_FOLDER} from '../src/domain/policies/PhotoLayout.js';
import {createDrivePhotos} from '../src/infrastructure/media/DrivePhotos.js';
import {createMediaBridgeServer} from '../src/infrastructure/media/MediaBridgeServer.js';
import {nodeUtilities} from '../../cloudrun/runtime.mjs';
import {createMediaBridgeGateway} from '../../core/src/adapters/outbound/gateways/media-bridge.mjs';
import {createAcceptanceHarness, assertOk} from './acceptance-fixture.mjs';

const ROOT = 'ROOT', utilities = nodeUtilities();
function fakeDrive() {
  let n = 0;
  const folders = new Map(), files = new Map();
  const folder = (name, parent) => { const f = {id: 'fo' + (++n), name, parent, trashed: false, sharing: null}; folders.set(f.id, f); return f; };
  folders.set(ROOT, {id: ROOT, name: 'photos', parent: null, trashed: false});
  const Access = {ANYONE_WITH_LINK: 'ANYONE_WITH_LINK'}, Permission = {VIEW: 'VIEW'};
  const iter = list => { let i = 0; return {hasNext: () => i < list.length, next: () => list[i++]}; };
  const fo = f => ({getId: () => f.id, getName: () => f.name, setName: v => { f.name = v; }, isTrashed: () => f.trashed,
    setSharing: (a, p) => { f.sharing = a + ':' + p; },
    getFoldersByName: name => iter([...folders.values()].filter(x => x.parent === f.id && x.name === name).map(fo)),
    createFolder: name => fo(folder(name, f.id))});
  const fi = f => ({getId: () => f.id, getName: () => f.name, setName: v => { f.name = v; }, moveTo: target => { f.parent = target.getId(); },
    setSharing: (a, p) => { f.sharing = a + ':' + p; }, isTrashed: () => f.trashed, getMimeType: () => 'image/jpeg', getSize: () => 100});
  const addFile = (id, name) => files.set(id, {id, name, parent: ROOT, trashed: false, sharing: null});
  return {folders, files, addFile, Access, Permission,
    getFolderById: id => { const f = folders.get(id); if (!f) throw new Error('no folder'); return fo(f); },
    getFileById: id => { const f = files.get(id); if (!f) throw new Error('no file'); return fi(f); }};
}
const vehicle = {vehicle_id: '7b05bc5a21ba0037e3db', plate_normalized: 'กข1234', province_code: 'TH-10'};
const photos = ['FRONT', 'REAR', 'LEFT', 'RIGHT', 'FRONT_ANGLE'].map((slot, i) => ({storage_ref: 'f' + i, slot, mime_type: 'image/jpeg', status: 'ACTIVE'}));

test('PL-01 names: รถ/<province>/<province> <plate> · <id 8>/<SIDE>.<ext>; unsafe characters cleaned; bad input refused', () => {
  assert.deepEqual(vehicleFolderPath(vehicle), [VEHICLES_FOLDER, 'TH-10', 'TH-10 กข1234 · 7b05bc5a']);
  assert.deepEqual(vehicleFolderPath({...vehicle, plate_normalized: 'กข/12*34'}).at(-1), 'TH-10 กข 12 34 · 7b05bc5a');
  assert.equal(photoFileName('FRONT_ANGLE', 'image/jpeg'), 'FRONT_ANGLE.jpg'); assert.equal(photoFileName('REAR', 'image/png'), 'REAR.png');
  for (const bad of [() => photoFileName('ROOF', 'image/jpeg'), () => photoFileName('FRONT', 'image/gif'), () => vehicleFolderPath({...vehicle, vehicle_id: 'short'})])
    assert.throws(bad, /INVALID_PHOTO_LAYOUT/);
  assert.deepEqual(organizeRequest(vehicle, photos).files.map(f => f.name), ['FRONT.jpg', 'REAR.jpg', 'LEFT.jpg', 'RIGHT.jpg', 'FRONT_ANGLE.jpg']);
});

test('PL-02 organize: folders created once, files moved + renamed + shared by link (ids unchanged); a second run changes nothing; a plate fix renames the folder', () => {
  const d = fakeDrive(); photos.forEach(p => d.addFile(p.storage_ref, 'random-upload-name.jpg'));
  const drive = createDrivePhotos({driveApp: d, utilities, folderId: ROOT});
  const {folderId} = drive.organize(organizeRequest(vehicle, photos));
  const path = []; for (let f = d.folders.get(folderId); f; f = d.folders.get(f.parent)) path.unshift(f.name);
  assert.deepEqual(path, ['photos', 'รถ', 'TH-10', 'TH-10 กข1234 · 7b05bc5a']);
  for (const p of photos) { const f = d.files.get(p.storage_ref);
    assert.equal(f.parent, folderId); assert.equal(f.name, p.slot + '.jpg'); assert.equal(f.sharing, 'ANYONE_WITH_LINK:VIEW'); }
  assert.equal(d.folders.get(folderId).sharing, 'ANYONE_WITH_LINK:VIEW');
  const folderCount = d.folders.size;
  assert.equal(drive.organize(organizeRequest(vehicle, photos)).folderId, folderId); assert.equal(d.folders.size, folderCount, 'no duplicate folders');
  assert.equal(drive.organize(organizeRequest({...vehicle, plate_normalized: 'กข1235'}, photos, folderId)).folderId, folderId);
  assert.equal(d.folders.get(folderId).name, 'TH-10 กข1235 · 7b05bc5a', 'kept folder, new name');
  assert.throws(() => drive.organize({path: ['a', 'b'], files: []}), /INVALID_PHOTO_LAYOUT/);
  assert.deepEqual(drive.stat(['f0', 'gone']).files.map(f => f.exists), [true, false]);
});

test('PL-03 the core gateway reaches organize + stat through the SIGNED bridge', async () => {
  const d = fakeDrive(); photos.forEach(p => d.addFile(p.storage_ref, 'x.jpg'));
  const props = {VEHICLE_MEDIA_BRIDGE_SECRET: 's'.repeat(40), VEHICLE_PHOTOS_FOLDER_ID: ROOT};
  const server = createMediaBridgeServer({propertiesService: {getScriptProperties: () => ({getProperty: k => props[k] ?? null})}, utilities, driveApp: d});
  const gw = createMediaBridgeGateway({secret: 's'.repeat(40), http: {request: async ({body}) => ({json: server.handle(JSON.parse(body))})}});
  const {folderId} = await gw.organize(organizeRequest(vehicle, photos));
  assert.equal(d.files.get('f0').parent, folderId);
  assert.deepEqual((await gw.stat(['f0'])).files[0].exists, true);
});

test('PL-04 approval organizes the new vehicle\'s photos and stores the folder id; a Drive failure never undoes the approval', () => {
  for (const failing of [false, true]) {
    const h = createAcceptanceHarness();
    const calls = [];
    h.drivePhotos.organize = req => { calls.push(req); if (failing) throw new Error('drive down'); return {folderId: 'folder-1'}; };
    const org = h.createOrganization(), camp = h.createCampaign();
    const r = assertOk(assert, h.call('registrations.submit', h.registrationPayload(camp.campaignToken, org, h.stagePhotos(camp.campaignToken))), 'submit');
    const v = assertOk(assert, h.as('reg', 'registrations.review', {requestId: r.requestId, decision: 'APPROVE', stickerCategory: 'NCO', platePhotoVerified: true}), 'approve');
    assert.equal(calls.length, 1); assert.equal(calls[0].files.length, 5);
    assert.deepEqual(calls[0].files.map(f => f.name).sort(), ['FRONT.png', 'FRONT_ANGLE.png', 'LEFT.png', 'REAR.png', 'RIGHT.png']);
    assert.equal(h.store.one('vc_vehicles', {vehicle_id: v.vehicleId}).photo_folder_id || '', failing ? '' : 'folder-1');
    assert.equal(h.store.one('vc_vehicles', {vehicle_id: v.vehicleId}).status, 'ACTIVE', 'approved either way');
  }
});
