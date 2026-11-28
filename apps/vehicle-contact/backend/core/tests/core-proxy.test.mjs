// VC-ADR-046 phase 1: p6vc-core is a front door that changes nothing — every operation reaches the legacy engine
// unchanged, the browser gateway contract holds at the core, and an unreachable legacy gives a clean envelope.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createApiHandler} from '../../cloudrun/http-handler.mjs';
import {createCoreHandler} from '../src/server.mjs';
import {createIntegrationManager} from '../src/adapters/outbound/manager.mjs';
import {createRouter} from '../src/http/routing.mjs';
import {createCoreFacade, USE_CASES} from '../src/facade/operations.mjs';

const listen = handler => new Promise(r => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => r(s)); });
const base = s => `http://127.0.0.1:${s.address().port}`;
const quiet = () => {};
// every operation is on the core since N3 (system.health excepted): these proxy tests keep users.list on the legacy side so a
// real forwarded operation (with a payload and a session) is exercised
const {'users.list': _forwarded, ...ported} = USE_CASES;
const coreWithout = () => createCoreFacade({store: () => { throw new Error('NO_STORE_IN_PROXY_TEST'); }, useCases: ported, health: false});
const legacyAt = url => createIntegrationManager({overrides: {urls: {'legacy-engine': url}}, log: quiet}).gateway('legacy-engine');

async function pair() {
  const seen = [];
  const legacyApp = {dispatch(req, method) {
    seen.push({method, req});
    if (req.group === 'system' && req.action === 'health') return {ok: true, data: {status: 'ready', backendVersion: '9.9.9'}, error: null};
    return {ok: true, data: {echo: req.group + '.' + req.action, payload: req.payload}, error: null, requestId: req.requestId || null};
  }};
  const legacy = await listen(createApiHandler(legacyApp));
  const core = await listen(createCoreHandler({legacy: legacyAt(base(legacy)), core: coreWithout()}));
  return {legacy, core, seen, close: () => { legacy.close(); core.close(); }};
}

test('CORE-01 every operation is forwarded unchanged; health too; responses carry x-p6vc-engine: core', async () => {
  const p = await pair();
  try {
    // an operation the core does not answer here (kept on the legacy side above)
    const env = {apiVersion: 'v1', group: 'users', action: 'list', payload: {page: 1, pageSize: 10}, sessionToken: 'a'.repeat(64), requestId: 'req_12345678'};
    const r = await fetch(base(p.core) + '/', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(env)});
    assert.equal(r.headers.get('x-p6vc-engine'), 'core');
    const body = await r.json();
    assert.deepEqual(body, {ok: true, data: {echo: 'users.list', payload: env.payload}, error: null, requestId: 'req_12345678'});
    assert.deepEqual(p.seen.at(-1), {method: 'POST', req: env}, 'legacy received the exact envelope');
    const h = await (await fetch(base(p.core) + '/')).json();
    assert.equal(h.data.backendVersion, '9.9.9', 'health comes from the legacy engine (deploy smoke checks the version end to end)');
  } finally { p.close(); }
});

test('CORE-02 the browser gateway contract (WF-01..14) holds at the core', async () => {
  const p = await pair();
  try {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'p6vc-core-gw-'));
    const script = new URL('../../cloudrun/verify-gateway-failclosed.mjs', import.meta.url);
    const code = await new Promise(resolve => spawn(process.execPath, [script.pathname.replace(/^\/([A-Za-z]:)/, '$1')], {cwd, stdio: 'ignore',
      env: {...process.env, P6VC_GATEWAY_URL: base(p.core) + '/api/frontend', P6VC_GATEWAY_LOCAL_TEST: 'ALLOW', P6VC_GATEWAY_REPORT: 'core-gw.json'}}).once('exit', resolve));
    const report = JSON.parse(fs.readFileSync(path.join(cwd, 'test-results', 'core-gw.json'), 'utf8'));
    assert.deepEqual(report.tests.filter(t => t.status !== 'PASS').map(t => t.id + ': ' + t.reason), []);
    assert.equal(report.tests.length, 14);
    assert.equal(code, 0);
    assert.deepEqual([...new Set(p.seen.map(x => x.req.group + '.' + x.req.action))], ['system.health'], 'refused requests never reach the legacy');
  } finally { p.close(); }
});

test('CORE-03 legacy unreachable → clean envelope with the requestId; only local overrides are accepted', async () => {
  const dead = await listen((_req, res) => { res.destroy(); });
  const core = await listen(createCoreHandler({legacy: legacyAt(base(dead)), core: coreWithout()}));
  try {
    const r = await fetch(base(core) + '/', {method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({apiVersion: 'v1', group: 'users', action: 'list', payload: {}, requestId: 'req_12345678'})}); // a forwarded op
    const body = await r.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'UPSTREAM_UNAVAILABLE');
    assert.equal(body.requestId, 'req_12345678');
  } finally { dead.close(); core.close(); }
  for (const url of ['https://evil.example', 'http://localhost:9999', 'https://p6vc-api-x.y.run.app'])
    assert.throws(() => legacyAt(url), /INTEGRATION_OVERRIDE_NOT_LOCAL/);
  assert.doesNotThrow(() => createIntegrationManager({log: quiet}).gateway('legacy-engine'), 'production URL from the contract');
});

test('CORE-04 routing: a ported operation is answered by the core, everything else by the legacy', async () => {
  const calls = [];
  const router = createRouter({legacy: {dispatch: async e => (calls.push('legacy:' + e.group + '.' + e.action), {ok: true})},
    core: {operations: ['qr.resolve'], dispatch: async () => (calls.push('core:qr.resolve'), {ok: true, data: 'core'})}});
  assert.equal(router.engineFor('qr.resolve'), 'core');
  assert.equal(router.engineFor('vehicles.lookup'), 'legacy');
  await router.dispatch({group: 'qr', action: 'resolve'});
  await router.dispatch({group: 'vehicles', action: 'lookup'});
  await router.dispatch({group: 'qr', action: 'resolve'}, 'GET'); // GET is health only → legacy
  assert.deepEqual(calls, ['core:qr.resolve', 'legacy:vehicles.lookup', 'legacy:qr.resolve']);
});

test('CORE-05 x-p6vc-answered-by tells which engine answered (core for a ported operation, legacy otherwise)', async () => {
  const p = await pair();
  const core = await listen(createCoreHandler({legacy: legacyAt(base(p.legacy)),
    core: {operations: ['vehicles.history'], dispatch: async () => ({ok: true, data: [], error: null, requestId: null})}}));
  try {
    const post = op => fetch(base(core) + '/', {method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({apiVersion: 'v1', group: op.split('.')[0], action: op.split('.')[1], payload: {}, requestId: 'req_12345678'})});
    assert.equal((await post('vehicles.history')).headers.get('x-p6vc-answered-by'), 'core');
    assert.equal((await post('vehicles.list')).headers.get('x-p6vc-answered-by'), 'legacy');
    assert.equal((await fetch(base(core) + '/')).headers.get('x-p6vc-answered-by'), 'legacy', 'health = legacy');
  } finally { core.close(); p.close(); }
});
