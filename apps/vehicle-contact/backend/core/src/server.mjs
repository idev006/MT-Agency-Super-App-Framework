// p6vc-core composition root (VC-ADR-046). The front door: same HTTP contract as the legacy service
// (/ server-to-server, /api/frontend browser gateway) — the handler code is shared, not copied.
// Ported operations are answered by the core facade on its own Firestore store; the rest is forwarded to the legacy engine.
import {Firestore} from '@google-cloud/firestore';
import {createApiHandler} from '../../cloudrun/http-handler.mjs';
import {createIntegrationManager} from './adapters/outbound/manager.mjs';
import {createSdkGateway} from './adapters/firestore/sdk-gateway.mjs';
import {createFirestoreStoreAsync} from './adapters/firestore/store.mjs';
import {createCoreFacade} from './facade/operations.mjs';
import {createRouter} from './http/routing.mjs';

// Firestore client from the environment (Cloud Run: the runtime service account); built on the first ported call
export const firestoreStoreFromEnv = (env = process.env) => () => createFirestoreStoreAsync({gateway: createSdkGateway({
  db: new Firestore({projectId: env.FIRESTORE_PROJECT_ID, databaseId: env.FIRESTORE_DATABASE_ID || '(default)', preferRest: true})})});

// integrations: the Integration Manager (VC-ADR-047); every outbound call goes through it
export function createCoreHandler({integrations = createIntegrationManager(), legacy = integrations.gateway('legacy-engine'),
  core = createCoreFacade({store: firestoreStoreFromEnv(), media: () => integrations.gateway('media-bridge')})} = {}) {
  const router = createRouter({legacy, core});
  // x-p6vc-answered-by: which engine answered this operation (evidence for each ported group; no data in it)
  const headers = envelope => ({'x-p6vc-engine': 'core',
    'x-p6vc-answered-by': envelope && typeof envelope === 'object' && router.engineFor(envelope.group + '.' + envelope.action) === 'core' ? 'core' : 'legacy'});
  return createApiHandler(router, {headers});
}
