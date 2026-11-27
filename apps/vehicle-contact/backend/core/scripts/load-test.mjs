// Load test (VC-ADR-046 phase 1/2/2b-3). Synthetic DEV only. Target: a trusted endpoint id (cloud-run-api | cloud-run-core).
// Probes:
//   validate — public, read-only: campaigns.validate with a random unknown token (one Firestore read, answer CAMPAIGN_INVALID).
//   lookup   — authenticated officer path: vehicles.lookup of a real synthetic vehicle (session check + vehicle read + one
//              access-audit row per call, kept by the log policy). Signs in once with the synthetic account from the
//              gitignored .env, signs out at the end. Needs P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV as well.
//   login    — auth.login with the synthetic account (password hash + session + security event); every session the probe
//              creates is signed out after its level (not timed). Same gate as lookup.
// Gate: P6VC_ALLOW_LOAD_TEST=RUN_SYNTHETIC_LOAD.
//   P6VC_ALLOW_LOAD_TEST=RUN_SYNTHETIC_LOAD node scripts/load-test.mjs cloud-run-core 1,10,30,50 [validate|lookup|login] [waves]
// Each level sends <waves> (default 3, max 60; more = a sustained run that gives Cloud Run time to add instances) x concurrency
// requests in waves; the first level is preceded by one warm-up call (reported apart, so a
// cold start does not hide in the numbers). Prints timings and counts only — never data, tokens or credentials.
// Report: test-results/p6vc-load-<id>-<probe>.json (cwd).
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';

if (process.env.P6VC_ALLOW_LOAD_TEST !== 'RUN_SYNTHETIC_LOAD') { console.error('LOAD_TEST_GATE_CLOSED'); process.exit(2); }
const [id = 'cloud-run-core', levelsArg = '1,10,30,50', probe = 'validate', wavesArg = '3'] = process.argv.slice(2);
const WAVES = Math.min(60, Math.max(1, Math.floor(Number(wavesArg)) || 3));
const trusted = JSON.parse(fs.readFileSync(new URL('../../../contracts/trusted-endpoints.v1.json', import.meta.url), 'utf8'));
const endpoint = trusted.endpoints.find(e => e.id === id && e.kind === 'cloud-run');
if (!endpoint) { console.error('UNKNOWN_CLOUD_RUN_ENDPOINT'); process.exit(2); }
if (!['validate', 'lookup', 'login'].includes(probe)) { console.error('UNKNOWN_PROBE'); process.exit(2); }
const levels = levelsArg.split(',').map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 100);

async function post(group, action, payload, token) {
  const r = await fetch(endpoint.url + '/', {method: 'POST', headers: {'content-type': 'application/json'}, signal: AbortSignal.timeout(60000),
    body: JSON.stringify({apiVersion: 'v1', group, action, payload, ...(token ? {sessionToken: token} : {}), requestId: 'load_' + randomBytes(6).toString('hex')})});
  return {status: r.status, body: await r.json(), answeredBy: r.headers.get('x-p6vc-answered-by')};
}

let request, signOut = async () => {}, afterLevel = async () => {};
if (probe === 'validate') {
  request = async () => { const r = await post('campaigns', 'validate', {campaignToken: randomBytes(32).toString('hex')});
    return {ok: r.status === 200 && r.body?.error?.code === 'CAMPAIGN_INVALID', answeredBy: r.answeredBy}; };
} else if (probe === 'login') {
  await import('../../gas/scripts/load-env.mjs');
  if (process.env.P6VC_ALLOW_OWNER_DEV_WRITES !== 'RUN_SYNTHETIC_OWNER_DEV') { console.error('OWNER_DEV_GATE_CLOSED'); process.exit(2); }
  const user = process.env.P6VC_TEST_USERNAME, password = process.env.P6VC_TEST_PASSWORD;
  if (!user || !password) { console.error('TEST_CREDENTIALS_MISSING'); process.exit(2); }
  const opened = [];
  request = async () => { const r = await post('auth', 'login', {username: user, password});
    if (r.body?.data?.sessionToken) opened.push(r.body.data.sessionToken);
    return {ok: r.status === 200 && r.body?.ok === true, answeredBy: r.answeredBy}; };
  afterLevel = async () => { const all = opened.splice(0); for (let i = 0; i < all.length; i += 10) await Promise.all(all.slice(i, i + 10).map(t => post('auth', 'logout', {}, t).catch(() => {}))); };
  signOut = afterLevel;
} else {
  await import('../../gas/scripts/load-env.mjs');
  if (process.env.P6VC_ALLOW_OWNER_DEV_WRITES !== 'RUN_SYNTHETIC_OWNER_DEV') { console.error('OWNER_DEV_GATE_CLOSED'); process.exit(2); }
  const user = process.env.P6VC_TEST_USERNAME, password = process.env.P6VC_TEST_PASSWORD;
  if (!user || !password) { console.error('TEST_CREDENTIALS_MISSING'); process.exit(2); }
  const login = await post('auth', 'login', {username: user, password});
  if (!login.body.ok) { console.error('LOGIN_FAILED ' + login.body.error?.code); process.exit(1); }
  const token = login.body.data.sessionToken;
  signOut = async () => { await post('auth', 'logout', {}, token).catch(() => {}); };
  const v = (await post('vehicles', 'list', {page: 1, pageSize: 1}, token)).body.data?.items?.[0];
  if (!v) { await signOut(); console.error('NO_SYNTHETIC_VEHICLE'); process.exit(1); }
  request = async () => { const r = await post('vehicles', 'lookup', {plate: v.plate, province: v.province}, token);
    return {ok: r.status === 200 && r.body?.ok === true && !!r.body.data, answeredBy: r.answeredBy}; };
}

async function one() {
  const t = performance.now();
  try { const r = await request(); return {ms: performance.now() - t, ...r}; } catch { return {ms: performance.now() - t, ok: false}; }
}
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]); };

const report = {target: endpoint.url, id, probe, startedAt: new Date().toISOString(), levels: []};
try {
  const warm = await one();
  report.warmUp = {ms: Math.round(warm.ms), ok: warm.ok, answeredBy: warm.answeredBy || null};
  console.log(`WARMUP ${Math.round(warm.ms)}ms ok=${warm.ok} answered-by=${warm.answeredBy}`);
  for (const c of levels) {
    const results = [];
    const t0 = performance.now();
    const perWave = [];
    for (let wave = 0; wave < WAVES; wave++) { const w = await Promise.all(Array.from({length: c}, one)); results.push(...w); perWave.push(w.map(r => r.ms)); }
    const ms = results.map(r => r.ms);
    const by = [...new Set(results.map(r => r.answeredBy || 'none'))].join('+');
    // sustained runs: the last third of the waves shows the steady state (after any scale-out)
    const tail = perWave.slice(Math.floor(perWave.length * 2 / 3)).flat();
    const row = {concurrency: c, waves: WAVES, requests: results.length, errors: results.filter(r => !r.ok).length, answeredBy: by,
      tailP50: pct(tail, 50),
      p50: pct(ms, 50), p95: pct(ms, 95), max: Math.round(Math.max(...ms)), seconds: Math.round((performance.now() - t0) / 100) / 10};
    report.levels.push(row);
    await afterLevel();
    console.log(`LOAD ${probe} c=${c} n=${row.requests} errors=${row.errors} p50=${row.p50}ms p95=${row.p95}ms max=${row.max}ms total=${row.seconds}s answered-by=${by}${WAVES > 3 ? ' last-third-p50=' + row.tailP50 + 'ms' : ''}`);
  }
} finally { await signOut(); }
report.finishedAt = new Date().toISOString();
fs.mkdirSync('test-results', {recursive: true});
fs.writeFileSync(`test-results/p6vc-load-${id}-${probe}.json`, JSON.stringify(report, null, 2) + '\n');
