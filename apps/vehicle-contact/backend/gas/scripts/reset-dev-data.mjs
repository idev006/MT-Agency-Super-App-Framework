// Owner-authorized synthetic DEV clean-init reset, executable by any bot under an exact gate.
// Retires ONLY allowlisted synthetic records through the GAS API lifecycle (no direct Sheet
// access, no schema mutation), then re-seeds a fresh ACTIVE fixture set and verifies it.
// Never prints credentials, session tokens, raw responses or personal data. Real/non-synthetic
// rows fail the run closed. Physical row-truncate (Mode B) is a separate editor-only maintenance
// function; this script is the bot-executable lifecycle clean init (Mode A-full).
import './load-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const SYNTHETIC_PLATE_PREFIXES = Object.freeze(['ฑฆ', 'TST', 'DEV', 'กข']);
export const RESET_GATE = 'RUN_SYNTHETIC_DEV_RESET';
export const WRITE_GATE = 'RUN_SYNTHETIC_OWNER_DEV';
const EXEC_URL = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
import {syntheticVehiclePng} from './synthetic-vehicle-image.mjs';
// R7 re-seed: reference-catalog codes (Region 6 provinces, STANDARD, RY01, catalog colours/brands,
// OWNER) so the UI can search and label them, and visible synthetic photos instead of 1×1 px.
// The ฑฆ plate prefix keeps every seeded vehicle recognisable as synthetic for future resets.
export const SEED_PROVINCES = Object.freeze(['65', '64', '63', '66', '53']);
export const SEED_COLORS = Object.freeze(['WHITE', 'BLACK', 'SILVER', 'RED', 'BLUE']);
export const SEED_BRANDS = Object.freeze([['TOYOTA', 'Yaris'], ['HONDA', 'City'], ['ISUZU', 'D-Max'], ['MITSUBISHI', 'Triton'], ['NISSAN', 'Almera']]);
export function seedVehicleFields(i) {
  const [brand, model] = SEED_BRANDS[i % SEED_BRANDS.length];
  return {plate: 'ฑฆ' + String(1000 + i), province: SEED_PROVINCES[i % SEED_PROVINCES.length], plateType: 'STANDARD',
    vehicleType: 'RY01', brand, model, color: SEED_COLORS[i % SEED_COLORS.length], relationship: 'OWNER'};
}
const PHOTO_SLOTS = ['FRONT', 'REAR', 'LEFT', 'RIGHT', 'FRONT_ANGLE'];

export function isSyntheticVehicle(row) {
  const plate = String(row?.plate ?? row?.plate_normalized ?? '');
  const brand = String(row?.brand ?? row?.make ?? '');
  return brand === 'SYNTHETIC' || SYNTHETIC_PLATE_PREFIXES.some(p => plate.startsWith(p));
}
export function isSyntheticOrg(row) {
  const name = String(row?.name ?? '');
  return name.startsWith('P6VC') || String(row?.type ?? '') === 'EXTERNAL';
}
export function isSyntheticUser(row, adminUsername) {
  const username = String(row?.username ?? '');
  const display = String(row?.displayName ?? row?.display_name ?? '');
  if (username === adminUsername) return false;
  return username.startsWith('p6vc_') || display.startsWith('P6VC Automated');
}

function blocked(reason) {
  return {status: 'BLOCKED', blockedReason: reason, secretsExposed: false, tests: [], retired: {}, seeded: 0, cleanup: []};
}

export async function runReset({
  fetchImpl = fetch, env = process.env, argv = [], reportDir = 'test-results',
  now = () => Date.now(), tag = null, persist = true,
} = {}) {
  const url = env.P6VC_GAS_EXEC_URL;
  const adminUser = env.P6VC_ADMIN_USER || env.P6VC_TEST_USERNAME;
  const adminPass = env.P6VC_ADMIN_PASS || env.P6VC_TEST_PASSWORD;
  if (env.P6VC_ALLOW_DEV_RESET !== RESET_GATE) return blocked('MISSING_DEV_RESET_GATE');
  if (env.P6VC_ALLOW_OWNER_DEV_WRITES !== WRITE_GATE) return blocked('MISSING_WRITE_CONFIRMATION');
  if (!EXEC_URL.test(url || '')) return blocked('INVALID_EXEC_URL');
  if (!adminUser || !adminPass) return blocked('MISSING_ADMIN_CREDENTIALS');

  const countArg = argv.find(a => a.startsWith('--count='));
  const modeArg = argv.find(a => a.startsWith('--mode='));
  const mode = modeArg ? modeArg.slice(7) : 'lifecycle';
  if (mode !== 'lifecycle') return blocked('TRUNCATE_REQUIRES_EDITOR_MAINTENANCE');
  const count = Math.max(1, Math.min(20, Number(countArg ? countArg.slice(8) : 10) || 10));
  const runTag = tag || now().toString(36);

  const report = {
    status: 'RUNNING', mode: 'lifecycle', environment: 'SYNTHETIC_DEV', target: url,
    startedAt: new Date(now()).toISOString(), requestedCount: count, tests: [],
    retired: {vehicles: 0, campaigns: 0, organizations: 0, users: 0}, seeded: 0,
    cleanup: [], backup: null, secretsExposed: false,
  };
  const dir = reportDir;
  const write = () => {
    if (!persist) return;
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'p6vc-dev-clean-reset.json'), JSON.stringify(report, null, 2) + '\n');
  };
  write();

  let adminToken = null;
  const request = async (operation, payload = {}, token = null) => {
    const split = operation.indexOf('.');
    const response = await fetchImpl(url, {
      method: 'POST', redirect: 'follow',
      headers: {'content-type': 'text/plain;charset=utf-8', accept: 'application/json'},
      body: JSON.stringify({
        apiVersion: 'v1', group: operation.slice(0, split), action: operation.slice(split + 1),
        payload, ...(token ? {sessionToken: token} : {}), requestId: 'devReset' + runTag,
      }),
    });
    let body; try { body = await response.json(); } catch { throw new Error('NON_JSON_RESPONSE'); }
    if (response.status !== 200) throw new Error('HTTP_' + response.status);
    if (!body || typeof body.ok !== 'boolean') throw new Error('INVALID_API_ENVELOPE');
    return body;
  };
  const ok = body => { if (body.ok !== true) throw new Error(body.error?.code || 'API_FAILED'); return body.data; };
  const listAll = async (operation, token) => {
    const all = [];
    for (let page = 1; ; page++) {
      const data = ok(await request(operation, {page, pageSize: 100}, token));
      const items = Array.isArray(data) ? data : (data.items || []);
      all.push(...items);
      const totalPages = Array.isArray(data) ? 1 : (data.totalPages || 1);
      if (page >= totalPages || items.length === 0) break;
    }
    return all;
  };
  const step = async (id, fn) => {
    const started = now();
    try { const data = await fn(); report.tests.push({id, status: 'PASS', durationMs: now() - started}); write(); return data; }
    catch (error) { report.tests.push({id, status: 'FAIL', durationMs: now() - started, reason: String(error?.message || error).slice(0, 120)}); write(); throw error; }
  };

  const seedVehicles = [];
  let seedCampaign = null, seedOrg = null;
  try {
    await step('HEALTH', async () => {
      const data = ok(await request('system.health'));
      if (data.status !== 'ready') throw new Error('NOT_READY');
      return data;
    });
    adminToken = ok(await request('auth.login', {username: adminUser, password: adminPass})).sessionToken;
    await step('ADMIN_SESSION', async () => {
      const session = ok(await request('auth.session', {}, adminToken));
      if (!session.roles.includes('SYSTEM_ADMIN')) throw new Error('SYSTEM_ADMIN_REQUIRED');
      return session;
    });

    // Backup inventory snapshot (IDs/status/synthetic plate only; no PII) BEFORE any mutation.
    const activeVehicles = await listAll('vehicles.list', adminToken);
    const campaigns = await listAll('campaigns.list', adminToken);
    const organizations = await listAll('organizations.list', adminToken);
    const users = await listAll('users.list', adminToken);
    const nonSynthetic = activeVehicles.filter(v => !isSyntheticVehicle(v));
    if (nonSynthetic.length) {
      report.status = 'FAIL'; report.fatal = 'NON_SYNTHETIC_ACTIVE_VEHICLE'; write();
      return report; // fail closed: never touch a row we cannot prove is synthetic
    }
    const backup = {
      takenAt: new Date(now()).toISOString(),
      vehicles: activeVehicles.map(v => ({vehicleId: v.vehicleId, plate: v.plate, status: v.status})),
      campaigns: (Array.isArray(campaigns) ? campaigns : []).map(c => ({campaignId: c.campaignId, status: c.status})),
      organizations: (Array.isArray(organizations) ? organizations : []).map(o => ({organizationId: o.organizationId || o.organization_id, name: o.name, type: o.type})),
      users: (Array.isArray(users) ? users : []).map(u => ({userId: u.userId, username: u.username, status: u.status})),
    };
    if (persist) {
      fs.mkdirSync(dir, {recursive: true});
      const backupPath = path.join(dir, 'p6vc-dev-reset-backup-' + runTag + '.json');
      fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2) + '\n');
      report.backup = 'test-results/' + path.basename(backupPath);
    }
    write();

    // Retire synthetic ACTIVE vehicles via lifecycle (preserves audit/relational integrity).
    for (const v of activeVehicles) {
      await step('RETIRE_VEHICLE_' + v.vehicleId, async () => {
        ok(await request('vehicles.cancel', {vehicleId: v.vehicleId}, adminToken));
        report.retired.vehicles++;
      });
    }
    for (const c of (Array.isArray(campaigns) ? campaigns : [])) {
      if (String(c.status || 'ACTIVE') === 'REVOKED') continue;
      await step('REVOKE_CAMPAIGN_' + c.campaignId, async () => {
        ok(await request('campaigns.revoke', {campaignId: c.campaignId}, adminToken));
        report.retired.campaigns++;
      });
    }
    for (const o of (Array.isArray(organizations) ? organizations : [])) {
      if (!isSyntheticOrg(o)) continue;
      if ((o.status ?? 'ACTIVE') !== 'ACTIVE') continue; // already retired: skip the API round-trip
      const oid = o.organizationId || o.organization_id;
      await step('DISABLE_ORG_' + oid, async () => {
        ok(await request('organizations.disable', {organizationId: oid}, adminToken));
        report.retired.organizations++;
      });
    }
    for (const u of (Array.isArray(users) ? users : [])) {
      if (!isSyntheticUser(u, adminUser)) continue;
      if (u.status === 'SUSPENDED') continue; // already retired: skip the API round-trip
      await step('SUSPEND_USER_' + u.userId, async () => {
        ok(await request('users.suspend', {userId: u.userId}, adminToken));
        report.retired.users++;
      });
    }

    // Re-seed a fresh ACTIVE fixture set: 1 contact / 5 photos / QR MATCH per vehicle.
    seedOrg = ok(await request('organizations.create', {name: 'P6VC Reset ' + runTag, type: 'EXTERNAL'}, adminToken));
    const t = now();
    seedCampaign = ok(await request('campaigns.create', {
      startsAt: new Date(t - 60000).toISOString(), endsAt: new Date(t + 3600000).toISOString(),
      maxSubmissions: count + 10,
    }, adminToken));
    for (let i = 0; i < count; i++) {
      const seed = seedVehicleFields(i), plate = seed.plate;
      const photos = [];
      for (const slot of PHOTO_SLOTS) {
        const data = ok(await request('photos.upload', {campaignToken: seedCampaign.campaignToken, slot, base64Image: syntheticVehiclePng({index: i, slot}), mimeType: 'image/png'}));
        photos.push({slot, photoId: data.photoId});
      }
      const registration = {
        campaignToken: seedCampaign.campaignToken, plate, province: seed.province, plateType: seed.plateType,
        vehicleType: seed.vehicleType, brand: seed.brand, model: seed.model, color: seed.color,
        organizationId: seedOrg.organizationId, relationship: seed.relationship,
        contactName: 'Synthetic Reset Contact', contactPhone: '+66810000002', photos,
        idempotencyKey: 'reset-' + runTag + '-' + plate,
      };
      const submitted = ok(await request('registrations.submit', registration));
      const approved = ok(await request('registrations.review', {requestId: submitted.requestId, decision: 'APPROVE', stickerCategory: 'NCO', platePhotoVerified: true}, adminToken));
      await step('SEED_VERIFY_' + plate, async () => {
        const lookup = ok(await request('vehicles.lookup', {plate, province: seed.province}, adminToken));
        if (lookup.vehicleId !== approved.vehicleId) throw new Error('LOOKUP_MISMATCH');
        const photoList = ok(await request('photos.list', {vehicleId: approved.vehicleId}, adminToken));
        if (photoList.length !== 5) throw new Error('PHOTO_COUNT');
        const resolved = ok(await request('qr.resolve', {token: approved.qrToken}, adminToken));
        if (resolved.vehicleId !== approved.vehicleId) throw new Error('QR_MISMATCH');
      });
      seedVehicles.push({vehicleId: approved.vehicleId, plate});
      report.seeded++;
    }

    report.status = 'PASS';
  } catch (error) {
    report.status = report.fatal ? report.status : 'FAIL';
    report.fatal = report.fatal || String(error?.message || error).slice(0, 120);
  } finally {
    // Keep the seeded ACTIVE vehicles + org as the delivered clean test data.
    if (adminToken && seedCampaign?.campaignId) {
      try { ok(await request('campaigns.revoke', {campaignId: seedCampaign.campaignId}, adminToken)); report.cleanup.push({id: 'SEED_CAMPAIGN_REVOKE', status: 'PASS'}); }
      catch (error) { report.cleanup.push({id: 'SEED_CAMPAIGN_REVOKE', status: 'FAIL', reason: String(error?.message || error).slice(0, 120)}); }
    }
    if (adminToken) {
      try { ok(await request('auth.logout', {}, adminToken)); report.cleanup.push({id: 'ADMIN_LOGOUT', status: 'PASS'}); }
      catch (error) { report.cleanup.push({id: 'ADMIN_LOGOUT', status: 'FAIL', reason: String(error?.message || error).slice(0, 120)}); }
    }
    report.finishedAt = new Date(now()).toISOString();
    report.seedVehicles = seedVehicles;
    if (report.cleanup.some(c => c.status === 'FAIL') && report.status === 'PASS') report.status = 'CLEANUP_FAIL';
    write();
  }
  return report;
}

export function exitCodeFor(report) {
  if (report.status === 'PASS') return 0;
  if (report.status === 'BLOCKED') return 2;
  if (report.status === 'CLEANUP_FAIL') return 3;
  return 1;
}

async function main() {
  const report = await runReset({argv: process.argv.slice(2)});
  console.log('DEV_RESET ' + JSON.stringify({
    status: report.status, blockedReason: report.blockedReason || null,
    retired: report.retired, seeded: report.seeded,
    cleanupFailed: report.cleanup.filter(c => c.status === 'FAIL').length,
    report: 'test-results/p6vc-dev-clean-reset.json',
  }));
  process.exitCode = exitCodeFor(report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error('DEV_RESET_FATAL ' + String(error?.message || error).slice(0, 120)); process.exitCode = 1; });
}