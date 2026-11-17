// Version and group/action allowlist. No reflection, eval or function-name invocation.
function apiDispatch_(req, method) {
  var requestId = req && typeof req.requestId === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(req.requestId) ? req.requestId : null;
  try {
    assertApiRequest_(req);
    var key = req.group + "." + req.action;
    if (req.apiVersion === "v1" && key === "system.health") {
      return apiSuccess_(systemHealth_(),requestId);
    }
    // Fail closed: all vehicle/contact/QR/audit operations must await secure auth design.
    return apiFailure_("NOT_FOUND","Unknown or unavailable operation",requestId);
  } catch (_) { return apiFailure_("BAD_REQUEST","Invalid API request",requestId); }
}
