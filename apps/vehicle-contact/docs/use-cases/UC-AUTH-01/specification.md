# UC-AUTH-01 — Local login, session check and logout
**Status:** LIVE_DEV_API_SCOPE_VERIFIED; BROWSER_UAT_AND_PRODUCTION_GATES_OPEN
**Actor:** Pre-provisioned user (STAFF / REGISTRATION_ADMIN / SYSTEM_ADMIN / OWNER / RETENTION_WORKER)

## 1. Authority and scope
- Business baseline: [Approved requirements](../../APPROVED_REQUIREMENTS_BASELINE_R01_R26.md).
- API operations: `auth.login`, `auth.session`, `auth.logout` (API v1 JSON envelope, GAS POST except public health GET).
- Implementation: `backend/gas/src/application/use-cases/IdentityOperations.js`; server permission source `backend/gas/src/api/controllers/OperationController.js`.
- Diagram source: [sequence.mmd](sequence.mmd) (Mermaid, reviewed alongside spec).

## 2. Preconditions
Account exists and ACTIVE; server-side pepper and idle-timeout setting are configured; protected API explicitly enabled only in isolated staging.

## 3. Successful outcome / postconditions
Issue only an opaque session token to client; store token digest in vc_sessions; validate role and session per protected call; revoke on logout.

## 4. Failure and alternate paths
Unknown/suspended user, password mismatch, retry limit, expired/idle/revoked session return safe denial. **B4 constant-work behavior is delivered:** unknown and inactive users use a static dummy PBKDF2 hash with the same 150,000-round cost, so password verification occurs unconditionally before `INVALID_CREDENTIALS`.

## 5. Persistence / external side effects
- `vc_users`
- `vc_security_events`
- `vc_sessions`
- `vc_settings`
- `vc_user_roles`
- `vc_user_permissions`

## 6. Acceptance trace
- Test case IDs: `TC-AUTH-01`, `TC-AUTH-02`, `TC-AUTH-03`, `TC-SESS-01`, `TC-SESS-02`, `GAS-AUTH-LOGIN`, `GAS-AUTH.LOGOUT_REVOKE`.
- Executable evidence references: `backend/gas/tests/auth-session-integration.test.mjs`.
- Aggregate PR #110 / bf3553d live DEV evidence covers 56/56 API operations (97/97 checks); it does not prove every business branch, external provider/device behavior, destructive retention execution, browser/business UAT or production approval.
- FE status: **WIRED_IN_SOURCE / LIVE_API_VERIFIED / BROWSER_UAT_OPEN** for the shared login/session shell; browser and production security acceptance remain open.

## 7. Development notes / explicit gaps
Login reads `vc_security_events` for the 15-minute failed-attempt limit (6 failures). B4 equal-cost negative-path verification is implemented and live DEV API scope is verified; it is not a formal timing analysis, production security signoff, real OIDC-provider acceptance or release approval.

## 8. Approval conditions
Traceability check PASS; frontend API adapter request/response and errors match backend v1; auth/default-deny and negative tests demonstrated; staging execution evidence linked to SHA; remaining discrepancies dispositioned by ADR.


**Evidence classification:** Source-reviewed implementation model plus scoped live DEV API evidence (GAS V48, backend 0.9.1). It is NOT browser/business UAT, destructive retention execution, real OIDC-provider or physical-QR acceptance, PDPA/security signoff, or production release approval. Runtime discrepancies require decision-log disposition and PR review.

## 9. GitHub Mermaid Preview

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant FE as Vue Client
  participant GAS as GAS doPost
  participant API as Router + Controller
  participant Auth as IdentityOperations + SessionService
  participant DB as Sheets
  User->>FE: Enter username and password
  FE->>GAS: POST auth.login(username,password)
  GAS->>API: Version + DTO validation / feature gate
  API->>Auth: login()
  Auth->>DB: Read recent failures and vc_users
  Auth->>Auth: B4 select real or equal-cost dummy PBKDF2 hash; always verify password
  alt User active and password valid; under rate limit
    Auth->>DB: Record SUCCESS security event
    Auth->>DB: Insert vc_sessions with token digest
    Auth-->>API: Session token, expiry, mustChangePassword
    API-->>FE: ok true / sessionToken
    FE->>GAS: POST auth.session(sessionToken)
    GAS->>Auth: Validate token digest, idle, expiry, roles
    Auth->>DB: Update last_seen_at
    Auth-->>FE: userId / roles / expiry
    User->>FE: Logout
    FE->>GAS: POST auth.logout(sessionToken)
    GAS->>Auth: Revoke vc_sessions row
    Auth-->>FE: revoked true
  else Invalid login or blocked account
    Auth->>DB: Record FAILED security event where allowed
    Auth-->>FE: INVALID_CREDENTIALS / LOGIN_RATE_LIMIT
  end
  Note over Auth,DB: B4 constant-work negative path delivered; production security signoff remains open
  Note over FE,GAS: Browser tokens are not trusted roles; live DEV API scope is not browser/production acceptance
```
