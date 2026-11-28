// R10: one-shot reference catalog job. The journal lives in Firestore, so a new process
// sees an interrupted apply and cannot blindly repeat its 645 writes.
import {createHash} from 'node:crypto';
import {REFERENCE_SEED_V1} from '../../../gas/src/domain/reference/ReferenceSeedV1.js';

const TABLE = 'vc_reference_values';
const JOURNAL_KEY = 'reference_seed_v1_job_state';
const OWNER = 'REFERENCE_SEED_V1';
const CHUNK = 400;
const FIELDS = ['reference_id', 'catalog', 'code', 'label_th', 'parent_code', 'sort_order', 'status', 'updated_by', 'updated_at'];
const COUNTS = {PROVINCE: 77, VEHICLE_TYPE: 17, PLATE_TYPE: 5, RELATIONSHIP: 6, COLOR: 16, BRAND: 524};
const fail = code => { throw new Error(code); };
const canon = row => JSON.stringify(FIELDS.map(field => String(row[field] ?? '')));
const journalRow = (state, at) => ({key: JOURNAL_KEY, value: JSON.stringify(state), updated_by: OWNER, updated_at: at});

function manifest() {
  const rows = REFERENCE_SEED_V1.rows;
  const checksum = createHash('sha256').update(JSON.stringify({
    seedVersion: REFERENCE_SEED_V1.seedVersion, schemaVersion: REFERENCE_SEED_V1.schemaVersion, rows
  })).digest('hex');
  const ids = new Set(), codes = new Set(), counts = {};
  if (rows.length !== 645) fail('REFERENCE_SEED_MANIFEST_INVALID');
  for (const row of rows) {
    const key = `${row.catalog}|${row.code}`;
    if (!row.reference_id || !row.catalog || !row.code || !row.label_th || row.parent_code !== '' ||
      !Number.isSafeInteger(row.sort_order) || row.sort_order < 1 || row.status !== 'ACTIVE' ||
      row.updated_by !== OWNER || row.updated_at !== '2026-11-20T00:00:00.000Z' ||
      ids.has(row.reference_id) || codes.has(key)) fail('REFERENCE_SEED_MANIFEST_INVALID');
    ids.add(row.reference_id); codes.add(key); counts[row.catalog] = (counts[row.catalog] || 0) + 1;
  }
  if (Object.keys(counts).length !== 6 || Object.entries(COUNTS).some(([key, n]) => counts[key] !== n))
    fail('REFERENCE_SEED_MANIFEST_INVALID');
  return {rows, checksum};
}

async function inspect(store, rows) {
  const count = await store.count(TABLE);
  if (count === 0) return {status: 'READY', existingCount: 0, addCount: rows.length};
  if (count !== rows.length) return {status: 'BLOCKED', existingCount: count, addCount: 0};
  const existing = await store.list(TABLE, {}, rows.length + 1);
  const want = new Set(rows.map(canon));
  return existing.length === rows.length && existing.every(row => want.has(canon(row)))
    ? {status: 'ALREADY_APPLIED', existingCount: count, addCount: 0}
    : {status: 'BLOCKED', existingCount: count, addCount: 0};
}

export async function runReferenceSeedJob({store, mode = 'DRY_RUN', approval = '', now = () => new Date().toISOString()}) {
  if (!store) fail('REFERENCE_SEED_NOT_CONFIGURED');
  const {rows, checksum} = manifest();
  const base = {seedVersion: REFERENCE_SEED_V1.seedVersion, schemaVersion: REFERENCE_SEED_V1.schemaVersion,
    checksum, rowCount: rows.length};
  if (mode === 'DRY_RUN') return {...base, ...await inspect(store, rows), dataModified: false};
  if (mode === 'APPLY') {
    if (approval !== checksum) fail('REFERENCE_SEED_EXPLICIT_APPROVAL_REQUIRED');
    const plan = await inspect(store, rows);
    if (plan.status === 'ALREADY_APPLIED') return {...base, ...plan, dataModified: false};
    if (plan.status !== 'READY') fail('REFERENCE_SEED_CONFLICT');
    await store.sequence(async tx => {
      if (await tx.count(TABLE)) fail('REFERENCE_SEED_CONFLICT');
      if (await tx.one('vc_settings', {key: JOURNAL_KEY})) fail('REFERENCE_SEED_RECOVERY_REQUIRED');
      await tx.insert('vc_settings', journalRow({status: 'APPLYING', checksum, startedAt: now()}, now()));
    });
    try {
      for (let i = 0; i < rows.length; i += CHUNK)
        await store.writeMany(rows.slice(i, i + CHUNK).map(row => ({op: 'insert', table: TABLE,
          data: Object.fromEntries(FIELDS.map(field => [field, String(row[field])]))})));
      const verified = await inspect(store, rows);
      if (verified.status !== 'ALREADY_APPLIED') fail('REFERENCE_SEED_VERIFICATION_FAILED');
      await store.update('vc_settings', {key: JOURNAL_KEY}, {value: JSON.stringify({status: 'APPLIED', checksum, completedAt: now()}), updated_at: now()});
      return {...base, status: 'APPLIED', existingCount: rows.length, addCount: rows.length, dataModified: true};
    } catch (error) {
      try { await store.update('vc_settings', {key: JOURNAL_KEY},
        {value: JSON.stringify({status: 'RECOVERY_REQUIRED', checksum, failedAt: now()}), updated_at: now()}); } catch { /* keep original error */ }
      throw error;
    }
  }
  if (mode === 'RECOVER') {
    if (approval !== `RECOVER_REFERENCE_SEED:${checksum}`) fail('REFERENCE_SEED_RECOVERY_APPROVAL_REQUIRED');
    const stateRow = await store.one('vc_settings', {key: JOURNAL_KEY});
    const state = stateRow ? JSON.parse(stateRow.value) : null;
    if (state?.checksum !== checksum || !['APPLYING', 'RECOVERY_REQUIRED'].includes(state.status))
      fail('REFERENCE_SEED_RECOVERY_NOT_REQUIRED');
    const existing = await store.list(TABLE, {}, rows.length + 1);
    if (existing.length > rows.length || existing.some(row => !/^REF-(PROVINCE|VEHICLE_TYPE|PLATE_TYPE|RELATIONSHIP|COLOR|BRAND)-/.test(String(row.reference_id)) ||
      row.updated_by !== OWNER)) fail('REFERENCE_SEED_RECOVERY_CONFLICT');
    for (let i = 0; i < existing.length; i += CHUNK)
      await store.writeMany(existing.slice(i, i + CHUNK).map(row => ({op: 'remove', table: TABLE, key: {reference_id: row.reference_id}})));
    await store.update('vc_settings', {key: JOURNAL_KEY}, {value: JSON.stringify({status: 'RECOVERED', checksum, recoveredAt: now()}), updated_at: now()});
    return {...base, status: 'RECOVERED', clearedCount: existing.length, dataModified: existing.length > 0};
  }
  fail('REFERENCE_SEED_MODE_INVALID');
}
