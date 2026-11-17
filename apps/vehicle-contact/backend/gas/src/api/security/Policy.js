// Protected routes remain disabled until independently tested authentication and authorization.
export function requireAuthorizedPrincipal() {
  throw new Error("AUTHENTICATION_NOT_CONFIGURED");
}
