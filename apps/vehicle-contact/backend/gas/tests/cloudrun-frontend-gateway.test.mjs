// VC-ADR-044 PR 2: Cloud Run /api/frontend keeps the Worker's browser-gateway contract.
// GW-01 runs the SAME contract script the live suite runs (WF-01..14) against a local Cloud Run handler.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createApiHandler} from '../../cloudrun/http-handler.mjs';
import {allowedOrigin, invalidEnvelope} from '../../cloudrun/frontend-gateway.mjs';

const fakeApp = {calls: [], dispatch(req) { this.calls.push(req.group + '.' + req.action); return {ok: true, data: {status: 'ready'}, error: null}; }};
const env = (op, payload, extra = {}) => ({apiVersion: 'v1', group: op.split('.')[0], action: op.split('.').slice(1).join('.'), payload, requestId: 'req_12345678', ...extra});
const TOKEN = 'a'.repeat(64);

test('GW-01 the Worker contract script (WF-01..14) passes against Cloud Run /api/frontend', async () => {
  const server = http.createServer(createApiHandler(fakeApp));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/api/frontend`;
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'p6vc-gw-'));
  const script = new URL('../../../../../tools/p6vc-api-test-console/verify-live-worker-failclosed.mjs', import.meta.url);
  const code = await new Promise(resolve => {
    const child = spawn(process.execPath, [script.pathname.replace(/^\/([A-Za-z]:)/, '$1')], {cwd, stdio: 'ignore',
      env: {...process.env, P6VC_WORKER_FRONTEND_URL: url, P6VC_GATEWAY_LOCAL_TEST: 'ALLOW', P6VC_GATEWAY_REPORT: 'gw.json'}});
    child.once('exit', resolve);
  });
  server.close();
  const report = JSON.parse(fs.readFileSync(path.join(cwd, 'test-results', 'gw.json'), 'utf8'));
  const failed = report.tests.filter(t => t.status !== 'PASS').map(t => t.id + ': ' + t.reason);
  assert.deepEqual(failed, []);
  assert.equal(report.tests.length, 14);
  assert.equal(code, 0);
  assert.deepEqual([...new Set(fakeApp.calls)], ['system.health'], 'only the liveness call reaches the application');
});

test('GW-02 real web-app payloads are allowed (lists, nested settings, photo upload)', () => {
  assert.equal(invalidEnvelope(env('qr.export', {vehicleIds: Array.from({length: 100}, (_, i) => 'v' + i)}, {sessionToken: TOKEN})), null);
  assert.equal(invalidEnvelope(env('qr.export', {vehicleIds: Array.from({length: 101}, (_, i) => 'v' + i)}, {sessionToken: TOKEN})), 'INVALID_OPERATION_PAYLOAD');
  const stickers = Array.from({length: 7}, (_, i) => ({code: 'C' + i, label: 'ประเภท ' + i, colour: 'แดง', hex: '#aa0000', size: 5, active: true}));
  const logs = ['LOOKUP', 'CONTACT', 'PHOTO', 'CHANGE', 'LOGIN'].map(code => ({code, enabled: true, days: 365}));
  assert.equal(invalidEnvelope(env('system.config.update', {values: {sticker_categories: stickers, log_policy: logs, idle_timeout_minutes: 30}}, {sessionToken: TOKEN})), null);
  assert.equal(invalidEnvelope(env('photos.upload', {campaignToken: 'b'.repeat(64), slot: 'FRONT', base64Image: 'A'.repeat(2_000_000), mimeType: 'image/jpeg'})), null);
  assert.equal(invalidEnvelope(env('auth.login', {username: 'u', password: 'p'})), null);
});

test('GW-03 refusals: public op with a session, protected op without, prototype keys, unknown op', () => {
  assert.equal(invalidEnvelope(env('auth.login', {username: 'u', password: 'p'}, {sessionToken: TOKEN})), 'INVALID_PUBLIC_PAYLOAD');
  assert.equal(invalidEnvelope(env('vehicles.listMine', {page: 1, pageSize: 10})), 'INVALID_SESSION_PAYLOAD');
  assert.equal(invalidEnvelope(env('system.config.update', {values: JSON.parse('{"__proto__":{"x":1}}')}, {sessionToken: TOKEN})), 'INVALID_OPERATION_PAYLOAD');
  assert.equal(invalidEnvelope(env('vehicles.delete', {}, {sessionToken: TOKEN})), 'OPERATION_NOT_ALLOWED');
});

test('GW-04 allowed origins: GitHub Pages and the local dev server; configurable list; nothing else', () => {
  assert.equal(allowedOrigin('https://idev006.github.io', undefined), 'https://idev006.github.io');
  assert.equal(allowedOrigin('http://localhost:5173', undefined), 'http://localhost:5173');
  assert.equal(allowedOrigin('https://evil.invalid', undefined), null);
  assert.equal(allowedOrigin('https://a.example', 'https://a.example, https://b.example'), 'https://a.example');
  assert.equal(allowedOrigin('', undefined), null);
});
