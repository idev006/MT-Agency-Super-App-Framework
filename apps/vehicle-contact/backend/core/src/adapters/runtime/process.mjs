// Node runtime capabilities used by the core process (VC-ADR-046): measured, not assumed.
//  - monitor: perf_hooks event-loop delay + memory + request count, one log line per active minute — the live proof that the
//    async core keeps its event loop free (e.g. during a login burst the hashes run in libuv's thread pool, not on the loop).
//  - graceful shutdown: Cloud Run sends SIGTERM and allows ~10 s; stop accepting, let in-flight requests finish, then exit.
// The thread pool size itself is UV_THREADPOOL_SIZE, set by the deploy from the vCPU count (read by libuv at first use).
import {monitorEventLoopDelay} from 'node:perf_hooks';

export function createRuntimeMonitor({log = line => console.log(JSON.stringify(line)), intervalMs = 60000, env = process.env} = {}) {
  const loop = monitorEventLoopDelay({resolution: 10});
  let requests = 0, inFlight = 0, peak = 0, timer = null;
  const ms = ns => Math.round(ns / 1e6);
  function flush() {
    if (requests > 0) log({event: 'runtime', requests, peakInFlight: peak, loopDelayP50Ms: ms(loop.percentile(50)), loopDelayP99Ms: ms(loop.percentile(99)),
      loopDelayMaxMs: ms(loop.max), rssMb: Math.round(process.memoryUsage().rss / 1048576), threadpool: Number(env.UV_THREADPOOL_SIZE) || 4});
    requests = 0; peak = inFlight; loop.reset();
  }
  return Object.freeze({
    start() { loop.enable(); timer = setInterval(flush, intervalMs); timer.unref(); },
    stop() { if (timer) clearInterval(timer); flush(); loop.disable(); },
    // wrap an http (req, res) handler: counts requests and how many run at the same time
    wrap: handler => (req, res) => {
      requests++; inFlight++; peak = Math.max(peak, inFlight);
      let done = false; const end = () => { if (!done) { done = true; inFlight--; } };
      res.once('finish', end); res.once('close', end);
      return handler(req, res);
    },
    flush, inFlight: () => inFlight
  });
}

// on SIGTERM: stop accepting, finish in-flight requests, exit before Cloud Run's deadline
export function installGracefulShutdown(server, {signals = ['SIGTERM', 'SIGINT'], timeoutMs = 8000, exit = code => process.exit(code), onStop = () => {},
  log = line => console.log(JSON.stringify(line)), proc = process} = {}) {
  let stopping = false;
  const stop = signal => {
    if (stopping) return; stopping = true;
    log({event: 'shutdown', signal});
    const force = setTimeout(() => { onStop(); exit(0); }, timeoutMs); force.unref?.();
    server.close(() => { clearTimeout(force); onStop(); exit(0); });
    server.closeIdleConnections?.();
  };
  for (const s of signals) proc.once(s, () => stop(s));
  return stop;
}
