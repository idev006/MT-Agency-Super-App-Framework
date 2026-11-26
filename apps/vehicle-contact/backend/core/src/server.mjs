// p6vc-core entrypoint (VC-ADR-046). The front door: same HTTP contract as the legacy service
// (/ server-to-server, /api/frontend browser gateway) — the handler code is shared, not copied.
// Phase 1: every operation is forwarded to the legacy engine (src/http/routing.mjs decides per operation).
import {createApiHandler} from '../../cloudrun/http-handler.mjs';
import {createIntegrationManager} from './adapters/outbound/manager.mjs';
import {createRouter} from './http/routing.mjs';

// integrations: the Integration Manager (VC-ADR-047); every outbound call goes through it
export function createCoreHandler({integrations = createIntegrationManager(), legacy = integrations.gateway('legacy-engine')} = {}) {
  return createApiHandler(createRouter({legacy}), {headers: {'x-p6vc-engine': 'core'}});
}
