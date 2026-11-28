// p6vc-core composition root (VC-ADR-046). The front door: same HTTP contract as the legacy service
// (/ server-to-server, /api/frontend browser gateway) — the handler code is shared, not copied.
// Ported operations are answered by the core facade on its own Firestore store; the rest is forwarded to the legacy engine.
import {Firestore} from '@google-cloud/firestore';
import {createApiHandler} from '../../cloudrun/http-handler.mjs';
import {createIntegrationManager} from './adapters/outbound/manager.mjs';
import {createSdkGateway} from './adapters/firestore/sdk-gateway.mjs';
import {createFirestoreStoreAsync} from './adapters/firestore/store.mjs';
import {createNodePasswordHasher} from './adapters/security/password-hasher.mjs';
import {createDeriveSecret} from './adapters/security/derive-secret.mjs';
import {createCoreFacade} from './facade/operations.mjs';
import {createRouter} from './http/routing.mjs';

// Firestore client from the environment (Cloud Run: the runtime service account); built on the first ported call.
// gRPC transport (the SDK default), NOT preferRest: one HTTP/2 connection multiplexes the concurrent calls of an instance.
// Measured 2b-3 (same reads, same machine): REST 17-31 ms CPU per request and p50 470 ms at 10 in flight; gRPC 3-10 ms
// and 145 ms. On Cloud Run's 1 vCPU, REST made the core's lookup p50 grow with load (364 ms at 1 -> 3 s at 50).
// preferRest stays right for short one-off scripts (faster start, no long-lived connection).
export const firestoreStoreFromEnv = (env = process.env) => () => createFirestoreStoreAsync({gateway: createSdkGateway({
  db: new Firestore({projectId: env.FIRESTORE_PROJECT_ID, databaseId: env.FIRESTORE_DATABASE_ID || '(default)'})})});

// integrations: the Integration Manager (VC-ADR-047); every outbound call goes through it
export function createCoreHandler({integrations = createIntegrationManager(), legacy = integrations.gateway('legacy-engine'),
  core = createCoreFacade({store: firestoreStoreFromEnv(), media: () => integrations.gateway('media-bridge'),
    passwords: createNodePasswordHasher({pepper: process.env.P6VC_AUTH_PEPPER || null}),
    deriveSecret: createDeriveSecret(process.env.P6VC_AUTH_PEPPER),
    // retention.execute deletes permanently: off unless set (the legacy property; not set on Cloud Run)
    retentionExecuteEnabled: process.env.VEHICLE_RETENTION_EXECUTE_ENABLED === 'true',
    resetEnabled: process.env.P6VC_SYSTEM_RESET === 'ENABLED'})} = {}) {
  const router = createRouter({legacy, core});
  // x-p6vc-answered-by: which engine answered this operation (evidence for each ported group; no data in it)
  // (no envelope = GET / = health)
  const headers = envelope => ({'x-p6vc-engine': 'core',
    'x-p6vc-answered-by': router.engineFor(envelope && typeof envelope === 'object' ? envelope.group + '.' + envelope.action : 'system.health') === 'core' ? 'core' : 'legacy'});
  return createApiHandler(router, {headers});
}
