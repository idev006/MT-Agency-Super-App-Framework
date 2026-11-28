// Candidate-only proof. The current clasp deployment is not changed by this test.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {nodeUtilities} from '../../cloudrun/runtime.mjs';
import {mediaBridgeSignature} from '../src/infrastructure/media/MediaBridgeSignature.js';
import packageInfo from '../package.json' with {type: 'json'};

const gas = resolve(import.meta.dirname, '..');
const bridgeFile = resolve(gas, '../gas-bridge/dist/MediaBridge.gs');
const secret = 'synthetic-bridge-test-secret-0123456789-abcdef';
const folder = 'synthetic-photo-folder';
const utilities = nodeUtilities();

function boot() {
  execFileSync(process.execPath, [resolve(gas, 'scripts/build-bridge-candidate.mjs')], {cwd: gas});
  const files = new Map();
  let driveTouches = 0, next = 0;
  const drive = {
    Access: {ANYONE_WITH_LINK: 'LINK'}, Permission: {VIEW: 'VIEW'},
    getFolderById(id) {
      driveTouches++;
      assert.equal(id, folder);
      return {createFile(blob) {
        const ref = `photo-${++next}`;
        files.set(ref, {blob, trashed: false});
        return {getId: () => ref, setSharing() {}};
      }};
    },
    getFileById(ref) {
      driveTouches++;
      const file = files.get(ref);
      if (!file) throw new Error('missing synthetic file');
      return {getBlob: () => file.blob, setTrashed: value => { file.trashed = value; }};
    }
  };
  const props = {VEHICLE_MEDIA_BRIDGE_SECRET: secret, VEHICLE_PHOTOS_FOLDER_ID: folder};
  const context = vm.createContext({ContentService: {MimeType: {JSON: 'JSON'},
    createTextOutput(value) { return {value, setMimeType() { return this; }}; }},
    PropertiesService: {getScriptProperties: () => ({getProperty: key => props[key] || null})},
    Utilities: utilities, DriveApp: drive});
  new vm.Script(readFileSync(bridgeFile, 'utf8'), {filename: 'MediaBridge.gs'}).runInContext(context);
  const post = request => JSON.parse(context.doPost({postData: {contents: JSON.stringify(request)}}).value);
  const signed = (op, args) => {
    const ts = new Date().toISOString();
    return {bridge: 'media', op, ts, args, sig: mediaBridgeSignature({utilities, secret, op, ts, args})};
  };
  return {context, post, signed, files, driveTouches: () => driveTouches};
}

test('GAS-BRIDGE-01 candidate is one module: health and signed Drive round trip, no API or Firestore', () => {
  const h = boot();
  assert.equal(typeof h.context.UrlFetchApp, 'undefined');
  assert.equal(typeof h.context.SpreadsheetApp, 'undefined');
  const health = JSON.parse(h.context.doGet().value);
  assert.equal(health.data.bridgeVersion, packageInfo.version);
  assert.equal(health.data.service, 'p6vc-media-bridge');
  assert.equal(health.data.persistence, undefined, 'the bridge has no database');
  assert.equal(h.post({apiVersion: 'v1', group: 'auth', action: 'login', payload: {}}).error.code, 'NOT_FOUND');
  assert.equal(h.driveTouches(), 0, 'ordinary API calls never touch Drive');
  const jpeg = '/9j/' + Buffer.alloc(40, 7).toString('base64');
  const uploaded = h.post(h.signed('upload', {base64: jpeg, mime: 'image/jpeg'}));
  assert.equal(uploaded.ok, true);
  const ref = uploaded.data.storage_ref;
  assert.equal(h.post(h.signed('read', {storageRef: ref})).data.base64Image, jpeg);
  assert.equal(h.post(h.signed('trash', {storageRef: ref})).data.trashed, true);
  assert.equal(h.files.get(ref).trashed, true);
});

test('GAS-BRIDGE-02 unsigned and tampered requests fail before Drive access', () => {
  const h = boot();
  const args = {storageRef: 'photo-1'};
  assert.equal(h.post({bridge: 'media', op: 'read', ts: new Date().toISOString(), args, sig: '0'.repeat(64)}).error.code,
    'BRIDGE_UNAUTHORIZED');
  const valid = h.signed('read', args);
  assert.equal(h.post({...valid, args: {storageRef: 'photo-2'}}).error.code, 'BRIDGE_UNAUTHORIZED');
  assert.equal(h.driveTouches(), 0);
});

test('G1 (done): GAS gets only the bridge by default; putting the old API back is gated twice (VC-ADR-053/056)', () => {
  const lf = file => readFileSync(file, 'utf8').replace(/\r\n/g, '\n'); // a Windows checkout has CRLF
  const wf = lf(resolve(gas, '../../../../.github/workflows/deploy-vehicle-gas.yml'));
  assert.match(wf, /options: \[bridge, full\]/);
  assert.match(wf, /default: bridge/, 'the bridge is the default since G1');
  assert.match(wf, /inputs\.confirmation == 'PUSH_VEHICLE_GAS' && \(inputs\.artifact != 'full' \|\| inputs\.restore_api_files == 'RESTORE_GAS_API_FILES'\)/,
    'putting the old API back needs the second owner phrase');
  assert.match(wf, /if: inputs\.artifact == 'bridge'\n\s+run: \|\n\s+node scripts\/build-bridge-candidate\.mjs\n\s+rm -rf dist && mkdir dist/);
  assert.match(wf, /= "MediaBridge\.gs appsscript\.json "/, 'exactly two files are pushed');
  const sh = lf(resolve(gas, '../../../../scripts/p6vc-deploy-backend.sh'));
  assert.match(sh, /INDEXES=""; ARTIFACT=bridge/, 'the deploy chain pushes the bridge by default');
  assert.match(sh, /P6VC_OWNER_OK_RESTORE_GAS_FILES:-\}" != "RESTORE_GAS_API_FILES"/, 'the deploy script asks for the same confirmation');
  assert.match(sh, /verify-bridge-live\.mjs --expect "\$ARTIFACT"/, 'checked after the pin, with the rollback target printed');
});
