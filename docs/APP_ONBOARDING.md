# App Onboarding Contract — Proposed v0.1

## Workflow
1. Platform Admin receives app owner and purpose.
2. Register app ID, route, owner, operational scope, deployment mode and status.
3. App declares permission keys with descriptions.
4. App Admin defines roles mapped to registered permissions.
5. Delegation and role assignment are approved as required.
6. Validate authentication, server-side authorization, mobile UI and audit handling.
7. Publish to authorized users; support disable/unpublish and version changes.

## Integration modes
- **Internal module**: shares the Shell session and integrates via platform SDK.
- **Independent web application**: integrates with approved OIDC/OAuth SSO; its own backend validates token and enforces policy.
- **GAS app**: requires secure server-side integration/adapter and verifiable identity; GAS public endpoints must not be trusted with client-asserted roles.

## Minimal manifest (illustrative)
```json
{
  "app_id": "vehicle-qr",
  "name": "Vehicle QR",
  "version": "0.1.0",
  "type": "internal",
  "route": "/apps/vehicle",
  "permissions": ["vehicle.access", "vehicle.read", "vehicle.create", "vehicle.approve"]
}
```

## SDK contract (to be implemented)
- getCurrentUser()
- canAccessApp(appId)
- hasPermission(appId, permission, resourceContext)
- getDataScope(appId)
- openApp(appId)
- recordAuditEvent(event)

Client SDK helpers are convenience only; a trusted server must always make final access decisions.

## Acceptance tests
Test forbidden deep links, direct API requests, cross-unit access, cross-app role misuse, expired roles, revocation, and onboarding a second app without rewriting login.
