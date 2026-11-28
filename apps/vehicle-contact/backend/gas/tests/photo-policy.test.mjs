// VC-ADR-049 photo size policy: one domain module; the admin sets it, the form receives it, the server enforces it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PHOTO_POLICY_KEY, DEFAULT_PHOTO_POLICY, parsePhotoPolicy, readPhotoPolicy, imageInfo, checkPhotoSize, fitsOrientation} from '../src/domain/policies/PhotoPolicy.js';
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
  // VC-ADR-055: a policy sent without the two newer fields is saved with their defaults (no change for older clients)
  const inForce = {...policy, minSide: 0, orientation: 'ANY'};
  assert.deepEqual(saved[PHOTO_POLICY_KEY], inForce);
  assert.ok(h.store.list('vc_change_audit').some(a => a.action === 'PHOTO_POLICY_UPDATED'), 'audited');
  assert.deepEqual(assertOk(assert, h.call('campaigns.validate', {campaignToken: camp.campaignToken}), 'validate').photoPolicy, inForce);
  const uploadsBefore = h.io.driveUploads, stagedBefore = h.store.list('vc_photo_staging').length;
  assertError(assert, h.call('photos.upload', {campaignToken: camp.campaignToken, slot: 'FRONT', base64Image: jpeg(1600, 1200), mimeType: 'image/jpeg'}),
    'PHOTO_TOO_LARGE', 'longer than 1200 px');
  assert.equal(h.io.driveUploads, uploadsBefore, 'nothing sent to Drive'); assert.equal(h.store.list('vc_photo_staging').length, stagedBefore, 'no staging row');
  assertOk(assert, h.call('photos.upload', {campaignToken: camp.campaignToken, slot: 'FRONT', base64Image: jpeg(1200, 900), mimeType: 'image/jpeg'}), 'within the policy');
});

test('PP-05 VC-ADR-055 orientation (ANY / LANDSCAPE / PORTRAIT; a square fits both) and minimum shorter side (0 = off)', () => {
  const base = parsePhotoPolicy(DEFAULT_PHOTO_POLICY);
  assert.equal(base.orientation, 'ANY'); assert.equal(base.minSide, 0);
  assert.deepEqual(parsePhotoPolicy({maxSide: 1600, quality: 0.82, maxBytes: 1500000, thumbSide: 320}), DEFAULT_PHOTO_POLICY, 'older policy rows read as before');
  for (const bad of [{...DEFAULT_PHOTO_POLICY, orientation: 'landscape'}, {...DEFAULT_PHOTO_POLICY, orientation: 1}, {...DEFAULT_PHOTO_POLICY, minSide: -1},
    {...DEFAULT_PHOTO_POLICY, minSide: 2001}, {...DEFAULT_PHOTO_POLICY, minSide: 600.5}, {...DEFAULT_PHOTO_POLICY, maxSide: 1000, minSide: 1200}])
    assert.throws(() => parsePhotoPolicy(bad), /INVALID_PHOTO_POLICY/, JSON.stringify(bad));
  assert.deepEqual([fitsOrientation(1600, 1200, 'LANDSCAPE'), fitsOrientation(1200, 1600, 'LANDSCAPE'), fitsOrientation(1200, 1600, 'PORTRAIT'),
    fitsOrientation(1000, 1000, 'PORTRAIT'), fitsOrientation(0, 0, 'LANDSCAPE'), fitsOrientation(1200, 1600, 'ANY')], [true, false, true, true, true, true]);
  const land = parsePhotoPolicy({...DEFAULT_PHOTO_POLICY, orientation: 'LANDSCAPE', minSide: 900});
  assert.doesNotThrow(() => checkPhotoSize(jpeg(1600, 1200), land));
  assert.throws(() => checkPhotoSize(jpeg(1200, 1600), land), /PHOTO_ORIENTATION_INVALID/);
  assert.throws(() => checkPhotoSize(png(1600, 800), land), /PHOTO_TOO_SMALL/, 'shorter side 800 < 900');
  assert.throws(() => checkPhotoSize(jpeg(1700, 1200), land), /PHOTO_TOO_LARGE/, 'too large is checked first');
  assert.doesNotThrow(() => checkPhotoSize('AAAA-binary-fake', land), 'unreadable header: judged by bytes only, as before');
  const port = parsePhotoPolicy({...DEFAULT_PHOTO_POLICY, orientation: 'PORTRAIT'});
  assert.doesNotThrow(() => checkPhotoSize(webp(1200, 1600), port));
  assert.throws(() => checkPhotoSize(webp(1600, 1200), port), /PHOTO_ORIENTATION_INVALID/);
});

test('PP-06 VC-ADR-055 the admin asks for landscape + a minimum size; the form receives it; other photos refused before Drive (audited)', () => {
  const h = createAcceptanceHarness();
  const camp = h.createCampaign();
  const policy = {...DEFAULT_PHOTO_POLICY, orientation: 'LANDSCAPE', minSide: 900};
  assertOk(assert, h.as('sys', 'system.config.update', {values: {[PHOTO_POLICY_KEY]: policy}}), 'admin sets');
  assert.ok(h.store.list('vc_change_audit').some(a => a.action === 'PHOTO_POLICY_UPDATED' && /minSide=900,orientation=LANDSCAPE/.test(a.redacted_summary)), 'audited');
  assert.deepEqual(assertOk(assert, h.call('campaigns.validate', {campaignToken: camp.campaignToken}), 'validate').photoPolicy, policy);
  const uploadsBefore = h.io.driveUploads;
  const up = img => h.call('photos.upload', {campaignToken: camp.campaignToken, slot: 'FRONT', base64Image: img, mimeType: 'image/jpeg'});
  assertError(assert, up(jpeg(1200, 1600)), 'PHOTO_ORIENTATION_INVALID', 'portrait refused');
  assertError(assert, up(jpeg(1600, 800)), 'PHOTO_TOO_SMALL', 'too small refused');
  assert.equal(h.io.driveUploads, uploadsBefore, 'nothing sent to Drive');
  assertOk(assert, up(jpeg(1600, 1200)), 'landscape within the policy');
});
