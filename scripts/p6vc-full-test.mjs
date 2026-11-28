#!/usr/bin/env node
// P6VC full automated test — one command, every layer, one report (owner 2026-11-28: "automate full test ด้วย world class grade").
//
//   node scripts/p6vc-full-test.mjs --offline      L0–L3: no cloud, no writes (any machine, CI-equivalent)
//   node scripts/p6vc-full-test.mjs --live         L0–L5: + the live DEV system through p6vc-core (synthetic data)
//
// Layers (in order; a failed layer is reported, the next still runs, the verdict is FAIL):
//   L0 static     generated system maps current, SSOT + use-case SSOT validators
//   L1 unit       core (incl. the legacy acceptance tests run THROUGH the core), legacy specification, web app unit
//   L2 browser    web app E2E on a mocked API (Playwright) + axe accessibility in those specs
//   L3 build      production build with VITE_CORE_API_URL = the core; the bundle calls the core and no Worker / GAS / p6vc-api
//   L4 live API   live suite through the core (every operation, every role) + DATA_PROOF: an independent Firestore read-back that
//                 must START after the suite's authenticated inventory ENDED (freshness gate)
//   L5 live UI    the real web app on localhost against the live core: role journey (approve → owner → staff → public QR) +
//                 route sweep (4 roles × desktop / phone: renders, no error, core only, axe, no sideways scroll). The deeper
//                 settings / QR-print page checks (frontend/scripts/live-settings-ui.mjs, live-print-ui.mjs) run on their own.
// Live layers need the gitignored .env (synthetic accounts, Firestore read key) and set their own synthetic-write gates.
// Report: test-results/p6vc-full-test.json + .md (no secrets; each layer's own report is linked).
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'apps/vehicle-contact');
const dirs = {core: path.join(app, 'backend/core'), gas: path.join(app, 'backend/gas'), fe: path.join(app, 'frontend')};
const live = process.argv.includes('--live');
if (!live && !process.argv.includes('--offline')) { console.error('usage: node scripts/p6vc-full-test.mjs --offline | --live'); process.exit(2); }
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx', npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const coreUrl = spawnSync(process.execPath, [path.join(root, 'scripts/print-core-frontend-url.mjs')], {encoding: 'utf8'}).stdout.trim();

const report = {startedAt: new Date().toISOString(), mode: live ? 'live' : 'offline', coreEndpoint: coreUrl, layers: []};
function step(layer, name, cmd, args, {cwd = root, env = {}, parse = null, timeoutMs = 30 * 60000} = {}) {
  const t0 = Date.now();
  console.log(`\n=== ${layer} ${name}`);
  const r = spawnSync(cmd, args, {cwd, env: {...process.env, ...env}, encoding: 'utf8', shell: process.platform === 'win32' && /\.cmd$/.test(cmd), timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024});
  const text = (r.stdout || '') + (r.stderr || '');
  const tail = text.trim().split('\n').slice(-6).join('\n');
  let ok = r.status === 0, detail = '';
  if (parse) { const p = parse(text); ok = ok && p.ok; detail = p.detail || ''; }
  const entry = {layer, name, ok, ms: Date.now() - t0, detail: detail || tail.split('\n').at(-1) || ''};
  report.layers.push(entry);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${layer} ${name} (${Math.round(entry.ms / 1000)} s) ${entry.detail}`);
  if (!ok) console.log(tail);
  return {ok, text};
}
const match = (re, f) => text => { const m = text.match(re); return m ? f(m) : {ok: false, detail: 'no summary line'}; };

// L0 static
step('L0', 'system maps current', process.execPath, ['scripts/gen-system-maps.mjs', '--check']);
step('L0', 'SSOT validators', process.execPath, ['scripts/validate-ssot.mjs']);
step('L0', 'use-case SSOT', process.execPath, ['scripts/validate-usecase-ssot.mjs']);
// L1 unit
step('L1', 'core + legacy acceptance through the core', npm, ['test'], {cwd: dirs.core,
  parse: match(/ℹ pass (\d+)[\s\S]*?ℹ fail (\d+)/, m => ({ok: m[2] === '0', detail: `${m[1]} pass, ${m[2]} fail`}))});
step('L1', 'legacy specification (backend/gas npm run check)', npm, ['run', 'check:summary'], {cwd: dirs.gas,
  parse: match(/(PASS|FAIL) backend-check: passed (\d+) · failed (\d+)/, m => ({ok: m[1] === 'PASS', detail: `${m[2]} pass, ${m[3]} fail`}))});
step('L1', 'web app unit (vitest)', npm, ['run', 'test:summary'], {cwd: dirs.fe,
  parse: match(/(PASS|FAIL) frontend-unit: passed (\d+) · failed (\d+)/, m => ({ok: m[1] === 'PASS', detail: `${m[2]} pass, ${m[3]} fail`}))});
// L2 browser on a mocked API
step('L2', 'web app E2E + a11y (Playwright, mocked API)', npm, ['run', 'test:e2e:summary'], {cwd: dirs.fe,
  parse: match(/(PASS|FAIL) frontend-e2e: passed (\d+) · failed (\d+)/, m => ({ok: m[1] === 'PASS', detail: `${m[2]} pass, ${m[3]} fail`}))});
// L3 production build pointed at the core
{
  const dist = path.join(dirs.fe, 'dist');
  const b = step('L3', 'production build (VITE_CORE_API_URL = core)', npx, ['vite', 'build'], {cwd: dirs.fe, env: {VITE_CORE_API_URL: coreUrl}});
  if (b.ok) {
    const js = fs.readdirSync(path.join(dist, 'assets')).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(dist, 'assets', f), 'utf8')).join('\n');
    // the GAS bridge URL may appear as DATA (the endpoint list on the About page); which hosts are really CALLED is checked
    // on the network by L5 (any request to a Worker, p6vc-api or GAS /exec fails it)
    const calls = js.includes(coreUrl), worker = /workers\.dev/.test(js);
    report.layers.push({layer: 'L3', name: 'bundle calls the core; no Worker endpoint', ok: calls && !worker,
      detail: `core=${calls} worker=${worker} (real calls: L5 network check)`, ms: 0});
    console.log(`${calls && !worker ? 'PASS' : 'FAIL'} L3 bundle endpoints core=${calls} worker=${worker}`);
  }
}
if (live) {
  // L4 live API + independent data proof (freshness)
  const core = coreUrl.replace(/\/api\/frontend$/, '');
  step('L4', 'live suite through the core + DATA_PROOF', process.execPath, ['scripts/run-live-api-suite.mjs', '--require-authenticated', '--require-data-proof'],
    {cwd: dirs.gas, env: {P6VC_API_BASE_URL: core, P6VC_GAS_EXEC_URL: core, P6VC_ALLOW_FIRESTORE_DEV_PROBE: 'RUN_SYNTHETIC_FIRESTORE_PROBE'},
      parse: match(/LIVE_SUITE (\{.*\})/, m => { const j = JSON.parse(m[1]); return {ok: j.status === 'PASS', detail: `${j.passed}/${j.passed + j.failed}, p50 ${j.latency?.p50} ms`}; })});
  try {
    const s = JSON.parse(fs.readFileSync(path.join(root, 'test-results/p6vc-live-api-suite.json'), 'utf8'));
    const p = JSON.parse(fs.readFileSync(path.join(root, 'test-results/p6vc-firestore-readback-proof.json'), 'utf8'));
    const inv = (s.stages || []).find(x => x.id === 'AUTHENTICATED_FULL_INVENTORY');
    const fresh = p.status === 'PASS' && inv && Date.parse(p.startedAt) > Date.parse(inv.finishedAt) && Date.parse(s.startedAt) >= Date.parse(report.startedAt);
    report.layers.push({layer: 'L4', name: 'DATA_PROOF fresher than the suite inventory (and from this run)', ok: fresh, ms: 0,
      detail: `proof ${p.startedAt} > inventory ${inv?.finishedAt}`});
    console.log(`${fresh ? 'PASS' : 'FAIL'} L4 freshness proof ${p.startedAt} > inventory ${inv?.finishedAt}`);
  } catch (e) { report.layers.push({layer: 'L4', name: 'DATA_PROOF freshness', ok: false, detail: e.message, ms: 0}); }
  // L5 live UI
  const writes = {P6VC_ALLOW_OWNER_DEV_WRITES: 'RUN_SYNTHETIC_OWNER_DEV'};
  step('L5', 'live UI journey + route sweep (real web app → live core)', process.execPath, ['scripts/live-journey-ui.mjs'], {cwd: dirs.fe, env: writes,
    parse: match(/LIVE_JOURNEY_UI (\{.*\})/, m => { const j = JSON.parse(m[1]); return {ok: j.status === 'PASS', detail: `${j.checks - j.failed}/${j.checks} checks, ${j.pageViews} page views`}; })});
}
report.finishedAt = new Date().toISOString();
report.status = report.layers.every(l => l.ok) ? 'PASS' : 'FAIL';
fs.mkdirSync(path.join(root, 'test-results'), {recursive: true});
fs.writeFileSync(path.join(root, 'test-results/p6vc-full-test.json'), JSON.stringify(report, null, 2) + '\n');
const md = ['# P6VC full test — ' + report.status, '', `Mode **${report.mode}** · ${report.startedAt} → ${report.finishedAt} · core \`${coreUrl}\``, '',
  '| Layer | Check | Result | Detail | Time |', '|---|---|---|---|---|',
  ...report.layers.map(l => `| ${l.layer} | ${l.name} | ${l.ok ? 'PASS' : '**FAIL**'} | ${String(l.detail).replace(/\|/g, '/')} | ${Math.round(l.ms / 1000)} s |`)];
fs.writeFileSync(path.join(root, 'test-results/p6vc-full-test.md'), md.join('\n') + '\n');
console.log('\nFULL_TEST ' + JSON.stringify({status: report.status, mode: report.mode, layers: report.layers.length, failed: report.layers.filter(l => !l.ok).map(l => l.layer + ' ' + l.name)}));
process.exit(report.status === 'PASS' ? 0 : 1);
