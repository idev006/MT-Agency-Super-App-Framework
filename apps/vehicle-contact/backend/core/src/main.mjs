// Process entry for the p6vc-core container (VC-ADR-046). Config comes only from the environment.
// Node runtime: libuv thread pool sized by the deploy (UV_THREADPOOL_SIZE = 2 x vCPU, for node:crypto PBKDF2 at login), an
// event-loop / memory monitor (one log line per active minute), graceful shutdown on SIGTERM (Cloud Run scale-in, deploys).
import http from 'node:http';
import {createCoreHandler} from './server.mjs';
import {createRuntimeMonitor, installGracefulShutdown} from './adapters/runtime/process.mjs';

const port = Number(process.env.PORT || 8080);
const monitor = createRuntimeMonitor();
const server = http.createServer(monitor.wrap(createCoreHandler()));
installGracefulShutdown(server, {onStop: () => monitor.stop()});
monitor.start();
server.listen(port, () => console.log(JSON.stringify({event: 'listening', service: 'p6vc-core', port, threadpool: Number(process.env.UV_THREADPOOL_SIZE) || 4})));
