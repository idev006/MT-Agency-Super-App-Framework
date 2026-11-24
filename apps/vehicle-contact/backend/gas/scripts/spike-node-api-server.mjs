// Cloud Run spike (owner 2026-11-25: "Node + Python เฉพาะงานพิเศษ"). Serves the REAL GAS
// application (same Router/Controller/UseCases/FirestoreStore code) over HTTP from Node, so the
// API can run next to the data (Bangkok) instead of inside Apps Script. Same v1 envelope as GAS:
// POST / with the JSON body the Worker already sends. Spike only: Drive/Lock are the composition's
// synthetic stand-ins, so photo bytes and campaign writes are OUT of scope; the read path
// (session, lookup, detail, QR resolve) runs on live Firestore DEV. Synthetic DEV only.
//   P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE PORT=8787 node scripts/spike-node-api-server.mjs
import './load-env.mjs';
import http from 'node:http';
import {loadDevFirestoreConfig, createFirestoreNodeComposition} from './firestore-node-composition.mjs';

const MAX_BODY = 8 * 1024 * 1024;

export function createSpikeHandler(application) {
  return (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET') return send(200, application.dispatch({apiVersion: 'v1', group: 'system', action: 'health', payload: {}}, 'GET'));
    if (req.method !== 'POST') return send(405, {ok: false, error: {code: 'METHOD_NOT_ALLOWED'}});
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, {ok: false, error: {code: 'INVALID_JSON'}}); }
      // The business code is synchronous (UrlFetchApp contract); the bridge blocks this request
      // only. Cloud Run runs it with concurrency=1 per instance and scales out instances.
      try { send(200, application.dispatch(body, 'POST')); }
      catch { send(500, {ok: false, error: {code: 'OPERATION_FAILED'}}); }
    });
  };
}

if (process.argv[1]?.endsWith('spike-node-api-server.mjs')) {
  const comp = createFirestoreNodeComposition({...loadDevFirestoreConfig(), audit: {failures: [], writes: 0, deletes: 0}});
  const port = Number(process.env.PORT || 8787);
  http.createServer(createSpikeHandler(comp.application)).listen(port, () => console.log('SPIKE_LISTENING ' + port));
}
