# UC-AUTH-03 — Google identity linking and pre-provisioned Google sign-in
**Status:** DESIGN_BASELINED_FROM_SOURCE; LIVE_GAS_ACCEPTANCE_PENDING
**Actor:** Authenticated account holder / linked Google identity

## 1. Authority and scope
- Business baseline: [Approved requirements](../../APPROVED_REQUIREMENTS_BASELINE_R01_R26.md).
- API operations: `auth.linkGoogle`, `auth.googleLogin` (API v1 JSON envelope, GAS POST except public health GET).
- Implementation: `backend/gas/src/application/use-cases/IdentityOperations.js`; server permission source `backend/gas/src/api/controllers/OperationController.js`.
- Diagram source: [sequence.mmd](sequence.mmd) (Mermaid, reviewed alongside spec).

## 2. Preconditions
A locally authenticated account exists for linking; Google OIDC client audience and trusted verifier configured.

## 3. Successful outcome / postconditions
Verified Google subject (sub) is linked uniquely to an existing user; later login issues server-side session only for that linked ACTIVE account.

## 4. Failure and alternate paths
Unknown/unlinked sub, invalid Google token, reused sub, wrong local password or disabled user fails; no Google auto-provisioning.

## 5. Persistence / external side effects
- `vc_user_identities`
- `vc_users`
- `vc_sessions`
- `vc_change_audit`

## 6. Acceptance trace
- Test case IDs: `ACTOR-07`, `TC-AUTH-02`.
- Executable evidence references: `backend/gas/tests/auth-session-integration.test.mjs`.
- Passing tests for source paths do not automatically prove all cases of this UC. Real GAS Editor and authenticated staging HTTP remain separate release gates.
- FE status: **NOT_WIRED**; design must align Vue 3, Pinia, Router and API adapter per Master Web Blueprint.

## 7. Development notes / explicit gaps
Google token validation uses UrlFetchApp to Google tokeninfo and must check audience, issuer, expiry, email_verified. OIDC live provider test is not yet verified.

## 8. Approval conditions
Traceability check PASS; frontend API adapter request/response and errors match backend v1; auth/default-deny and negative tests demonstrated; staging execution evidence linked to SHA; remaining discrepancies dispositioned by ADR.


**Evidence classification:** Diagram is a source-reviewed implementation model, NOT proof of successful real GAS HTTP integration or production release. Runtime discrepancies must be recorded in decision log and revised via PR.

## 9. GitHub Mermaid Preview

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant FE as Vue Client
  participant API as GAS API
  participant IdP as Google OIDC tokeninfo
  participant Identity as IdentityOperations
  participant DB as Sheets
  User->>FE: Link Google while locally signed in
  FE->>API: auth.linkGoogle(password,idToken,session)
  API->>Identity: Authorize session; verify local password
  Identity->>IdP: Verify Google token audience / issuer / expiry
  alt Token valid and sub unused
    Identity->>DB: Insert vc_user_identities mapping
    Identity->>DB: Append GOOGLE_LINKED audit
    API-->>FE: linked true
    User->>FE: Later Google sign-in
    FE->>API: auth.googleLogin(idToken)
    API->>IdP: Verify token claims
    API->>DB: Resolve existing linked sub to ACTIVE vc_users
    API->>DB: Issue digest-only vc_sessions
    API-->>FE: Session token / expiry
  else Invalid token or unknown/duplicate sub
    API-->>FE: Safe authentication or link error
  end
  Note over API,IdP: External OIDC verifier requires separate live provider evidence
```
