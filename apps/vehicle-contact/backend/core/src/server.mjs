// p6vc-core entrypoint (VC-ADR-046). The front door: same HTTP contract as the legacy service
// (/ server-to-server, /api/frontend browser gateway) — the handler code is shared, not copied.
// Phase 1: every operation is forwarded to the legacy engine (src/http/routing.mjs decides per operation).
import {createApiHandler} from '../../cloudrun/http-handler.mjs';
import {createLegacyClient} from './adapters/legacy-client.mjs';
import {createRouter} from './http/routing.mjs';

export function createCoreHandler({legacy = createLegacyClient()} = {}) {
  return createApiHandler(createRouter({legacy}), {headers: {'x-p6vc-engine': 'core'}});
}
