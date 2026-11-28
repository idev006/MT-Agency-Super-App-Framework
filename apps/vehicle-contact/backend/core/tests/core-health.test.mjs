// N4 PR 1: the core answers every operation itself — health included — so it no longer needs the legacy engine to answer.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {createCoreHandler} from '../src/server.mjs';
import {createIntegrationManager} from '../src/adapters/outbound/manager.mjs';
import {createCoreFacade} from '../src/facade/operations.mjs';
import {createAcceptanceHarness} from './support/core-harness.mjs';

const listen = handler => new Promise(r => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => r(s)); });
const base = s => `http://127.0.0.1:${s.address().port}`;
const version = JSON.parse(readFileSync(new URL('../../gas/package.json', import.meta.url), 'utf8')).version;
const inventory = JSON.parse(readFileSync(new URL('../../../contracts/api-inventory.v1.json', import.meta.url), 'utf8'));

test('N4-01 GET / and POST system.health are answered by the core with the backend version — no legacy, no store read', async () => {
  assert.deepEqual(createIntegrationManager({log: () => {}}).names(), ['media-bridge'], 'no legacy engine in the registry');
  const core = createCoreFacade({store: () => { throw new Error('health must not read the store'); }});
  const server = await listen(createCoreHandler({core}));
  try {
    const get = await fetch(base(server) + '/');
    assert.equal(get.headers.get('x-p6vc-answered-by'), 'core');
    const g = await get.json();
    assert.deepEqual([g.ok, g.data.status, g.data.backendVersion, g.data.persistence.engine], [true, 'ready', version, 'firestore']);
    const post = await (await fetch(base(server) + '/', {method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({apiVersion: 'v1', group: 'system', action: 'health', payload: {}, requestId: 'req_12345678'})})).json();
    assert.deepEqual([post.ok, post.data.backendVersion, post.requestId], [true, version, 'req_12345678']);
  } finally { server.close(); }
});

test('N4-02 every operation in the API inventory is answered by the core (nothing forwarded)', () => {
  const h = createAcceptanceHarness();
  const ops = (inventory.operations || inventory).map(o => o.operation || o.group + '.' + o.action);
  assert.ok(ops.length > 0);
  assert.deepEqual(ops.filter(op => h.engineFor(op) !== 'core'), []);
});
