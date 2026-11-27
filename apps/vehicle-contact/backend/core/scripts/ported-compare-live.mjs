// Live dual call for ported operations (VC-ADR-046 phase 2b): the same requests to the legacy service (p6vc-api) and the
// core (p6vc-core) must return identical envelopes, and the core must say it answered them itself (x-p6vc-answered-by).
// Synthetic DEV only: signs in with the synthetic account from the gitignored .env (one session, signed out at the end).
// Prints operation, counts and EQUAL / NOT EQUAL only — never data, tokens or credentials.
//   P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV node scripts/ported-compare-live.mjs
import fs from 'node:fs';
import '../../gas/scripts/load-env.mjs';
import {FLOWS} from '../src/facade/operations.mjs';

if (process.env.P6VC_ALLOW_OWNER_DEV_WRITES !== 'RUN_SYNTHETIC_OWNER_DEV') { console.error('GATE_CLOSED'); process.exit(2); }
const user = process.env.P6VC_TEST_USERNAME, password = process.env.P6VC_TEST_PASSWORD;
if (!user || !password) { console.error('TEST_CREDENTIALS_MISSING'); process.exit(2); }
const trusted = JSON.parse(fs.readFileSync(new URL('../../../contracts/trusted-endpoints.v1.json', import.meta.url), 'utf8'));
const url = id => trusted.endpoints.find(e => e.id === id).url;
const LEGACY = url('cloud-run-api'), CORE = url('cloud-run-core');
let n = 0;
async function call(base, group, action, payload, token) {
  const r = await fetch(base + '/', {method: 'POST', headers: {'content-type': 'application/json'}, signal: AbortSignal.timeout(60000),
    body: JSON.stringify({apiVersion: 'v1', group, action, payload, ...(token ? {sessionToken: token} : {}), requestId: 'cmp_' + Date.now() + '_' + (n++)})});
  const body = await r.json();
  delete body.requestId; // differs per call by design
  return {body, answeredBy: r.headers.get('x-p6vc-answered-by')};
}

const rows = [];
const login = await call(LEGACY, 'auth', 'login', {username: user, password}, null);
if (!login.body.ok) { console.error('LOGIN_FAILED ' + login.body.error?.code); process.exit(1); }
const token = login.body.data.sessionToken;
try {
  const list = await call(LEGACY, 'vehicles', 'list', {page: 1, pageSize: 5}, token);
  const ids = (list.body.data?.items || []).map(v => v.vehicleId).slice(0, 3);
  const cases = [...ids.map(id => ['vehicles.history', {vehicleId: id}, token]), ['vehicles.history', {vehicleId: 'no-such-vehicle'}, token],
    ['vehicles.history', {vehicleId: ids[0] || 'x'}, null], ['vehicles.history', {}, token]];
  for (const [op, payload, t] of cases) {
    if (!FLOWS[op]) continue;
    const [g, a] = op.split('.');
    const legacy = await call(LEGACY, g, a, payload, t), core = await call(CORE, g, a, payload, t);
    const equal = JSON.stringify(legacy.body) === JSON.stringify(core.body);
    const size = b => (b.ok ? (Array.isArray(b.data) ? b.data.length : 1) : 'error ' + b.error?.code);
    rows.push({op, equal, answeredBy: core.answeredBy, legacy: size(legacy.body), core: size(core.body)});
  }
} finally {
  await call(LEGACY, 'auth', 'logout', {}, token);
}
for (const r of rows) console.log(`${r.equal ? 'EQUAL    ' : 'NOT EQUAL'} ${r.op} answered-by=${r.answeredBy} legacy=${r.legacy} core=${r.core}`);
const ok = rows.length > 0 && rows.every(r => r.equal && r.answeredBy === 'core');
console.log('PORTED_COMPARE ' + JSON.stringify({status: ok ? 'PASS' : 'FAIL', compared: rows.length, equal: rows.filter(r => r.equal).length,
  answeredByCore: rows.filter(r => r.answeredBy === 'core').length}));
process.exit(ok ? 0 : 1);
