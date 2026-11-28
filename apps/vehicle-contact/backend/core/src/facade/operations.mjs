// The core's operation facade (VC-ADR-046 phase 2b): answers the operations that have been ported — the SAME steps as the
// legacy router + controller, taken from the legacy code itself (no copy): router checks (routeFailure), DTO payload check,
// session check (sessionAuthorizeFlow), the operation's flow, and the error → public code mapping (publicErrorCode).
// To port an operation: add its flow to FLOWS, or (VC-ADR-051, from N1a) its native async use case to USE_CASES. To roll it
// back: remove it (the legacy engine answers again).
import {createHash, randomBytes} from 'node:crypto';
import {routeFailure, requestIdOf} from '../../../gas/src/api/routes/Router.js';
import {validateOperationPayload} from '../../../gas/src/api/dto/OperationPayloadValidator.js';
import {OPERATION_PERMISSIONS, PUBLIC_OPERATIONS, authOptionsFor, publicErrorCode} from '../../../gas/src/api/controllers/OperationController.js';
import {apiSuccess, apiFailure} from '../../../gas/src/api/responses/ResponseFactory.js';
import {runFlowAsync} from '../../../gas/src/application/flows/FlowRunner.js';
import {sessionAuthorizeFlow} from '../../../gas/src/application/flows/SessionAuthorizeFlow.js';
import {vehicleHistoryFlow, vehicleLookupFlow, vehicleDetailFlow, contactReadFlow, qrResolveFlow, vehiclePhotoFlow}
  from '../../../gas/src/application/flows/VehicleReadFlows.js';
import {loginFlow, googleLoginFlow, changePasswordFlow, logoutFlow, sessionInfoFlow, linkGoogleFlow}
  from '../../../gas/src/application/flows/AuthFlows.js';
import {campaignValidateFlow, referencesRegistrationFlow, photoUploadFlow} from '../../../gas/src/application/flows/RegistrationFlows.js';
import {registrationSubmitFlow} from '../../../gas/src/application/flows/RegistrationSubmitFlow.js';
import {REFERENCE_CACHE_MS} from '../../../cloudrun/runtime.mjs';
import {createLogManager} from '../../../gas/src/application/logging/LogManager.js';
import {LOG_SETTING_KEY, defaultLogPolicy, readLogPolicy} from '../../../gas/src/domain/policies/LogPolicy.js';
import {withPrintState} from '../use-cases/print-state.mjs';
import {vehiclesList, qrMarkPrinted} from '../use-cases/vehicle-list.mjs';
import {configGet, configUpdate} from '../use-cases/settings.mjs';
import {resetPreview, resetExecute} from '../use-cases/system-reset.mjs';
import {qrHistory} from '../use-cases/qr-history.mjs';
import {vehiclesListMine} from '../use-cases/vehicle-own-list.mjs';
import {registrationsListPending, registrationsDetail, registrationsReview, registrationsPhoto}
  from '../use-cases/registration-review.mjs';

// operation → (payload, principal) => flow
// operation → (payload, principal, deps) => flow   — phase 2b: the officer path
export const FLOWS = Object.freeze({
  'vehicles.lookup': (p, a, d) => vehicleLookupFlow(p, a, d),
  'qr.resolve': (p, a, d) => qrResolveFlow(p, a, d),
  'vehicles.detail': (p, a, d) => vehicleDetailFlow(p, a, d),
  'vehicles.history': p => vehicleHistoryFlow(p),
  'contacts.read': (p, a, d) => contactReadFlow(p, a, d),
  'vehicles.photo': (p, a, d) => vehiclePhotoFlow(p, a, d),
  // phase 3 wave 1: auth (node:crypto PBKDF2 through the passwords port; Google OIDC port not configured = as the legacy)
  'auth.login': (p, a, d) => loginFlow(p, d),
  'auth.googleLogin': (p, a, d) => googleLoginFlow(p, d),
  'auth.changePassword': (p, a, d) => changePasswordFlow(p, a, d),
  'auth.logout': (p, a, d) => logoutFlow(p, a, d),
  'auth.session': (p, a) => sessionInfoFlow(p, a),
  'auth.linkGoogle': (p, a, d) => linkGoogleFlow(p, a, d),
  // phase 3 wave 2a: the public registration path (photos through the bridge; reference rows in a process memo)
  'campaigns.validate': (p, a, d) => campaignValidateFlow(p, d),
  'references.registration': (p, a, d) => referencesRegistrationFlow(p, d),
  'photos.upload': (p, a, d) => photoUploadFlow(p, d),
  // wave 2b: the submit (idempotent, quota with optimistic concurrency, one atomic commit)
  'registrations.submit': (p, a, d) => registrationSubmitFlow(p, d)
});
// operation → async (payload, principal, {store, now, id, sha256, media}) => result   — VC-ADR-051: native async use cases
export const USE_CASES = Object.freeze({
  // N1a: the admin vehicle list + QR print state (VC-ADR-042)
  'vehicles.list': vehiclesList,
  'qr.markPrinted': qrMarkPrinted,
  // N1a PR 2: the settings registry (numeric settings, person types, log policy, photo policy)
  'system.config.get': configGet,
  'system.config.update': configUpdate,
  // N1a PR 3: disabled by default; execute re-checks the admin password and the current plan
  'system.reset.preview': resetPreview,
  'system.reset.execute': resetExecute,
  // N1b PR 1: QR history uses the core's async Firestore store.
  'qr.history': qrHistory,
  // N1b PR 2: owner-scoped vehicle list, page/count/sticker setting in one read round.
  'vehicles.listMine': vehiclesListMine,
  // N1b PR 3: registration review (bounded pending page; approval duplicate check by plate + province)
  'registrations.listPending': registrationsListPending,
  'registrations.detail': registrationsDetail,
  'registrations.review': registrationsReview,
  'registrations.photo': registrationsPhoto
});
const MEDIA_OPERATIONS = new Set(['vehicles.photo', 'photos.upload', 'system.reset.execute', 'registrations.review', 'registrations.photo']);
// a process memo (key → value, expires): the 645 reference rows change only through the seed installer (as the legacy, 5 min)
export function createMemo(ttlMs = REFERENCE_CACHE_MS, nowMs = () => Date.now()) {
  const m = new Map();
  return Object.freeze({get: k => { const e = m.get(k); return e && nowMs() < e.exp ? e.value : undefined; }, put: (k, value) => { m.set(k, {value, exp: nowMs() + ttlMs}); }});
}
const POLICY_MEMO_MS = 60000; // the log policy is re-read at most once a minute per instance (as the legacy engine)

const sha256Hex = text => createHash('sha256').update(String(text), 'utf8').digest('hex'); // = legacy security.sha256 (UTF-8, hex)
const randomId = () => randomBytes(32).toString('hex'); // 64 hex, the format of the legacy secretToken ids

// store: the async Store port (or a function returning it, built on first use); cache: none — the legacy engine revokes
// sessions, so the core must read them live (a cached session could outlive a revocation)
// media: the MediaStore port (photo bridge) or a function returning it — built on the first photo request
// passwords: the PasswordHasher port (server.mjs injects node:crypto PBKDF2); google: the Google OIDC port (none yet)
// deriveSecret: purpose => hex HMAC-SHA256 with the auth pepper (= legacy security.deriveSecret) — registration QR tokens
export function createCoreFacade({store, media = null, passwords = null, google = null, resetEnabled = false, deriveSecret = null,
  memo = createMemo(), now = () => new Date().toISOString(), sha256 = sha256Hex, id = randomId, flows = FLOWS, useCases = USE_CASES}) {
  const overlap = Object.keys(useCases).filter(op => Object.prototype.hasOwnProperty.call(flows, op));
  if (overlap.length) throw new Error('OPERATION_IN_FLOWS_AND_USE_CASES:' + overlap.join(','));
  let raw = null, logged = null, logs = null, mediaPort = null;
  // the log policy (VC-ADR-040) for the core's store: loaded asynchronously, memoised, defaults when unreadable
  const policy = {value: defaultLogPolicy(), at: -Infinity};
  async function refreshPolicy(s) {
    if (Date.now() - policy.at < POLICY_MEMO_MS) return;
    try { const row = await s.one('vc_settings', {key: LOG_SETTING_KEY}); policy.value = readLogPolicy(row && row.value); }
    catch { policy.value = defaultLogPolicy(); }
    policy.at = Date.now();
  }
  // the same Log Manager as the legacy engine decides every log row the core writes (switched off → not written; kept → expire_at);
  // and the QR print-state rule (VC-ADR-042) on every write path — the legacy controller's order (print state outside the logs)
  const storeOf = () => {
    if (!logged) { raw = typeof store === 'function' ? store() : store; logs = createLogManager({policy: () => policy.value, now}); logged = withPrintState(logs.wrapStore(raw)); }
    return logged;
  };
  const mediaOf = () => (mediaPort ||= typeof media === 'function' ? media() : media);
  return Object.freeze({
    operations: Object.freeze([...Object.keys(flows), ...Object.keys(useCases)]),
    async dispatch(request, method = 'POST') {
      const requestId = requestIdOf(request);
      const failure = routeFailure(request, method);
      if (failure) return failure;
      try {
        const op = request.group + '.' + request.action;
        const own = k => Object.prototype.hasOwnProperty.call(k, op);
        if (!own(flows) && !own(useCases)) return apiFailure('NOT_FOUND', 'Unavailable operation', requestId);
        const payload = request.payload || {};
        validateOperationPayload(op, payload);
        const s = storeOf();
        await refreshPolicy(raw);
        const principal = PUBLIC_OPERATIONS.includes(op) ? null
          : await runFlowAsync(sessionAuthorizeFlow({token: request.sessionToken, permission: OPERATION_PERMISSIONS[op], ...authOptionsFor(op)}, {sha256, now}), {store: s});
        const media = MEDIA_OPERATIONS.has(op) && (op !== 'system.reset.execute' || resetEnabled) ? mediaOf() : null;
        const result = own(useCases) ? await useCases[op](payload, principal, {store: s, now, id, sha256, media, logs,
            passwords, resetEnabled, deriveSecret, refreshLogPolicy: () => { policy.at = -Infinity; }})
          : await runFlowAsync(flows[op](payload, principal, {now, id, sha256}), {store: s, passwords, google, memo, media});
        return apiSuccess(result, requestId);
      } catch (e) {
        return apiFailure(publicErrorCode(e), 'Request could not be completed', requestId);
      }
    }
  });
}
