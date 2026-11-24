// Cloud Run spike HTTP wrapper: same v1 envelope as GAS; never leaks internal error text.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createSpikeHandler} from '../scripts/spike-node-api-server.mjs';

async function withServer(application, fn) {
  const server = http.createServer(createSpikeHandler(application));
  await new Promise(r => server.listen(0, r));
  try { return await fn(`http://127.0.0.1:${server.address().port}/`); } finally { server.close(); }
}

test('SPIKE-01 GET = health, POST = the same dispatch GAS uses, bad JSON = 400, other verbs = 405', async () => {
  const seen = [];
  const application = {dispatch: (body, method) => { seen.push([body.group, body.action, method]); return {ok: true, data: {echo: body.action}}; }};
  await withServer(application, async url => {
    assert.deepEqual(await (await fetch(url)).json(), {ok: true, data: {echo: 'health'}});
    const r = await fetch(url, {method: 'POST', body: JSON.stringify({apiVersion: 'v1', group: 'vehicles', action: 'lookup', payload: {}})});
    assert.equal((await r.json()).data.echo, 'lookup');
    assert.deepEqual(seen.at(-1), ['vehicles', 'lookup', 'POST']);
    assert.equal((await fetch(url, {method: 'POST', body: '{nope'})).status, 400);
    assert.equal((await fetch(url, {method: 'PUT', body: '{}'})).status, 405);
  });
});

test('SPIKE-02 an unexpected exception returns OPERATION_FAILED without the internal message', async () => {
  const application = {dispatch: () => { throw new Error('secret internal detail'); }};
  await withServer(application, async url => {
    const r = await fetch(url, {method: 'POST', body: JSON.stringify({group: 'x', action: 'y'})});
    const text = await r.text();
    assert.equal(r.status, 500);
    assert.match(text, /OPERATION_FAILED/);
    assert.doesNotMatch(text, /secret internal detail/);
  });
});
