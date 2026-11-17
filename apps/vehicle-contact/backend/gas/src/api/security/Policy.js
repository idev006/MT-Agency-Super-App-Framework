// SECURITY STOP: no unverified client roles, public owner-privileged data endpoints or hardcoded secrets.
function requireAuthorizedPrincipal_() {
  throw Error("AUTHENTICATION_NOT_CONFIGURED");
}
