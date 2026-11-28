// P6VC LIVE browser-gateway fail-closed acceptance (E2). Credential-free.
// The browser gateway is the core's Cloud Run /api/frontend (backend/cloudrun/frontend-gateway.mjs); the Cloudflare Worker
// that used to carry the same contract is retired (VC-ADR-056 W1; this file moved here from tools/p6vc-api-test-console).
// Target = P6VC_GATEWAY_URL (default: the core's /api/frontend from contracts/trusted-endpoints.v1.json); report name =
// P6VC_GATEWAY_REPORT. A local http://127.0.0.1 target is accepted only with P6VC_GATEWAY_LOCAL_TEST=ALLOW (unit test).
// Asserts that every malformed / unauthorized / non-allowlisted request is denied at the gateway before any operation
// runs. The only request that passes is public read-only system.health (liveness). No username, password, real session
// token, photo or personal data is ever sent or printed. A synthetic all-'a' 64-hex token is used solely to pass the
// session-SHAPE gate so DTO-field denials can be proven.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const trusted = JSON.parse(fs.readFileSync(new URL('../../contracts/trusted-endpoints.v1.json', import.meta.url), 'utf8'));
const cloudRunGateways = trusted.endpoints.filter(e => e.kind === 'cloud-run').map(e => e.url + '/api/frontend'); // legacy + core
const coreGateway = (trusted.endpoints.find(e => e.id === 'cloud-run-core')?.url || '') + '/api/frontend';
const url = process.env.P6VC_GATEWAY_URL || coreGateway;
const origin = process.env.P6VC_FRONTEND_ORIGIN || 'https://idev006.github.io';
const isLocal = process.env.P6VC_GATEWAY_LOCAL_TEST === 'ALLOW' && /^http:\/\/127\.0\.0\.1:\d{2,5}\/api\/frontend$/.test(url);
assert.ok(cloudRunGateways.includes(url) || isLocal, 'gateway URL must be a trusted Cloud Run /api/frontend');
const reportName = /^[a-z0-9-]+\.json$/.test(process.env.P6VC_GATEWAY_REPORT || '') ? process.env.P6VC_GATEWAY_REPORT : 'p6vc-live-gateway-failclosed.json';
assert.ok(/^https:\/\//.test(origin), 'allowed origin must be https');

const SYNTHETIC_TOKEN = 'a'.repeat(64); // not a credential; shape-only probe value
const runner = {
  status: 'RUNNING', environment: isLocal ? 'LOCAL_TEST' : 'REMOTE_CLOUD_RUN_GATEWAY', target: url, allowedOrigin: origin,
  sourceCommit: process.env.GITHUB_SHA || null, startedAt: new Date().toISOString(),
  tests: [], scope: 'Edge fail-closed denial probes + public health liveness; no credentials, no mutations',
};
const save = () => {
  runner.finishedAt = new Date().toISOString();
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/' + reportName, JSON.stringify(runner, null, 2) + '\n');
  console.log('FINAL ' + JSON.stringify({
    status: runner.status,
    pass: runner.tests.filter(x => x.status === 'PASS').length,
    failed: runner.tests.filter(x => x.status === 'FAIL').length,
    target: runner.target,
    seconds: Math.round((Date.parse(runner.finishedAt) - Date.parse(runner.startedAt)) / 1000),
  }));
};
// send builds a request; opts.raw overrides the serialized body (for malformed/oversize cases).
const send = async (body, opts = {}) => {
  const method = opts.method || 'POST';
  const headers = { origin: opts.origin === undefined ? origin : opts.origin };
  const hasBody = method !== 'GET' && method !== 'OPTIONS';
  if (hasBody) headers['content-type'] = opts.contentType === undefined ? 'application/json' : opts.contentType;
  const init = { method, headers, redirect: 'follow', signal: AbortSignal.timeout(40000) };
  if (hasBody) init.body = opts.raw !== undefined ? opts.raw : JSON.stringify(body);
  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON edge reply */ }
  return { http: response.status, json, headers: response.headers };
};
const test = async (id, callback) => {
  const start = Date.now();
  try {
    const note = await callback();
    runner.tests.push({ id, status: 'PASS', durationMs: Date.now() - start, ...(note ? { note } : {}) });
    console.log('PASS ' + id + ' ' + (Date.now() - start) + 'ms');
  } catch (e) {
    runner.tests.push({ id, status: 'FAIL', durationMs: Date.now() - start, reason: String(e?.message || e).slice(0, 160) });
    console.log('FAIL ' + id + ' ' + String(e?.message || e).slice(0, 140));
  }
};
const envelope = (group, action, payload, extra = {}) => ({
  apiVersion: 'v1', group, action, payload, requestId: 'edgeprobe01', ...extra,
});
const expectDenied = (r, http, error) => {
  assert.equal(r.http, http, 'HTTP status');
  assert.equal(r.json?.error, error, 'edge error code');
};

const check = async () => {
  // --- Edge denials: none of these reach GAS ---
  await test('WF-01.UNKNOWN_ORIGIN', async () => {
    expectDenied(await send(envelope('system', 'health', {}), { origin: 'https://evil.invalid' }), 403, 'ORIGIN_NOT_ALLOWED');
  });
  await test('WF-02.NON_ALLOWLISTED_OPERATION', async () => {
    expectDenied(await send(envelope('vehicles', 'delete', {})), 403, 'OPERATION_NOT_ALLOWED');
  });
  await test('WF-03.PROTECTED_MISSING_SESSION', async () => {
    expectDenied(await send(envelope('vehicles', 'listMine', { page: 1, pageSize: 10 })), 403, 'INVALID_SESSION_PAYLOAD');
  });
  await test('WF-04.INJECTED_ROLE_FIELD', async () => {
    expectDenied(await send(envelope('changes', 'listMine', { page: 1, pageSize: 10, role: 'OWNER' }, { sessionToken: SYNTHETIC_TOKEN })), 403, 'INVALID_OPERATION_PAYLOAD');
  });
  await test('WF-05.UNKNOWN_PAYLOAD_FIELD', async () => {
    expectDenied(await send(envelope('retention', 'listExecutable', { page: 1, pageSize: 10, vehicleId: 'vehicle-1' }, { sessionToken: SYNTHETIC_TOKEN })), 403, 'INVALID_OPERATION_PAYLOAD');
  });
  await test('WF-06.INVALID_REQUEST_ID', async () => {
    expectDenied(await send(envelope('system', 'health', {}, { requestId: 'unsafe space' })), 403, 'INVALID_REQUEST_ID');
  });
  await test('WF-07.OVERSIZE_NON_MEDIA', async () => {
    expectDenied(await send(envelope('system', 'health', { filler: 'x'.repeat(40000) })), 413, 'REQUEST_TOO_LARGE');
  });
  await test('WF-08.WRONG_CONTENT_TYPE', async () => {
    expectDenied(await send(envelope('system', 'health', {}), { contentType: 'text/plain' }), 415, 'JSON_REQUIRED');
  });
  await test('WF-09.MALFORMED_JSON', async () => {
    expectDenied(await send(undefined, { raw: '{not-valid-json' }), 400, 'INVALID_JSON');
  });
  await test('WF-10.GET_METHOD_NOT_ALLOWED', async () => {
    expectDenied(await send(undefined, { method: 'GET' }), 405, 'METHOD_NOT_ALLOWED');
  });
  await test('WF-13.EXTRA_ENVELOPE_FIELD', async () => {
    expectDenied(await send(envelope('system', 'health', {}, { unexpected: 'x' })), 403, 'FIELDS_NOT_ALLOWED');
  });
  await test('WF-14.BAD_API_VERSION', async () => {
    expectDenied(await send(envelope('system', 'health', {}, { apiVersion: 'v9' })), 403, 'INVALID_ENVELOPE');
  });
  // --- Preflight + liveness: the only GAS-reaching call is public read-only health ---
  await test('WF-12.OPTIONS_PREFLIGHT', async () => {
    const r = await send(undefined, { method: 'OPTIONS' });
    assert.equal(r.http, 204, 'preflight status');
    assert.equal(r.headers.get('access-control-allow-origin'), origin, 'CORS origin echo');
    assert.match(r.headers.get('access-control-allow-methods') || '', /POST/, 'CORS methods');
  });
  await test('WF-11.PUBLIC_HEALTH_LIVENESS', async () => {
    const r = await send(envelope('system', 'health', {}));
    assert.equal(r.http, 200, 'health HTTP');
    assert.equal(r.json?.ok, true, 'health logical ok');
    const status = r.json?.data?.status;
    assert.ok(['ready', 'bootstrap'].includes(status), 'health status unexpected: ' + status);
    assert.equal(r.headers.get('access-control-allow-origin'), origin, 'CORS origin echo');
    return 'health=' + status;
  });
  runner.status = runner.tests.some(x => x.status === 'FAIL') ? 'FAIL' : 'PASS';
};
try { await check(); }
catch (e) { runner.status = 'FAIL'; runner.reason = String(e?.message || e).slice(0, 180); }
finally { save(); if (runner.status === 'FAIL') process.exitCode = 1; }