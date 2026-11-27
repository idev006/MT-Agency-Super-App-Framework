// Node runtime of the core process (VC-ADR-046): the request monitor (event-loop delay, in-flight peak) and graceful shutdown.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {EventEmitter} from 'node:events';
import {createRuntimeMonitor, installGracefulShutdown} from '../src/adapters/runtime/process.mjs';

test('RT-01 the monitor counts requests and the in-flight peak through a real server; one line per active window only', async () => {
  const lines = [];
  const monitor = createRuntimeMonitor({log: l => lines.push(l), env: {UV_THREADPOOL_SIZE: '4'}});
  const server = http.createServer(monitor.wrap((_req, res) => setTimeout(() => res.end('ok'), 30)));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  monitor.start();
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    await Promise.all(Array.from({length: 5}, () => fetch(url).then(r => r.text())));
    monitor.flush();
    assert.equal(lines.length, 1);
    assert.equal(lines[0].event, 'runtime'); assert.equal(lines[0].requests, 5); assert.equal(lines[0].peakInFlight, 5);
    assert.equal(lines[0].threadpool, 4); assert.ok(Number.isFinite(lines[0].loopDelayP99Ms));
    assert.equal(monitor.inFlight(), 0, 'every finished request leaves the in-flight count');
    monitor.flush();
    assert.equal(lines.length, 1, 'a window without requests logs nothing');
  } finally { monitor.stop(); server.close(); }
});

test('RT-02 SIGTERM: stop accepting, let the in-flight request finish, then exit 0', async () => {
  const proc = new EventEmitter(), events = [];
  let release;
  const server = http.createServer((_req, res) => { release = () => res.end('done'); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const exited = new Promise(resolve => installGracefulShutdown(server, {proc, log: l => events.push(l.event), timeoutMs: 5000,
    onStop: () => events.push('stopped'), exit: code => resolve(code)}));
  const pending = fetch(`http://127.0.0.1:${server.address().port}/`).then(r => r.text());
  await new Promise(r => setTimeout(r, 50));
  proc.emit('SIGTERM');
  release();
  assert.equal(await pending, 'done', 'the in-flight request completed');
  assert.equal(await exited, 0);
  assert.deepEqual(events, ['shutdown', 'stopped']);
});

test('RT-03 a server that never drains is forced to exit within the timeout', async () => {
  const proc = new EventEmitter();
  const stuck = {close: () => {}, closeIdleConnections: () => {}}; // close() never calls back
  const t = performance.now();
  const code = await new Promise(resolve => installGracefulShutdown(stuck, {proc, log: () => {}, timeoutMs: 100, exit: resolve}) && proc.emit('SIGTERM'));
  assert.equal(code, 0); assert.ok(performance.now() - t < 2000);
});
