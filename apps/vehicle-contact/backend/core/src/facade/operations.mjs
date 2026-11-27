// The core's operation facade (VC-ADR-046 phase 2b): answers the operations that have been ported — the SAME steps as the
// legacy router + controller, taken from the legacy code itself (no copy): router checks (routeFailure), DTO payload check,
// session check (sessionAuthorizeFlow), the operation's flow, and the error → public code mapping (publicErrorCode).
// To port an operation: add its flow to FLOWS. To roll it back: remove it (the legacy engine answers again).
import {createHash, randomBytes} from 'node:crypto';
import {routeFailure, requestIdOf} from '../../../gas/src/api/routes/Router.js';
import {validateOperationPayload} from '../../../gas/src/api/dto/OperationPayloadValidator.js';
import {OPERATION_PERMISSIONS, PUBLIC_OPERATIONS, authOptionsFor, publicErrorCode} from '../../../gas/src/api/controllers/OperationController.js';
import {apiSuccess, apiFailure} from '../../../gas/src/api/responses/ResponseFactory.js';
import {runFlowAsync} from '../../../gas/src/application/flows/FlowRunner.js';
import {sessionAuthorizeFlow} from '../../../gas/src/application/flows/SessionAuthorizeFlow.js';
import {vehicleHistoryFlow, vehicleLookupFlow, vehicleDetailFlow, contactReadFlow, qrResolveFlow, vehiclePhotoFlow}
  from '../../../gas/src/application/flows/VehicleReadFlows.js';
import {createLogManager} from '../../../gas/src/application/logging/LogManager.js';
import {LOG_SETTING_KEY, defaultLogPolicy, readLogPolicy} from '../../../gas/src/domain/policies/LogPolicy.js';

// operation → (payload, principal) => flow
// operation → (payload, principal, deps) => flow   — phase 2b: the officer path
export const FLOWS = Object.freeze({
  'vehicles.lookup': (p, a, d) => vehicleLookupFlow(p, a, d),
  'qr.resolve': (p, a, d) => qrResolveFlow(p, a, d),
  'vehicles.detail': (p, a, d) => vehicleDetailFlow(p, a, d),
  'vehicles.history': p => vehicleHistoryFlow(p),
  'contacts.read': (p, a, d) => contactReadFlow(p, a, d),
  'vehicles.photo': (p, a, d) => vehiclePhotoFlow(p, a, d)
});
const POLICY_MEMO_MS = 60000; // the log policy is re-read at most once a minute per instance (as the legacy engine)

const sha256Hex = text => createHash('sha256').update(String(text), 'utf8').digest('hex'); // = legacy security.sha256 (UTF-8, hex)
const randomId = () => randomBytes(32).toString('hex'); // 64 hex, the format of the legacy secretToken ids

// store: the async Store port (or a function returning it, built on first use); cache: none — the legacy engine revokes
// sessions, so the core must read them live (a cached session could outlive a revocation)
// media: the MediaStore port (photo bridge) or a function returning it — built on the first photo request
export function createCoreFacade({store, media = null, now = () => new Date().toISOString(), sha256 = sha256Hex, id = randomId, flows = FLOWS}) {
  let raw = null, logged = null, mediaPort = null;
  // the log policy (VC-ADR-040) for the core's store: loaded asynchronously, memoised, defaults when unreadable
  const policy = {value: defaultLogPolicy(), at: -Infinity};
  async function refreshPolicy(s) {
    if (Date.now() - policy.at < POLICY_MEMO_MS) return;
    try { const row = await s.one('vc_settings', {key: LOG_SETTING_KEY}); policy.value = readLogPolicy(row && row.value); }
    catch { policy.value = defaultLogPolicy(); }
    policy.at = Date.now();
  }
  // the same Log Manager as the legacy engine decides every log row the core writes (switched off → not written; kept → expire_at)
  const storeOf = () => {
    if (!logged) { raw = typeof store === 'function' ? store() : store; logged = createLogManager({policy: () => policy.value, now}).wrapStore(raw); }
    return logged;
  };
  const mediaOf = () => (mediaPort ||= typeof media === 'function' ? media() : media);
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
        await refreshPolicy(raw);
        const principal = PUBLIC_OPERATIONS.includes(op) ? null
          : await runFlowAsync(sessionAuthorizeFlow({token: request.sessionToken, permission: OPERATION_PERMISSIONS[op], ...authOptionsFor(op)}, {sha256, now}), {store: s});
        const result = await runFlowAsync(flows[op](payload, principal, {now, id, sha256}), {store: s, media: op === 'vehicles.photo' ? mediaOf() : null});
        return apiSuccess(result, requestId);
      } catch (e) {
        return apiFailure(publicErrorCode(e), 'Request could not be completed', requestId);
      }
    }
  });
}
