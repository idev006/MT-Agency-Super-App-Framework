import { validateApiRequest } from "../dto/RequestValidator.js";
import { apiSuccess, apiFailure } from "../responses/ResponseFactory.js";
import { systemHealth } from "../groups/system/SystemGroup.js";

// Versioned allowlist: no eval, reflection, dynamic function dispatch or client-selected adapters.
export function createApiRouter() {
  return Object.freeze({
    dispatch(req, method) {
      const requestId = req && typeof req.requestId === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(req.requestId) ? req.requestId : null;
      try {
        validateApiRequest(req);
        if (req.apiVersion === "v1" && req.group === "system" && req.action === "health") {
          return apiSuccess(systemHealth(),requestId);
        }
        // Protected operations remain fail-closed, even for forged user/session payloads.
        return apiFailure("NOT_FOUND","Unknown or unavailable operation",requestId);
      } catch (_) {
        return apiFailure("BAD_REQUEST","Invalid API request",requestId);
      }
    }
  });
}
