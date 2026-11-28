// Generated system maps (owner 2026-11-26: "การมีแผนที่ของ system ทำให้คุณทำงานได้เร็วขึ้น และลดการผิดพลาดได้มั้ย" →
// "Yes, after checks"). Hand-written maps go stale; these are generated from the source and CI fails when they differ.
//   node scripts/gen-system-maps.mjs           write apps/vehicle-contact/docs/generated/*.md
//   node scripts/gen-system-maps.mjs --check   exit 1 when a generated map no longer matches the code (CI)
// Maps:
//   DATA_ACCESS_MAP.md     which backend module reads / writes which Firestore table, and the reverse (table → modules),
//                          incl. the store rules that write on every path (log policy, print state)
//   CHANGE_CHECKLIST.md    where to touch when adding an API operation (every file that wires the reference operation +
//                          every hard-coded operation count), and what to deploy for a change in each folder
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = path.join(root, 'apps/vehicle-contact');
const outDir = path.join(app, 'docs/generated');
const rel = p => path.relative(root, p).split(path.sep).join('/');
const read = p => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const walk = (dir, keep) => fs.existsSync(dir) ? fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => {
  const p = path.join(dir, e.name);
  // skip build output, reports and every dot folder (.git, .claude worktrees, …): only the tracked source counts
  if (e.isDirectory()) return e.name.startsWith('.') || ['node_modules', 'dist', 'test-results', 'e2e-results', 'generated'].includes(e.name) ? [] : walk(p, keep);
  return keep(p) ? [p] : [];
}) : [];

const schema = JSON.parse(read(path.join(app, 'schema/database.schema.json')));
const TABLES = Object.keys(schema.tables).sort();
const inventory = JSON.parse(read(path.join(app, 'contracts/api-inventory.v1.json')));
const OPS = inventory.operations.map(o => o.group + '.' + o.action).sort();

// ---- data access: per backend module, the tables it reads and writes ----
const WRITE = [/\b(insert|update|remove|patch)\(\s*'(vc_[a-z_]+)'/g, /op:\s*'(insert|update|remove)'\s*,\s*table:\s*'(vc_[a-z_]+)'/g,
  /inserts:\s*\[\s*\[\s*'(vc_[a-z_]+)'/g /* readMany inserts: [['vc_x', row]] */,
  /patch:\s*\{\s*table:\s*'(vc_[a-z_]+)'/g /* flow effect {patch: {table: 'vc_x', ...}} (VC-ADR-046) */];
const READ = [/\b(one|list|listNewest|count)\(\s*'(vc_[a-z_]+)'/g, /name:\s*'(vc_[a-z_]+)'/g];
const tableOf = m => m.find(x => typeof x === 'string' && x.startsWith('vc_'));
// a table name held in a module constant (const SETTINGS = 'vc_settings') is followed where the constant is used
const CONST_WRITE = [/\b(?:insert|update|remove|patch)\(\s*([A-Z][A-Z0-9_]*)\s*,/g, /op:\s*'(?:insert|update|remove)'\s*,\s*table:\s*([A-Z][A-Z0-9_]*)\b/g];
const CONST_READ = [/\b(?:one|list|listNewest|count)\(\s*([A-Z][A-Z0-9_]*)\s*,/g, /name:\s*([A-Z][A-Z0-9_]*)\b/g];
export function scanModule(source) {
  const writes = new Set(), reads = new Set();
  for (const re of WRITE) for (const m of source.matchAll(re)) writes.add(tableOf(m.slice(1)));
  for (const re of READ) for (const m of source.matchAll(re)) reads.add(tableOf(m.slice(1)));
  const consts = new Map([...source.matchAll(/\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*'(vc_[a-z_]+)'/g)].map(m => [m[1], m[2]]));
  for (const re of CONST_WRITE) for (const m of source.matchAll(re)) if (consts.has(m[1])) writes.add(consts.get(m[1]));
  for (const re of CONST_READ) for (const m of source.matchAll(re)) if (consts.has(m[1])) reads.add(consts.get(m[1]));
  const ops = OPS.filter(op => new RegExp(`'${op.replace('.', '\\.')}'\\s*:`).test(source));
  return {ops, reads: [...reads].filter(t => TABLES.includes(t)).sort(), writes: [...writes].filter(t => TABLES.includes(t)).sort()};
}
const backend = path.join(app, 'backend/gas/src');
// VC-ADR-056 T1: the Node core's own modules too (use cases, facade, jobs) — the backend moves there operation by operation
const core = path.join(app, 'backend/core/src');
const modules = walk(path.join(backend, 'application'), p => p.endsWith('.js'))
  .concat(walk(path.join(backend, 'infrastructure/security'), p => p.endsWith('.js')))
  .concat(walk(core, p => p.endsWith('.mjs') && !p.includes(`${path.sep}adapters${path.sep}`)))
  .map(p => ({file: rel(p), ...scanModule(read(p))}));
// a store rule may live in a module that names no table itself (e.g. LogPolicyOperations), so rules search every file
const allModules = modules.splice(0, modules.length);
modules.push(...allModules.filter(m => m.reads.length || m.writes.length || m.ops.length).sort((a, b) => a.file.localeCompare(b.file)));
// store rules: wrappers that change writes on every path (found by name, not guessed)
const RULES = [['withLogPolicyStore', 'skips switched-off log rows, adds expire_at (VC-ADR-040)'], ['withPrintStateStore', 'a new ACTIVE QR puts the vehicle back to NOT_PRINTED (VC-ADR-042)']]
  .map(([name, what]) => ({name, what, file: allModules.find(m => read(path.join(root, m.file)).includes('export function ' + name))?.file || 'NOT FOUND'}));
// bulk operations whose table names are computed at run time (a static scan cannot list them)
const BULK = [['SystemResetOperations.js', 'system.reset.execute', 'removes the rows of EVERY table except the master tables (and the kept users / organizations / own session) — VC-ADR-039']]
  .map(([f, op, what]) => ({op, what, file: modules.find(m => m.file.endsWith('/' + f))?.file || 'NOT FOUND'}));
if ([...RULES, ...BULK].some(r => r.file === 'NOT FOUND')) throw new Error('a store rule or bulk operation moved: update scripts/gen-system-maps.mjs');

const short = f => f.replace('apps/vehicle-contact/backend/gas/src/', '').replace('apps/vehicle-contact/backend/core/src/', 'core: ');
const list = a => (a.length ? a.map(x => '`' + x + '`').join(' ') : '—');
let dam = '# Data access map (generated)\n\n> Generated by `scripts/gen-system-maps.mjs` from the source. **Do not edit by hand** — CI (`--check`) fails when it differs from the code.\n';
dam += '> Static scan: a module that builds a table name at run time is not seen. Module level, not operation level.\n\n';
dam += '## Store rules (apply to every write path)\n\n| Rule | Where | What it does |\n|---|---|---|\n';
for (const r of RULES) dam += `| \`${r.name}\` | \`${short(r.file)}\` | ${r.what} |\n`;
for (const x of BULK) dam += `| bulk \`${x.op}\` | \`${short(x.file)}\` | ${x.what} |\n`;
dam += '\n## Table → modules (who writes / reads it)\n\n| Table | Written by | Read by |\n|---|---|---|\n';
for (const t of TABLES) {
  const w = modules.filter(m => m.writes.includes(t)).map(m => short(m.file)), r = modules.filter(m => m.reads.includes(t)).map(m => short(m.file));
  dam += `| \`${t}\` | ${list(w)} | ${list(r)} |\n`;
}
dam += '\n## Module → operations and tables\n\n| Module | Operations | Writes | Reads |\n|---|---|---|---|\n';
for (const m of modules) dam += `| \`${short(m.file)}\` | ${list(m.ops)} | ${list(m.writes)} | ${list(m.reads)} |\n`;
const covered = new Set(modules.flatMap(m => m.ops));
dam += `\nOperations registered in these modules: ${covered.size} of ${OPS.length} in the inventory` +
  (OPS.filter(o => !covered.has(o)).length ? ` (elsewhere: ${list(OPS.filter(o => !covered.has(o)))})` : '') + '.\n';

// ---- change checklist ----
const REF_OP = 'qr.markPrinted'; // the newest operation: wired everywhere an operation must be
const searchable = walk(root, p => /\.(m?js|json|md|mmd|ya?ml|vue)$/.test(p) && !p.includes(`${path.sep}docs${path.sep}generated`)
  && !/DECISION_LOG|expected-live-version|package-lock/.test(p));
const wiring = searchable.filter(p => read(p).includes(REF_OP)).map(rel).filter(f => f !== 'scripts/gen-system-maps.mjs').sort();
const N = OPS.length;
// operation counts (N = inventory, N-1 = DTO operations without health) and the RBAC matrix totals (protected × roles)
const countRe = new RegExp(`((?:length|size)\\s*(?:===|!==|,)\\s*(${N}|${N - 1})\\b)|(\\b(${N}|${N - 1}) (?:operations|routes|DTOs)\\b)|(assert\\.equal\\((?:count|total),\\s*\\d+\\))`);
const counts = searchable.filter(p => /\.(m?js)$/.test(p)).flatMap(p => read(p).split('\n').map((l, i) => [rel(p), i + 1, l])
  // file + the matched text (not the line number, so unrelated edits do not make the map stale)
  .filter(([, , l]) => countRe.test(l) && !/version\.length|\.slice\(|padStart/.test(l)).map(([f, , l]) => `${f}\` — \`${l.match(countRe)[0]}`)).sort();
const DEPLOY = [
  ['apps/vehicle-contact/backend/gas/src', 'backend', 'GAS push (`PUSH_VEHICLE_GAS`) + `clasp update-deployment -V <new>` + Cloud Run deploy; then live suite + DATA_PROOF'],
  ['apps/vehicle-contact/backend/core', 'Node core (VC-ADR-046)', '`deploy-vehicle-core.yml` (`DEPLOY_VEHICLE_CORE`); a change in backend/cloudrun or backend/gas/src also reaches the core (it imports them) — deploy both; then `deploy-vehicle-jobs.yml` (`DEPLOY_VEHICLE_JOBS`) so the Cloud Run Jobs run the new core image (a job keeps the image it was deployed with)'],
  ['apps/vehicle-contact/backend/cloudrun', 'shared HTTP handler + browser gateway', 'used by the legacy service AND the core: deploy both'],
  ['apps/vehicle-contact/schema/database.schema.json', 'new field', 'a backfill script for existing rows if a filter or rule depends on it'],
  ['apps/vehicle-contact/contracts/firestore-indexes.v1.json', 'indexes', '`ensure-firestore-indexes.mjs --apply` BEFORE the backend deploy'],
  ['apps/vehicle-contact/contracts/firestore-field-config.v1.json', 'TTL / exemptions', '`ensure-firestore-field-config.mjs --apply`'],
  ['apps/vehicle-contact/frontend/src', 'web app', 'GitHub Pages deploys on merge; check the bundle version on the live site'],
  ['.github/workflows/deploy-vehicle-core.yml', 'core deploy pipeline', 'proven only by a real deploy run (the first run creates p6vc-core)'],
  ['.github/workflows/deploy-vehicle-jobs.yml', 'core jobs pipeline (Cloud Run Jobs p6vc-housekeeping + p6vc-photo-audit)', 'proven only by a real run: its JOB report (mode KEEP by default; APPLY needs `APPLY_DRIVE_HOUSEKEEPING`)'],
  ['.github/workflows/run-vehicle-jobs.yml', 'daily start of the core jobs (GitHub schedule 03:30 Bangkok)', 'starts the job as deployed (image + mode come from deploy-vehicle-jobs); proven by a run that ends in success'],
  ['.github/workflows/admin-tools-job.yml', 'manual admin tools job p6vc-admin-tools (R11: first admin / admin password reset)', 'runs the job from the live core image: deploy p6vc-core first; PREVIEW before APPLY; the owner creates and deletes the secret p6vc-admin-temp-password'],
];
for (const [p] of DEPLOY) if (!fs.existsSync(path.join(root, p))) throw new Error('checklist path missing: ' + p);
let cc = '# Change checklist (generated)\n\n> Generated by `scripts/gen-system-maps.mjs` from the source. **Do not edit by hand** — CI (`--check`) fails when it differs from the code.\n\n';
cc += `## Adding an API operation (now ${N})\n\nEvery file that wires the reference operation \`${REF_OP}\` — a new operation needs the same places:\n\n`;
cc += wiring.map(f => `- [ ] \`${f}\``).join('\n') + '\n\nHard-coded operation counts (update them, or better: derive from the inventory):\n\n';
cc += (counts.length ? counts.map(f => `- [ ] \`${f}\``).join('\n') : '- none') + '\n\n';
cc += '## What to deploy for a change in…\n\n| Changed | What | Deploy / follow-up |\n|---|---|---|\n' + DEPLOY.map(([p, w, d]) => `| \`${p}\` | ${w} | ${d} |`).join('\n') + '\n';

// ---- SSOT ratchet (NODE_CORE_ARCHITECTURE §6): copies of single-source facts outside their owner may only go DOWN ----
// Code and config only (tests, docs and generated files are not counted). Baseline: scripts/ssot-ratchet.json (written here).
const backendVersion = JSON.parse(read(path.join(app, 'backend/gas/package.json'))).version;
const FACTS = [
  {id: 'photo-slots', owner: 'apps/vehicle-contact/backend/gas/src/domain/policies/VehicleLifecycle.js', re: /['"]FRONT_ANGLE['"]/},
  {id: 'gas-webapp-url', owner: 'apps/vehicle-contact/contracts/trusted-endpoints.v1.json', re: /AKfycby15c-Aux2za0[A-Za-z0-9_-]+/},
  {id: 'cloud-run-core-url', owner: 'apps/vehicle-contact/contracts/trusted-endpoints.v1.json', re: /p6vc-core-46858005337/},
  {id: 'backend-version', owner: 'apps/vehicle-contact/backend/gas/package.json', re: new RegExp('["\']' + backendVersion.replace(/\./g, '\.') + '["\']')}
];
const scanned = ['apps', 'tools', 'scripts', '.github'].flatMap(d => walk(path.join(root, d), f => /\.(m?js|vue|ya?ml|toml|sh|json)$/.test(f)))
  .concat(walk(path.join(root, '.github'), f => /\.ya?ml$/.test(f)))
  .map(rel).filter((f, i, all) => all.indexOf(f) === i)
  .filter(f => !/(^|\/)(tests?|e2e|docs|fixtures)\//.test(f) && !/\.test\.(m?js)$/.test(f) && !/package-lock\.json$/.test(f) && f !== 'scripts/ssot-ratchet.json' && f !== 'scripts/gen-system-maps.mjs'); // the generator names patterns, not facts
const copies = Object.fromEntries(FACTS.map(fact => [fact.id, scanned.filter(f => f !== fact.owner && fact.re.test(read(path.join(root, f)))).sort()]));
const ratchetFile = path.join(root, 'scripts/ssot-ratchet.json');
const baseline = fs.existsSync(ratchetFile) ? JSON.parse(read(ratchetFile)) : {};
const grew = FACTS.filter(f => baseline[f.id] !== undefined && copies[f.id].length > baseline[f.id]);
const ratchet = Object.fromEntries(FACTS.map(f => [f.id, Math.min(baseline[f.id] ?? Infinity, copies[f.id].length)]));
cc += '\n## Copies of single-source facts (SSOT ratchet)\n\nEach fact has one owner; these files still carry a copy. CI fails when a count goes **up**; remove copies by importing or generating from the owner (NODE_CORE_ARCHITECTURE §6).\n\n';
cc += '| Fact | Owner | Copies |\n|---|---|---|\n' + FACTS.map(f => `| ${f.id} | \`${f.owner}\` | ${copies[f.id].length} |`).join('\n') + '\n\n';
for (const f of FACTS) if (copies[f.id].length) cc += `<details><summary>${f.id} (${copies[f.id].length})</summary>\n\n` + copies[f.id].map(x => `- \`${x}\``).join('\n') + '\n\n</details>\n\n';
if (grew.length) {
  console.log('SSOT_RATCHET: NEW COPY of ' + grew.map(f => `${f.id} (${baseline[f.id]} -> ${copies[f.id].length})`).join(', ') + ' — import or generate it from the owner instead');
  process.exit(1);
}
const ratchetJson = JSON.stringify({note: 'Written by scripts/gen-system-maps.mjs. Allowed copies per single-source fact; may only go down.', ...ratchet}, null, 2) + '\n';

const files = {'DATA_ACCESS_MAP.md': dam, 'CHANGE_CHECKLIST.md': cc};
if (process.argv.includes('--check')) {
  const stale = Object.entries(files).filter(([f, s]) => !fs.existsSync(path.join(outDir, f)) || read(path.join(outDir, f)) !== s).map(([f]) => f);
  if (!fs.existsSync(ratchetFile) || read(ratchetFile) !== ratchetJson) stale.push('scripts/ssot-ratchet.json (copies went down: lower the ratchet)');
  if (stale.length) { console.log('SYSTEM_MAPS: STALE ' + stale.join(', ') + ' — run: node scripts/gen-system-maps.mjs'); process.exit(1); }
  console.log(`SYSTEM_MAPS: PASSED; ${modules.length} modules, ${TABLES.length} tables, ${N} operations, ${wiring.length} wiring files`);
} else {
  fs.mkdirSync(outDir, {recursive: true});
  for (const [f, s] of Object.entries(files)) fs.writeFileSync(path.join(outDir, f), s);
  fs.writeFileSync(ratchetFile, ratchetJson);
  console.log('SYSTEM_MAPS: written ' + Object.keys(files).join(', '));
}
