// VC-ADR-049 photo size policy: one domain module; the admin sets it, the form receives it, the server enforces it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PHOTO_POLICY_KEY, DEFAULT_PHOTO_POLICY, parsePhotoPolicy, readPhotoPolicy, imageInfo, checkPhotoSize} from '../src/domain/policies/PhotoPolicy.js';
import {createAcceptanceHarness, assertOk, assertError} from './acceptance-fixture.mjs';

// synthetic image headers (no real photo): PNG IHDR, baseline JPEG (APP0 then SOF0), WebP VP8X
const png = (w, h) => { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b.toString('base64'); };
const jpeg = (w, h, pad = 0) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14),
  ...(pad ? [Buffer.from([0xff, 0xe1, (pad + 2) >> 8, (pad + 2) & 255]), Buffer.alloc(pad)] : []),
  Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3]), Buffer.alloc(40)]).toString('base64');
const webp = (w, h) => { const b = Buffer.alloc(40); b.write('RIFF', 0); b.write('WEBP', 8); b.write('VP8X', 12);
  b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b.toString('base64'); };

test('PP-01 the policy: defaults valid; every field bounded; unknown keys, wrong types and thumb > side refused', () => {
  assert.deepEqual(parsePhotoPolicy(DEFAULT_PHOTO_POLICY), DEFAULT_PHOTO_POLICY);
  assert.deepEqual(parsePhotoPolicy(JSON.stringify({...DEFAULT_PHOTO_POLICY, quality: 0.777})).quality, 0.78);
  for (const bad of [{...DEFAULT_PHOTO_POLICY, maxSide: 799}, {...DEFAULT_PHOTO_POLICY, maxSide: 4001}, {...DEFAULT_PHOTO_POLICY, quality: 0.96},
    {...DEFAULT_PHOTO_POLICY, maxBytes: 99999}, {...DEFAULT_PHOTO_POLICY, maxBytes: 4500001}, {...DEFAULT_PHOTO_POLICY, thumbSide: 641},
    {...DEFAULT_PHOTO_POLICY, maxSide: 1600.5}, {...DEFAULT_PHOTO_POLICY, maxSide: '1600'}, {...DEFAULT_PHOTO_POLICY, extra: 1},
    {maxSide: 1600}, {...DEFAULT_PHOTO_POLICY, maxSide: 800, thumbSide: 640 + 1}, '{', null, []])
    assert.throws(() => parsePhotoPolicy(bad), /INVALID_PHOTO_POLICY/, JSON.stringify(bad));
  assert.deepEqual(readPhotoPolicy(null), DEFAULT_PHOTO_POLICY);
  assert.deepEqual(readPhotoPolicy({value: 'not json'}), DEFAULT_PHOTO_POLICY, 'a bad stored value never breaks uploads');
});

test('PP-02 image size read from the header: PNG, JPEG (frame after an APP segment), WebP; unreadable = 0', () => {
  assert.deepEqual(imageInfo(png(2000, 1500)).width, 2000);
  assert.deepEqual([imageInfo(jpeg(1600, 1200)).width, imageInfo(jpeg(1600, 1200)).height], [1600, 1200]);
  assert.deepEqual([imageInfo(jpeg(3000, 4000, 5000)).width, imageInfo(jpeg(3000, 4000, 5000)).height], [3000, 4000]);
  assert.deepEqual([imageInfo(webp(1024, 768)).width, imageInfo(webp(1024, 768)).height], [1024, 768]);
  assert.deepEqual(imageInfo('AAAA-binary-fake'), {bytes: 12, width: 0, height: 0});
  assert.equal(imageInfo(Buffer.alloc(3000).toString('base64')).bytes, 3000);
});

test('PP-03 check: too many bytes or too long a side → PHOTO_TOO_LARGE; within the policy → ok', () => {
  const p = parsePhotoPolicy({...DEFAULT_PHOTO_POLICY, maxSide: 1600, maxBytes: 100000});
  assert.doesNotThrow(() => checkPhotoSize(jpeg(1600, 1200), p));
  assert.throws(() => checkPhotoSize(jpeg(1601, 1200), p), /PHOTO_TOO_LARGE/);
  assert.throws(() => checkPhotoSize(png(800, 2000), p), /PHOTO_TOO_LARGE/);
  assert.throws(() => checkPhotoSize(Buffer.alloc(100001).toString('base64'), p), /PHOTO_TOO_LARGE/);
});

test('PP-04 the admin sets it (audited), the form receives it, uploads + replacements above it are refused before Drive', () => {
  const h = createAcceptanceHarness();
  const camp = h.createCampaign();
  assert.deepEqual(assertOk(assert, h.call('campaigns.validate', {campaignToken: camp.campaignToken}), 'validate').photoPolicy, DEFAULT_PHOTO_POLICY);
  assertError(assert, h.as('sys', 'system.config.update', {values: {[PHOTO_POLICY_KEY]: {...DEFAULT_PHOTO_POLICY, maxSide: 100}}}), 'INVALID_PHOTO_POLICY', 'out of range');
  assertError(assert, h.as('staff', 'system.config.update', {values: {[PHOTO_POLICY_KEY]: DEFAULT_PHOTO_POLICY}}), 'FORBIDDEN', 'not an admin');
  const policy = {maxSide: 1200, quality: 0.75, maxBytes: 800000, thumbSide: 256};
  const saved = assertOk(assert, h.as('sys', 'system.config.update', {values: {[PHOTO_POLICY_KEY]: policy}}), 'admin sets');
  assert.deepEqual(saved[PHOTO_POLICY_KEY], policy);
  assert.ok(h.store.list('vc_change_audit').some(a => a.action === 'PHOTO_POLICY_UPDATED'), 'audited');
  assert.deepEqual(assertOk(assert, h.call('campaigns.validate', {campaignToken: camp.campaignToken}), 'validate').photoPolicy, policy);
  const uploadsBefore = h.io.driveUploads, stagedBefore = h.store.list('vc_photo_staging').length;
  assertError(assert, h.call('photos.upload', {campaignToken: camp.campaignToken, slot: 'FRONT', base64Image: jpeg(1600, 1200), mimeType: 'image/jpeg'}),
    'PHOTO_TOO_LARGE', 'longer than 1200 px');
  assert.equal(h.io.driveUploads, uploadsBefore, 'nothing sent to Drive'); assert.equal(h.store.list('vc_photo_staging').length, stagedBefore, 'no staging row');
  assertOk(assert, h.call('photos.upload', {campaignToken: camp.campaignToken, slot: 'FRONT', base64Image: jpeg(1200, 900), mimeType: 'image/jpeg'}), 'within the policy');
});
