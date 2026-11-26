// Load baseline (VC-ADR-046 phase 1/2). Public, read-only, synthetic: campaigns.validate with a random unknown token
// (one Firestore read, no write, answer CAMPAIGN_INVALID) — the same probe the deploy smoke uses.
// Gate: P6VC_ALLOW_LOAD_TEST=RUN_SYNTHETIC_LOAD. Target: a trusted endpoint id (cloud-run-api | cloud-run-core).
//   P6VC_ALLOW_LOAD_TEST=RUN_SYNTHETIC_LOAD node scripts/load-test.mjs cloud-run-core 1,10,30,50
// Each level sends 3 x concurrency requests in waves. Report: test-results/p6vc-load-<id>.json (cwd).
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';

if (process.env.P6VC_ALLOW_LOAD_TEST !== 'RUN_SYNTHETIC_LOAD') { console.error('LOAD_TEST_GATE_CLOSED'); process.exit(2); }
const [id = 'cloud-run-core', levelsArg = '1,10,30,50'] = process.argv.slice(2);
const trusted = JSON.parse(fs.readFileSync(new URL('../../../contracts/trusted-endpoints.v1.json', import.meta.url), 'utf8'));
const endpoint = trusted.endpoints.find(e => e.id === id && e.kind === 'cloud-run');
if (!endpoint) { console.error('UNKNOWN_CLOUD_RUN_ENDPOINT'); process.exit(2); }
const levels = levelsArg.split(',').map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 100);

async function one() {
  const t = performance.now();
  try {
    const r = await fetch(endpoint.url + '/', {method: 'POST', headers: {'content-type': 'application/json'}, signal: AbortSignal.timeout(60000),
      body: JSON.stringify({apiVersion: 'v1', group: 'campaigns', action: 'validate', payload: {campaignToken: randomBytes(32).toString('hex')}, requestId: 'load_' + randomBytes(6).toString('hex')})});
    const j = await r.json();
    return {ms: performance.now() - t, ok: r.status === 200 && j?.error?.code === 'CAMPAIGN_INVALID'};
  } catch { return {ms: performance.now() - t, ok: false}; }
}
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]); };

const report = {target: endpoint.url, id, probe: 'campaigns.validate unknown token (read-only)', startedAt: new Date().toISOString(), levels: []};
for (const c of levels) {
  const results = [];
  const t0 = performance.now();
  for (let wave = 0; wave < 3; wave++) results.push(...await Promise.all(Array.from({length: c}, one)));
  const ms = results.map(r => r.ms);
  const row = {concurrency: c, requests: results.length, errors: results.filter(r => !r.ok).length,
    p50: pct(ms, 50), p95: pct(ms, 95), max: Math.round(Math.max(...ms)), seconds: Math.round((performance.now() - t0) / 100) / 10};
  report.levels.push(row);
  console.log(`LOAD c=${c} n=${row.requests} errors=${row.errors} p50=${row.p50}ms p95=${row.p95}ms max=${row.max}ms total=${row.seconds}s`);
}
report.finishedAt = new Date().toISOString();
fs.mkdirSync('test-results', {recursive: true});
fs.writeFileSync(`test-results/p6vc-load-${id}.json`, JSON.stringify(report, null, 2) + '\n');
