// Node bridge that runs the REAL GAS FirestoreRestGateway + FirestoreStore against LIVE
// Firestore DEV. The gateway is synchronous (UrlFetchApp contract), so fetch is bridged
// through a worker thread + SharedArrayBuffer (Atomics) — one keep-alive connection pool,
// no per-call process spawn, so latency numbers reflect real network+API cost.
// Node-only maintenance tooling (scripts/), NEVER bundled into GAS. Synthetic DEV only.
import {createFirestoreRestGateway} from '../src/infrastructure/persistence/firestore/FirestoreRestGateway.js';
import {createFirestoreStore} from '../src/infrastructure/persistence/firestore/FirestoreStore.js';
import {makeFakeUtilities} from '../tests/fake-firestore-rest-server.mjs';

export {createSyncFetch} from '../../cloudrun/sync-fetch.mjs';
import {createSyncFetch} from '../../cloudrun/sync-fetch.mjs';

// Real GAS gateway + adapter over the sync fetch bridge. `key` = parsed SA JSON (secret,
// never printed). Returns the store plus the raw gateway and transport for calibration.
export function createNodeFirestore({key,projectId,databaseId,clock}){
  const bridge=createSyncFetch();
  const utilities=makeFakeUtilities();
  const gateway=createFirestoreRestGateway({utilities,urlFetchApp:bridge,
    clientEmail:key.client_email,privateKey:key.private_key,
    projectId:projectId||key.project_id,databaseId:databaseId||'(default)',clock});
  const store=createFirestoreStore({firestore:gateway});
  return {store,gateway,bridge,utilities};
}