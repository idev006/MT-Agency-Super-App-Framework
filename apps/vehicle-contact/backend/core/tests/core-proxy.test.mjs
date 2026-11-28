// p6vc-core is the only backend since backend 0.9.73 (p6vc-api retired, owner 2026-11-28): every operation is answered by
// the core; an operation it does not have gets a clean NOT_FOUND envelope (nothing is forwarded); the browser gateway
// contract holds at the core; a legacy engine is only used when one is passed in (the L1 dev server, in-process).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createCoreHandler} from '../src/server.mjs';
import {createIntegrationManager} from '../src/adapters/outbound/manager.mjs';
import {createRouter} from '../src/http/routing.mjs';
import {createCoreFacade} from '../src/facade/operations.mjs';

const listen = handler => new Promise(r => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => r(s)); });
const base = s => `http://127.0.0.1:${s.address().port}`;
const noStore = () => { throw new Error('NO_STORE_IN_PROXY_TEST'); };

test('CORE-01 with no legacy engine an operation the core does not have → NOT_FOUND envelope with the requestId', async () => {
  const {'users.list': _gone, ...rest} = (await import('../src/facade/operations.mjs')).USE_CASES;
  const server = await listen(createCoreHandler({core: createCoreFacade({store: noStore, useCases: rest})}));
  try {
    const r = await fetch(base(server) + '/', {method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({apiVersion: 'v1', group: 'users', action: 'list', payload: {}, requestId: 'req_12345678'})});
    assert.equal(r.headers.get('x-p6vc-engine'), 'core');
    const body = await r.json();
    assert.deepEqual([body.ok, body.error.code, body.requestId], [false, 'NOT_FOUND', 'req_12345678']);
    const h = await (await fetch(base(server) + '/')).json();
    assert.equal(h.ok, true, 'health is the core\'s own');
  } finally { server.close(); }
});

test('CORE-02 the browser gateway contract (WF-01..14) holds at the core', async () => {
  const server = await listen(createCoreHandler({core: createCoreFacade({store: noStore})}));
  try {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'p6vc-core-gw-'));
    const script = new URL('../../cloudrun/verify-gateway-failclosed.mjs', import.meta.url);
    const code = await new Promise(resolve => spawn(process.execPath, [script.pathname.replace(/^\/([A-Za-z]:)/, '$1')], {cwd, stdio: 'ignore',
      env: {...process.env, P6VC_GATEWAY_URL: base(server) + '/api/frontend', P6VC_GATEWAY_LOCAL_TEST: 'ALLOW', P6VC_GATEWAY_REPORT: 'core-gw.json'}}).once('exit', resolve));
    const report = JSON.parse(fs.readFileSync(path.join(cwd, 'test-results', 'core-gw.json'), 'utf8'));
    assert.deepEqual(report.tests.filter(t => t.status !== 'PASS').map(t => t.id + ': ' + t.reason), []);
    assert.equal(report.tests.length, 14);
    assert.equal(code, 0);
  } finally { server.close(); }
});

test('CORE-03 the integration registry has no legacy engine any more; overrides stay local-only', () => {
  const m = createIntegrationManager({log: () => {}});
  assert.deepEqual(m.names(), ['media-bridge']);
  assert.throws(() => m.gateway('legacy-engine'), /INTEGRATION_UNKNOWN/);
  assert.throws(() => createIntegrationManager({overrides: {urls: {'media-bridge': 'https://evil.example'}}, log: () => {}}).gateway('media-bridge'),
    /INTEGRATION_OVERRIDE_NOT_LOCAL/);
});

test('CORE-04 routing: the core answers its operations; others go to a legacy engine only when one is given, else NOT_FOUND', async () => {
  const calls = [];
  const core = {operations: ['qr.resolve', 'system.health'], dispatch: async e => (calls.push('core:' + e.group + '.' + e.action), {ok: true})};
  const withLegacy = createRouter({legacy: {dispatch: async e => (calls.push('legacy:' + e.group + '.' + e.action), {ok: true})}, core});
  assert.equal(withLegacy.engineFor('qr.resolve'), 'core');
  assert.equal(withLegacy.engineFor('vehicles.lookup'), 'legacy');
  await withLegacy.dispatch({group: 'qr', action: 'resolve'});
  await withLegacy.dispatch({group: 'vehicles', action: 'lookup'});
  await withLegacy.dispatch({group: 'system', action: 'health'}, 'GET');
  assert.deepEqual(calls, ['core:qr.resolve', 'legacy:vehicles.lookup', 'core:system.health']);
  const alone = createRouter({core});
  assert.equal(alone.engineFor('vehicles.lookup'), 'none');
  const r = await alone.dispatch({group: 'vehicles', action: 'lookup', requestId: 'req_x'});
  assert.deepEqual([r.ok, r.error.code, r.requestId], [false, 'NOT_FOUND', 'req_x']);
});

test('CORE-05 x-p6vc-answered-by: core for every operation and for GET health', async () => {
  const server = await listen(createCoreHandler({core: createCoreFacade({store: noStore})}));
  try {
    assert.equal((await fetch(base(server) + '/')).headers.get('x-p6vc-answered-by'), 'core');
    const r = await fetch(base(server) + '/', {method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({apiVersion: 'v1', group: 'system', action: 'health', payload: {}, requestId: 'req_12345678'})});
    assert.equal(r.headers.get('x-p6vc-answered-by'), 'core');
  } finally { server.close(); }
});
