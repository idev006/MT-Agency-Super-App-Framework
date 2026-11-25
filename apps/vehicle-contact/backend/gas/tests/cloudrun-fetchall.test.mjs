// FIX 2026-11-25 (owner: "Yes, fix it"): Cloud Run had no UrlFetchApp.fetchAll, so every "one
// parallel round" ran one request at a time and every profiled (prof_*) request crashed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createSyncFetch} from '../../cloudrun/sync-fetch.mjs';
import {withMetadataToken, TOKEN_ENDPOINT, METADATA_TOKEN_URL} from '../../cloudrun/runtime.mjs';
import {createRequestProfiler} from '../src/infrastructure/profiling/RequestProfiler.js';

// The sync fetch blocks this thread (Atomics.wait), so the test server runs in a child process.
const SERVER = `const http=require('http');const s=http.createServer((q,r)=>{setTimeout(()=>{r.writeHead(200);r.end(q.url)},300)});
s.listen(0,'127.0.0.1',()=>console.log('PORT '+s.address().port));`;
function startServer() {
  const child = spawn(process.execPath, ['-e', SERVER], {stdio: ['ignore', 'pipe', 'inherit']});
  return new Promise(resolve => child.stdout.on('data', d => { const m = /PORT (\d+)/.exec(String(d)); if (m) resolve({child, port: Number(m[1])}); }));
}

test('FA-01 fetchAll runs a round in parallel and keeps the order (3 × 300 ms ≈ one round)', async () => {
  const {child, port} = await startServer();
  const bridge = createSyncFetch();
  try {
    const base = `http://127.0.0.1:${port}`;
    bridge.fetch(base + '/warm');
    const t0 = Date.now();
    const out = bridge.fetchAll([{url: base + '/a'}, {url: base + '/b', method: 'post', payload: '{}'}, {url: base + '/c'}]);
    const ms = Date.now() - t0;
    assert.deepEqual(out.map(r => [r.getResponseCode(), r.getContentText()]), [[200, '/a'], [200, '/b'], [200, '/c']]);
    assert.ok(ms < 800, `parallel round took ${ms} ms (sequential would be ≥ 900)`);
    assert.deepEqual(bridge.fetchAll([]), []);
    assert.equal(bridge.fetch(base + '/after').getContentText(), '/after', 'single fetch still works after a batch');
  } finally { bridge.close(); child.kill(); }
});

test('FA-02 the metadata-token wrapper passes fetchAll through; a token request is answered by the identity', () => {
  const seen = [];
  const one = (url, opts) => { seen.push(['one', url]); return {getResponseCode: () => 200, getContentText: () => '{}'}; };
  const all = reqs => { seen.push(['all', reqs.length]); return reqs.map(() => ({getResponseCode: () => 200, getContentText: () => '[]'})); };
  const t = withMetadataToken(one, all);
  t.fetchAll([{url: 'https://firestore.googleapis.com/x'}, {url: 'https://firestore.googleapis.com/y'}]);
  assert.deepEqual(seen.at(-1), ['all', 2]);
  t.fetchAll([{url: TOKEN_ENDPOINT}]);
  assert.deepEqual(seen.at(-1), ['one', METADATA_TOKEN_URL]);
  assert.equal(typeof withMetadataToken(one).fetchAll, 'undefined', 'no fetchAll when the host has none');
});

test('FA-03 the profiler only exposes fetchAll when the host has it, and labels COUNT calls', () => {
  const prof = createRequestProfiler();
  const reply = {getResponseCode: () => 200, getContentText: () => '[]'};
  const noAll = prof.wrapUrlFetch({fetch: () => reply});
  assert.equal(typeof noAll.fetchAll, 'undefined', 'a host without fetchAll keeps the sequential path (no crash)');
  const withAll = prof.wrapUrlFetch({fetch: () => reply, fetchAll: reqs => reqs.map(() => reply)});
  withAll.fetchAll([{url: 'https://x/documents:runAggregationQuery'}, {url: 'https://x/documents:runQuery'}]);
  assert.equal(prof.report().fetch.calls[0].kind, 'fetchAll[count,runQuery]');
});
