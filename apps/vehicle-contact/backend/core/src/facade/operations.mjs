// The core's operation facade (VC-ADR-046 phase 2b): answers the operations that have been ported — the SAME steps as the
// legacy router + controller, taken from the legacy code itself (no copy): router checks (routeFailure), DTO payload check,
// session check (sessionAuthorizeFlow), the operation's flow, and the error → public code mapping (publicErrorCode).
// To port an operation: add its flow to FLOWS. To roll it back: remove it (the legacy engine answers again).
import {createHash} from 'node:crypto';
import {routeFailure, requestIdOf} from '../../../gas/src/api/routes/Router.js';
import {validateOperationPayload} from '../../../gas/src/api/dto/OperationPayloadValidator.js';
import {OPERATION_PERMISSIONS, PUBLIC_OPERATIONS, authOptionsFor, publicErrorCode} from '../../../gas/src/api/controllers/OperationController.js';
import {apiSuccess, apiFailure} from '../../../gas/src/api/responses/ResponseFactory.js';
import {runFlowAsync} from '../../../gas/src/application/flows/FlowRunner.js';
import {sessionAuthorizeFlow} from '../../../gas/src/application/flows/SessionAuthorizeFlow.js';
import {vehicleHistoryFlow} from '../../../gas/src/application/flows/VehicleReadFlows.js';

// operation → (payload, principal) => flow
export const FLOWS = Object.freeze({
  'vehicles.history': payload => vehicleHistoryFlow(payload)
});

const sha256Hex = text => createHash('sha256').update(String(text), 'utf8').digest('hex'); // = legacy security.sha256 (UTF-8, hex)

// store: the async Store port (or a function returning it, built on first use); cache: none — the legacy engine revokes
// sessions, so the core must read them live (a cached session could outlive a revocation)
export function createCoreFacade({store, now = () => new Date().toISOString(), sha256 = sha256Hex, flows = FLOWS}) {
  let resolved = null;
  const storeOf = () => (resolved ||= typeof store === 'function' ? store() : store);
  return Object.freeze({
    operations: Object.freeze(Object.keys(flows)),
    async dispatch(request, method = 'POST') {
      const requestId = requestIdOf(request);
      const failure = routeFailure(request, method);
      if (failure) return failure;
      try {
        const op = request.group + '.' + request.action;
        if (!Object.prototype.hasOwnProperty.call(flows, op)) return apiFailure('NOT_FOUND', 'Unavailable operation', requestId);
        const payload = request.payload || {};
        validateOperationPayload(op, payload);
        const s = storeOf();
        const principal = PUBLIC_OPERATIONS.includes(op) ? null
          : await runFlowAsync(sessionAuthorizeFlow({token: request.sessionToken, permission: OPERATION_PERMISSIONS[op], ...authOptionsFor(op)}, {sha256, now}), {store: s});
        const result = await runFlowAsync(flows[op](payload, principal, {now}), {store: s});
        return apiSuccess(result, requestId);
      } catch (e) {
        return apiFailure(publicErrorCode(e), 'Request could not be completed', requestId);
      }
    }
  });
}
