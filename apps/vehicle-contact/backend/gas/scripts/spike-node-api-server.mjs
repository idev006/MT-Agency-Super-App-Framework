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

export {createApiHandler as createSpikeHandler} from '../../cloudrun/http-handler.mjs';
import {createApiHandler} from '../../cloudrun/http-handler.mjs';

if (process.argv[1]?.endsWith('spike-node-api-server.mjs')) {
  const comp = createFirestoreNodeComposition({...loadDevFirestoreConfig(), audit: {failures: [], writes: 0, deletes: 0}});
  const port = Number(process.env.PORT || 8787);
  http.createServer(createApiHandler(comp.application)).listen(port, () => console.log('SPIKE_LISTENING ' + port));
}
