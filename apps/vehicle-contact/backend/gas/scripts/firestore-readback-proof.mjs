// G1 — Firestore-only DATA_PROOF: independent Node-SDK read-back of the live suite's
// synthetic records (owner directive: API OK != data proof). Synthetic DEV only.
// Gate: P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE + SA creds via
// gitignored .env (key OUTSIDE the repo). Sanitized output: counters, field NAMES,
// synthetic non-secret values only. Report: test-results/p6vc-firestore-readback-proof.json
// (relative to cwd; the suite runner spawns with cwd=repo root). Gitignored.
//
// Expectations are derived from the PERSISTED NORMALIZED schema + full operation
// lifecycle (SSOT lesson, evidence §4.4): application_json stores plate_normalized/make
// (not the submit DTO's plate/brand); idempotency_key is the payload sha256 digest;
// final vehicle version reflects update -> QR/photos -> cancel (>=2, not the mid-suite 2).
//
// Usage: node scripts/firestore-readback-proof.mjs [--since <suite startedAt ISO>]
// Without --since, falls back to the suite report's startedAt in cwd/test-results.
import './load-env.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const GATE = 'RUN_SYNTHETIC_FIRESTORE_PROBE';
const reportPath = path.join(process.cwd(), 'test-results', 'p6vc-firestore-readback-proof.json');
const out = {status: 'RUNNING', startedAt: new Date().toISOString(), checks: [], secretsExposed: false};
const save = () => {
  out.finishedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(reportPath), {recursive: true});
  fs.writeFileSync(reportPath, JSON.stringify(out, null, 2) + '\n');
};
const fail = (status, reason) => {
  out.status = status; out.reason = reason; save();
  console.log('PROOF ' + JSON.stringify({status, reason, report: 'test-results/p6vc-firestore-readback-proof.json'}));
  process.exit(1);
};

if (process.env.P6VC_ALLOW_FIRESTORE_DEV_PROBE !== GATE) fail('BLOCKED_CONFIG', 'MISSING_PROBE_GATE');
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const projectId = process.env.FIRESTORE_PROJECT_ID;
if (!keyFile || !projectId || !fs.existsSync(keyFile)) fail('BLOCKED_CONFIG', 'MISSING_FIRESTORE_CREDENTIALS');
let repoRoot = process.cwd();
for (let i = 0; i < 10 && !fs.existsSync(path.join(repoRoot, '.git')); i++) {
  const parent = path.dirname(repoRoot); if (parent === repoRoot) break; repoRoot = parent;
}
if (path.resolve(keyFile).startsWith(path.resolve(repoRoot) + path.sep)) fail('BLOCKED_CONFIG', 'CREDENTIAL_INSIDE_REPO');

const sinceIdx = process.argv.indexOf('--since');
let SINCE = sinceIdx > 0 ? process.argv[sinceIdx + 1] : null;
if (!SINCE) {
  try { SINCE = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'test-results', 'p6vc-live-api-suite.json'), 'utf8')).startedAt; } catch {}
}
if (!SINCE) fail('BLOCKED_CONFIG', 'MISSING_SUITE_START (--since or suite report required)');
out.suiteStartedAt = SINCE;

const {Firestore} = await import('@google-cloud/firestore');
const db = new Firestore({projectId, databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)', preferRest: true});

const check = async (id, fn) => {
  try { const note = await fn(); out.checks.push({id, status: 'PASS', note}); console.log('PASS ' + id + (note ? ' ' + note : '')); }
  catch (e) { out.checks.push({id, status: 'FAIL', reason: String(e?.message || e).slice(0, 200)}); console.log('FAIL ' + id + ' ' + String(e?.message || e).slice(0, 160)); }
};

let vehicleId = null, plate = null;

await check('RB-01.NEW_VEHICLE', async () => {
  const snap = await db.collection('vc_vehicles').where('make', '==', 'SYNTHETIC').get();
  const fresh = snap.docs.map(d => d.data()).filter(v => v.model === 'AUTOMATED' && v.created_at >= SINCE);
  assert.equal(fresh.length, 1, 'expected exactly 1 suite vehicle created since ' + SINCE + ', got ' + fresh.length);
  const v = fresh[0];
  vehicleId = v.vehicle_id; plate = v.plate_normalized;
  assert.ok(/^TST\d{8}$/.test(v.plate_normalized), 'plate not synthetic TST pattern');
  assert.ok(Number.isInteger(v.version) && v.version >= 2, 'version < 2 (VEHICLES.UPDATE not persisted); final version reflects later lifecycle ops');
  assert.ok(v.owner_user_id, 'owner_user_id empty');
  assert.ok(v.created_at >= SINCE && v.updated_at >= v.created_at, 'timestamps outside run window');
  return 'vehicleId=' + vehicleId + ' plate=' + plate + ' version=' + v.version + ' status=' + v.status + ' fields=' + Object.keys(v).length;
});

await check('RB-02.REGISTRATION_APPROVED', async () => {
  assert.ok(vehicleId, 'no vehicle from RB-01');
  const snap = await db.collection('vc_registration_requests').where('vehicle_id', '==', vehicleId).get();
  assert.equal(snap.size, 1, 'expected 1 registration for vehicle, got ' + snap.size);
  const r = snap.docs[0].data();
  assert.equal(r.status, 'APPROVED', 'registration status != APPROVED');
  assert.ok(r.reviewed_at, 'reviewed_at empty');
  const app = typeof r.application_json === 'string' ? JSON.parse(r.application_json) : r.application_json;
  assert.equal(app.plate_normalized, plate, 'application plate_normalized mismatch');
  assert.equal(app.make, 'SYNTHETIC', 'application make mismatch');
  assert.ok(/^[a-f0-9]{64}$/.test(r.idempotency_key), 'idempotency key not a sha256 digest');
  return 'requestId=' + r.request_id + ' status=' + r.status + ' idem=sha256 fields=' + Object.keys(r).length;
});

await check('RB-03.CONTACT_UPDATED', async () => {
  assert.ok(vehicleId, 'no vehicle from RB-01');
  const snap = await db.collection('vc_vehicle_contacts').where('vehicle_id', '==', vehicleId).get();
  assert.ok(snap.size >= 1, 'no contacts persisted');
  const updated = snap.docs.map(d => d.data()).find(c => c.display_name === 'Synthetic Updated');
  assert.ok(updated, 'CONTACTS.UPDATE not persisted');
  assert.equal(updated.phone_e164, '+66810000003', 'updated phone not persisted');
  return 'contacts=' + snap.size + ' updatedName=Synthetic Updated';
});

await check('RB-04.PHOTOS_FIVE', async () => {
  assert.ok(vehicleId, 'no vehicle from RB-01');
  const n = (await db.collection('vc_vehicle_photos').where('vehicle_id', '==', vehicleId).count().get()).data().count;
  assert.equal(n, 5, 'expected 5 photos, got ' + n);
  return 'photos=' + n;
});

await check('RB-05.CANCEL_LIFECYCLE', async () => {
  assert.ok(vehicleId, 'no vehicle from RB-01');
  const v = (await db.collection('vc_vehicles').doc(vehicleId).get()).data();
  assert.ok(v, 'vehicle doc vanished');
  assert.notEqual(v.status, 'ACTIVE', 'cleanup VEHICLE_CANCEL not persisted (still ACTIVE)');
  return 'post-cleanup status=' + v.status;
});

// VC-ADR-036 S3 oracle (derived from the suite scenario, read straight from Firestore): the suite vehicle has exactly
// three QR rows, all REVOKED after the cleanup cancel, each with who + why, chained by replaces_qr_id.
await check('RB-07.QR_HISTORY', async () => {
  assert.ok(vehicleId, 'no vehicle from RB-01');
  const rows = (await db.collection('vc_qr_tokens').where('vehicle_id', '==', vehicleId).get()).docs.map(d => d.data())
    .sort((a, b) => String(a.issued_at).localeCompare(String(b.issued_at)));
  assert.equal(rows.length, 3, 'expected 3 QR rows, got ' + rows.length);
  assert.deepEqual(rows.map(r => r.reason), ['REGISTRATION_APPROVED', 'NEW', 'DAMAGED']);
  assert.deepEqual(rows.map(r => r.revoke_reason), ['STOLEN', 'DAMAGED', 'VEHICLE_CANCELLED']);
  assert.ok(rows.every(r => r.status === 'REVOKED' && r.revoked_by && r.revoked_at), 'every row revoked with who/when');
  assert.equal(rows[2].replaces_qr_id, rows[1].qr_id, 'replacement chain');
  return 'rows=3 reasons=' + rows.map(r => r.reason + '>' + r.revoke_reason).join(',');
});

await check('RB-06.NO_NEW_DIVERGENCE', async () => {
  const snap = await db.collection('vc_operation_journal').where('operation', '==', 'dualwrite.divergence').get();
  const open = snap.docs.filter(d => d.data().status === 'OPEN').length;
  assert.equal(open, 0, 'OPEN divergences = ' + open);
  return 'divergenceTotal=' + snap.size + ' open=0';
});

out.status = out.checks.every(c => c.status === 'PASS') ? 'PASS' : 'FAIL';
out.vehicleId = vehicleId; out.plate = plate;
save();
console.log('PROOF ' + JSON.stringify({status: out.status, pass: out.checks.filter(c => c.status === 'PASS').length, fail: out.checks.filter(c => c.status === 'FAIL').length, vehicleId, plate, report: 'test-results/p6vc-firestore-readback-proof.json'}));
if (out.status !== 'PASS') process.exit(1);