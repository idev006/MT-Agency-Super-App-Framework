// P6VC Firestore DEV connectivity read-back probe (F4 infra verification).
// Synthetic DEV data only. Gated: requires P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE.
// Every write is verified by an INDEPENDENT read-back (owner directive: API OK != data proof).
// No credential, token, private key or PII is ever printed. Report is sanitized + gitignored.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import './load-env.mjs';

const GATE = 'RUN_SYNTHETIC_FIRESTORE_PROBE';
const PROBE_COLLECTION = '__p6vc_connectivity_probe';
const MARKER = 'SYNTHETIC_DEV_CONNECTIVITY';

const runner = {
  status: 'RUNNING', environment: 'FIRESTORE_DEV', probeCollection: PROBE_COLLECTION,
  projectId: null, databaseId: null, region: null, transport: 'REST',
  startedAt: new Date().toISOString(), tests: [], blocked: [],
  scope: 'Synthetic DEV connectivity + independent document read-back (write/read/query/update/delete)',
};
const save = () => {
  runner.finishedAt = new Date().toISOString();
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/firestore-connectivity-probe.json', JSON.stringify(runner, null, 2) + '\n');
  console.log('FINAL ' + JSON.stringify({
    status: runner.status,
    pass: runner.tests.filter(x => x.status === 'PASS').length,
    failed: runner.tests.filter(x => x.status === 'FAIL').length,
    projectId: runner.projectId, databaseId: runner.databaseId, region: runner.region,
    seconds: Math.round((Date.parse(runner.finishedAt) - Date.parse(runner.startedAt)) / 1000),
    reason: runner.reason || null,
  }));
};
const test = async (id, callback, { critical = false } = {}) => {
  const start = Date.now();
  try {
    const result = await callback();
    runner.tests.push({ id, status: 'PASS', durationMs: Date.now() - start, ...(result?.note ? { note: result.note } : {}) });
    console.log('PASS ' + id + ' ' + (Date.now() - start) + 'ms' + (result?.note ? ' ' + result.note : ''));
    return { ok: true, result };
  } catch (e) {
    runner.tests.push({ id, status: 'FAIL', durationMs: Date.now() - start, reason: String(e?.message || e).slice(0, 200) });
    console.log('FAIL ' + id + ' ' + String(e?.message || e).slice(0, 160));
    if (critical) throw e;
    return { ok: false };
  }
};

let db = null;
const probeId = 'probe-' + crypto.randomBytes(8).toString('hex');
const probeRef = () => db.collection(PROBE_COLLECTION).doc(probeId);

const check = async () => {
  // FS-01: config + credential file validation (no secret content printed).
  const cfg = await test('FS-01.CONFIG', async () => {
    assert.equal(process.env.P6VC_ALLOW_FIRESTORE_DEV_PROBE, GATE, 'explicit synthetic-DEV probe gate required');
    const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const projectId = process.env.FIRESTORE_PROJECT_ID;
    const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';
    assert.ok(keyFile, 'GOOGLE_APPLICATION_CREDENTIALS missing');
    assert.ok(projectId, 'FIRESTORE_PROJECT_ID missing');
    assert.ok(fs.existsSync(keyFile), 'credential file not found at configured path');
    let repoRoot = process.cwd();
    for (let i = 0; i < 10 && !fs.existsSync(path.join(repoRoot, '.git')); i++) {
      const parent = path.dirname(repoRoot); if (parent === repoRoot) break; repoRoot = parent;
    }
    const resolvedKey = path.resolve(keyFile);
    assert.ok(!resolvedKey.startsWith(path.resolve(repoRoot) + path.sep), 'credential file MUST live outside the repo');
    const meta = JSON.parse(fs.readFileSync(resolvedKey, 'utf8'));
    assert.equal(meta.type, 'service_account', 'credential is not a service-account key');
    assert.equal(meta.project_id, projectId, 'credential project_id != FIRESTORE_PROJECT_ID');
    assert.ok(typeof meta.private_key === 'string' && meta.private_key.includes('BEGIN PRIVATE KEY'), 'private key missing');
    runner.projectId = projectId; runner.databaseId = databaseId;
    return { note: 'project=' + projectId + ' db=' + databaseId + ' keyId=' + String(meta.private_key_id).slice(0, 12) + '…' };
  }, { critical: true });
  if (!cfg.ok) { runner.status = 'BLOCKED_CONFIG'; runner.reason = 'Credential/config gate failed; no Firestore call attempted'; return; }

  // FS-02: client init (REST transport, matching the GAS adapter's REST approach).
  const init = await test('FS-02.CLIENT_INIT', async () => {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: runner.projectId,
      databaseId: runner.databaseId,
      preferRest: true,
    });
    assert.ok(db, 'client not constructed');
    return { note: 'sdk=@google-cloud/firestore preferRest=true auth=ADC(GOOGLE_APPLICATION_CREDENTIALS)' };
  }, { critical: true });
  if (!init.ok) { runner.status = 'BLOCKED_CLIENT'; runner.reason = 'Firestore client init failed'; return; }

  const createdAt = new Date().toISOString();
  const nonce = crypto.randomBytes(6).toString('hex');
  const syntheticDoc = {
    probeId, marker: MARKER, createdAt, nonce, seq: 1,
    payload: { count: 42, label: 'synthetic-probe', flag: true },
  };

  // FS-03: write synthetic doc.
  const wrote = await test('FS-03.WRITE', async () => {
    await probeRef().set(syntheticDoc);
    return { note: 'doc=' + probeId };
  }, { critical: true });
  if (!wrote.ok) { runner.status = 'FAIL'; runner.reason = 'Synthetic write failed'; return; }

  // FS-04: INDEPENDENT read-back — verify persisted fields equal what we wrote.
  await test('FS-04.READ_BACK', async () => {
    const snap = await probeRef().get();
    assert.equal(snap.exists, true, 'document not persisted (read-back exists=false)');
    const data = snap.data();
    assert.deepEqual(data, syntheticDoc, 'persisted document != written document');
    return { note: 'read-back deep-equal OK' };
  }, { critical: true });

  // FS-05: query path — single-field queries are auto-indexed. Equality-only and
  // orderBy-only both prove the read/query path without a composite index. The
  // adapter's combined where(field)+orderBy(_seq) pattern needs a per-collection
  // composite index, provisioned during F4 cutover (NOT on this throwaway probe).
  await test('FS-05.QUERY_LIST', async () => {
    const eq = await db.collection(PROBE_COLLECTION).where('marker', '==', MARKER).limit(50).get();
    assert.ok(eq.docs.map(d => d.id).includes(probeId), 'equality query did not return probe doc');
    const ord = await db.collection(PROBE_COLLECTION).orderBy('seq', 'asc').limit(50).get();
    const mine = ord.docs.find(d => d.id === probeId);
    assert.ok(mine, 'orderBy query did not return probe doc');
    assert.equal(mine.data().seq, 1, 'ordering field seq not persisted/readable');
    return { note: 'equality=' + eq.size + ' orderBy=' + ord.size + ' (single-field auto-index)' };
  });
  runner.indexNote = 'Composite indexes for combined where+orderBy(_seq) are provisioned per real table collection during F4 cutover; not required for this connectivity probe.';

  // FS-06: update + independent read-back of the changed field.
  await test('FS-06.UPDATE_READ_BACK', async () => {
    await probeRef().update({ seq: 2, 'payload.count': 43 });
    const snap = await probeRef().get();
    const data = snap.data();
    assert.equal(data.seq, 2, 'updated seq not persisted');
    assert.equal(data.payload.count, 43, 'updated nested field not persisted');
    assert.equal(data.nonce, nonce, 'unrelated field changed unexpectedly');
    return { note: 'update read-back OK' };
  });

  // FS-07: delete synthetic doc (cleanup).
  await test('FS-07.DELETE', async () => {
    await probeRef().delete();
    return { note: 'deleted ' + probeId };
  }, { critical: true });

  // FS-08: INDEPENDENT read-back confirming deletion (no residue).
  await test('FS-08.DELETE_READ_BACK', async () => {
    const snap = await probeRef().get();
    assert.equal(snap.exists, false, 'document still present after delete (cleanup residue)');
    return { note: 'delete read-back exists=false OK' };
  }, { critical: true });

  runner.status = runner.tests.some(x => x.status === 'FAIL') ? 'FAIL' : 'PASS';
};

try {
  await check();
} catch (e) {
  runner.status = 'FAIL';
  runner.reason = String(e?.message || e).slice(0, 180);
} finally {
  // Best-effort cleanup guarantee: never leave a synthetic probe doc behind.
  if (db) { try { await probeRef().delete(); } catch { /* already gone or unreachable */ } }
  save();
  if (runner.status !== 'PASS') process.exitCode = 1;
}