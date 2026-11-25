// Synthetic DEV residue purge (owner 2026-11-25: "อนุญาตให้ลบข้อมูลทดสอบที่ค้าง และกฎลบรูปที่อัปโหลดแล้วไม่ถูกใช้").
// Default = DRY RUN: reads everything once, classifies, writes a plan (ids only) and prints counts.
// --apply deletes EXACTLY the ids of a plan file the owner confirmed (re-classified first; any
// row that no longer qualifies is skipped). Firestore only — Drive files are trashed by the GAS
// editor tool (the files live in the owner's Drive); the plan lists their storage refs.
//   dry run : node scripts/purge-synthetic-residue.mjs
//   apply   : P6VC_ALLOW_RESIDUE_PURGE=PURGE_SYNTHETIC_RESIDUE node scripts/purge-synthetic-residue.mjs --apply <plan.json>
import './load-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {GoogleAuth} from 'google-auth-library';
import {DATABASE_SCHEMA} from '../src/domain/ports/SchemaRepository.js';
import {isSyntheticVehicle} from './reset-dev-data.mjs';

export const PURGE_GATE = 'PURGE_SYNTHETIC_RESIDUE';
export const STAGING_TTL_DAYS = 7; // unclaimed (STAGED) uploads older than this are abandoned
const DAY = 86400000;
const pk = t => DATABASE_SCHEMA.tables[t].columns.find(c => c.key === 'primary').name;

export function isSyntheticUserRow(u, adminUsername) {
  const name = String(u.username_normalized || ''), display = String(u.display_name || '');
  if (adminUsername && name === String(adminUsername).toLowerCase()) return false;
  return name.startsWith('p6vc_') || display.startsWith('P6VC Automated');
}
const plateOf = r => { try { const a = JSON.parse(r.application_json || '{}'); return a.plate_normalized || a.plate || ''; } catch { return ''; } };

// Pure classification: rows = {collection: [docs]} → {collection: [ids]} + kept counts + drive refs.
export function classify(rows, {now = Date.now(), adminUsername = ''} = {}) {
  const del = {}, add = (t, id) => { (del[t] ||= new Set()).add(String(id)); };
  const R = t => rows[t] || [];
  const synVeh = new Set(R('vc_vehicles').filter(isSyntheticVehicle).map(v => v.vehicle_id));
  for (const id of synVeh) add('vc_vehicles', id);
  // registration requests of synthetic plates (approved ones carry the vehicle id; rejected ones only the plate)
  const synReq = new Set(R('vc_registration_requests').filter(r => synVeh.has(r.vehicle_id) || isSyntheticVehicle({plate_normalized: plateOf(r)})).map(r => r.request_id));
  for (const id of synReq) add('vc_registration_requests', id);
  for (const r of R('vc_registration_requests')) if (synReq.has(r.request_id) && r.vehicle_id) synVeh.add(r.vehicle_id);
  for (const t of ['vc_vehicle_contacts', 'vc_vehicle_photos', 'vc_qr_tokens', 'vc_change_requests', 'vc_retention_jobs', 'vc_lookup_audit'])
    for (const r of R(t)) if (synVeh.has(r.vehicle_id)) add(t, r[pk(t)]);
  for (const r of R('vc_change_audit')) if (synVeh.has(r.entity_id) || synReq.has(r.entity_id)) add('vc_change_audit', r.audit_id);
  // synthetic users + everything keyed by them
  const synUser = new Set(R('vc_users').filter(u => isSyntheticUserRow(u, adminUsername)).map(u => u.user_id));
  for (const id of synUser) add('vc_users', id);
  for (const t of ['vc_user_roles', 'vc_user_permissions', 'vc_user_identities', 'vc_sessions'])
    for (const r of R(t)) if (synUser.has(r.user_id)) add(t, r[pk(t)]);
  // session housekeeping: revoked or expired sessions of anyone
  for (const s of R('vc_sessions')) if (s.status !== 'ACTIVE' || s.revoked_at || Date.parse(s.expires_at) < now) add('vc_sessions', s.session_id);
  // unclaimed-upload rule: STAGED rows older than STAGING_TTL_DAYS; CLAIMED rows of purged photos
  const purgedPhotos = new Set((del.vc_vehicle_photos ? [...del.vc_vehicle_photos] : []));
  for (const s of R('vc_photo_staging')) {
    const abandoned = s.status === 'STAGED' && Date.parse(s.created_at) < now - STAGING_TTL_DAYS * DAY;
    if (abandoned || purgedPhotos.has(s.photo_id)) add('vc_photo_staging', s.photo_id);
  }
  const ids = Object.fromEntries(Object.entries(del).map(([t, s]) => [t, [...s].sort()]));
  const kept = Object.fromEntries(Object.keys(rows).map(t => [t, R(t).length - (ids[t]?.length || 0)]));
  const driveRefs = [...new Set([...R('vc_vehicle_photos').filter(p => del.vc_vehicle_photos?.has(String(p.photo_id))),
    ...R('vc_photo_staging').filter(s => del.vc_photo_staging?.has(String(s.photo_id)))].map(r => String(r.storage_ref || '')).filter(Boolean))].sort();
  return {ids, kept, driveRefs, rule: {stagingTtlDays: STAGING_TTL_DAYS}};
}

async function client(env) {
  const key = JSON.parse(fs.readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  const http = await new GoogleAuth({credentials: key, scopes: ['https://www.googleapis.com/auth/datastore']}).getClient();
  const db = env.FIRESTORE_DATABASE_ID || '(default)';
  return {http, root: `projects/${env.FIRESTORE_PROJECT_ID || key.project_id}/databases/${db}/documents`, db};
}
const decode = v => (v == null ? '' : 'stringValue' in v ? v.stringValue : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue
  : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null : 'timestampValue' in v ? v.timestampValue : JSON.stringify(v));
async function readAll({http, root}) {
  const rows = {};
  for (const t of Object.keys(DATABASE_SCHEMA.tables)) {
    rows[t] = []; let token = '';
    do {
      const r = await http.request({url: `https://firestore.googleapis.com/v1/${root}/${t}?pageSize=300${token ? '&pageToken=' + token : ''}`});
      for (const d of r.data.documents || []) rows[t].push(Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, decode(v)])));
      token = r.data.nextPageToken || '';
    } while (token);
  }
  return rows;
}

export async function main({env = process.env, argv = process.argv.slice(2)} = {}) {
  if (argv.includes('--apply') && env.P6VC_ALLOW_RESIDUE_PURGE !== PURGE_GATE) return {mode: 'BLOCKED', reason: 'MISSING_PURGE_GATE'};
  const c = await client(env);
  const rows = await readAll(c);
  const plan = classify(rows, {adminUsername: env.P6VC_ADMIN_USER || env.P6VC_TEST_USERNAME || ''});
  const total = Object.values(plan.ids).reduce((a, l) => a + l.length, 0);
  const summary = {database: c.db, deleteByCollection: Object.fromEntries(Object.entries(plan.ids).map(([t, l]) => [t, l.length])), deleteTotal: total,
    keptByCollection: plan.kept, driveFilesToTrash: plan.driveRefs.length, rule: plan.rule};
  if (!argv.includes('--apply')) {
    fs.mkdirSync('test-results', {recursive: true});
    const file = path.join('test-results', `residue-purge-plan-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify({createdAt: new Date().toISOString(), ...plan}, null, 1));
    return {mode: 'DRY_RUN', planFile: file, ...summary};
  }
  const planFile = argv[argv.indexOf('--apply') + 1];
  const confirmed = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  let deleted = 0, skipped = 0;
  for (const [t, list] of Object.entries(confirmed.ids)) {
    const still = new Set(plan.ids[t] || []); // re-classified now: only rows that still qualify
    const go = list.filter(id => still.has(id)); skipped += list.length - go.length;
    for (let i = 0; i < go.length; i += 400) {
      await c.http.request({url: `https://firestore.googleapis.com/v1/${c.root}:commit`, method: 'POST',
        data: {writes: go.slice(i, i + 400).map(id => ({delete: `${c.root}/${t}/${id}`}))}});
      deleted += Math.min(400, go.length - i);
    }
  }
  return {mode: 'APPLIED', planFile, deleted, skipped};
}

if (process.argv[1]?.endsWith('purge-synthetic-residue.mjs')) {
  main().then(r => console.log('RESIDUE ' + JSON.stringify(r, null, 1)))
    .catch(e => { console.log('RESIDUE_ERROR ' + String(e.response?.data?.error?.status || e.message).slice(0, 160)); process.exitCode = 1; });
}
