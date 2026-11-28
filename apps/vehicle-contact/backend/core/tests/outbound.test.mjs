// VC-ADR-047 Integration Manager: one http-client (timeout, idempotent-only retry, circuit breaker, no bodies in logs),
// gateways built from the registry, and the media-bridge signature accepted by the REAL GAS-side verifier.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash, createHmac} from 'node:crypto';
import {createHttpClient, createCircuitBreaker} from '../src/adapters/outbound/http-client.mjs';
import {createIntegrationManager} from '../src/adapters/outbound/manager.mjs';
import {createMediaBridgeServer} from '../../gas/src/infrastructure/media/MediaBridgeServer.js';

const listen = handler => new Promise(r => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => r(s)); });
const base = s => `http://127.0.0.1:${s.address().port}`;
const readBody = req => new Promise(r => { const c = []; req.on('data', x => c.push(x)); req.on('end', () => r(Buffer.concat(c).toString('utf8'))); });

test('OUT-01 retry only idempotent calls; a write is sent once; 4xx is never retried', async () => {
  let hits = 0;
  const s = await listen((_req, res) => { hits++; res.writeHead(hits % 3 ? 503 : 200, {'content-type': 'application/json'}); res.end('{"ok":true}'); });
  const c = createHttpClient({name: 't', url: base(s), retry: {max: 2, backoffMs: 1}, log: () => {}});
  try {
    hits = 0; assert.deepEqual((await c.request({method: 'GET', idempotent: true})).json, {ok: true}); assert.equal(hits, 3, '503, 503, 200');
    hits = 0; await assert.rejects(c.request({method: 'POST', body: '{}'}), e => e.code === 'UPSTREAM_UNAVAILABLE'); assert.equal(hits, 1, 'write not retried');
  } finally { s.close(); }
  let rejects = 0;
  const s4 = await listen((_req, res) => { rejects++; res.writeHead(400); res.end('{}'); });
  const c4 = createHttpClient({name: 't4', url: base(s4), retry: {max: 3, backoffMs: 1}, log: () => {}});
  try { await assert.rejects(c4.request({method: 'GET', idempotent: true}), e => e.code === 'UPSTREAM_REJECTED' && e.status === 400); assert.equal(rejects, 1); }
  finally { s4.close(); }
});

test('OUT-02 timeout → UPSTREAM_TIMEOUT; circuit opens after N failures and fails fast; half-open after openMs', async () => {
  const slow = await listen(() => {}); // never answers
  const c = createHttpClient({name: 'slow', url: base(slow), timeoutMs: 100, breaker: {failures: 2, openMs: 60000}, log: () => {}});
  try {
    await assert.rejects(c.request({}), e => e.code === 'UPSTREAM_TIMEOUT');
    await assert.rejects(c.request({}), e => e.code === 'UPSTREAM_TIMEOUT');
    assert.equal(c.state(), 'open');
    const t0 = Date.now();
    await assert.rejects(c.request({}), e => e.code === 'UPSTREAM_UNAVAILABLE');
    assert.ok(Date.now() - t0 < 50, 'open circuit does not wait for the upstream');
  } finally { slow.closeAllConnections?.(); slow.close(); }
  let t = 0; const b = createCircuitBreaker({failures: 1, openMs: 1000, now: () => t});
  b.failure(); assert.equal(b.allow(), false); t = 1001; assert.equal(b.allow(), true, 'half-open'); b.success(); assert.equal(b.state(), 'closed');
});

test('OUT-03 logs carry name/status/ms only — never bodies, headers or secrets', async () => {
  const s = await listen(async (req, res) => { await readBody(req); res.writeHead(200); res.end('{"ok":true,"data":"SECRET-ANSWER"}'); });
  const logs = [];
  const c = createHttpClient({name: 'logcheck', url: base(s), log: e => logs.push(JSON.stringify(e))});
  try { await c.request({method: 'POST', headers: {authorization: 'Bearer SECRET-TOKEN'}, body: '{"password":"SECRET-PASS"}', requestId: 'req_1'}); }
  finally { s.close(); }
  assert.equal(logs.length, 1);
  assert.doesNotMatch(logs.join(''), /SECRET/);
  assert.match(logs[0], /"name":"logcheck".*"status":200/);
});

test('OUT-04 registry: unknown or untrusted integrations are refused at start; ports are enforced', () => {
  const trusted = {endpoints: [{id: 'x', url: 'https://x.example'}]};
  const entry = {name: 'media-bridge', port: 'MediaStore', endpoint: 'x', timeoutMs: 1000, retry: {max: 0}, breaker: {}, idempotent: [], secrets: []};
  assert.throws(() => createIntegrationManager({registry: {integrations: [{...entry, endpoint: 'nope'}]}, trusted}), /INTEGRATION_ENDPOINT_NOT_TRUSTED/);
  assert.throws(() => createIntegrationManager({registry: {integrations: [{...entry, name: 'sms'}]}, trusted}), /INTEGRATION_UNKNOWN/);
  const m = createIntegrationManager({log: () => {}});
  assert.deepEqual(m.names().sort(), ['media-bridge']); // p6vc-api (legacy engine) retired 2026-11-28
  assert.throws(() => m.gateway('media-bridge'), /MEDIA_BRIDGE_NOT_CONFIGURED/, 'secret missing → refused, never sent unsigned');
});

test('OUT-05 media bridge: the REAL GAS verifier accepts the core signature and refuses a wrong secret', async () => {
  const secret = 'b'.repeat(40);
  // GAS-style services for MediaBridgeServer (signed bytes like Apps Script), a Drive that fails on purpose
  const gasUtilities = {DigestAlgorithm: {SHA_256: 'SHA_256'}, Charset: {UTF_8: 'UTF_8'},
    computeDigest: (_a, text) => [...createHash('sha256').update(text, 'utf8').digest()].map(b => (b > 127 ? b - 256 : b)),
    computeHmacSha256Signature: (text, key) => [...createHmac('sha256', key).update(text, 'utf8').digest()].map(b => (b > 127 ? b - 256 : b)),
    base64Decode: x => Buffer.from(x, 'base64')};
  const bridge = (gasSecret) => createMediaBridgeServer({utilities: gasUtilities,
    propertiesService: {getScriptProperties: () => ({getProperty: k => ({VEHICLE_MEDIA_BRIDGE_SECRET: gasSecret, VEHICLE_PHOTOS_FOLDER_ID: 'folder'})[k]})},
    driveApp: {getFileById() { throw new Error('fake drive'); }, getFolderById() { throw new Error('fake drive'); }}});
  for (const [gasSecret, expected] of [[secret, 'BRIDGE_DRIVE_FAILED'], ['c'.repeat(40), 'BRIDGE_UNAUTHORIZED']]) {
    const server = bridge(gasSecret);
    const s = await listen(async (req, res) => { const out = server.handle(JSON.parse(await readBody(req))); res.writeHead(200, {'content-type': 'application/json'}); res.end(JSON.stringify(out)); });
    const g = createIntegrationManager({env: {P6VC_MEDIA_BRIDGE_SECRET: secret}, overrides: {urls: {'media-bridge': base(s)}}, log: () => {}}).gateway('media-bridge');
    try { await assert.rejects(g.trash('file-1'), e => e.message === expected, `GAS secret ${gasSecret === secret ? 'same' : 'different'}`); }
    finally { s.close(); }
  }
});
