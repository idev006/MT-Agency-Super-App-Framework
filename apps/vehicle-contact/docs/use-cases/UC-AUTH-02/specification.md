# UC-AUTH-02 — First-login password change and administrator reset
**Status:** LIVE_DEV_API_SCOPE_VERIFIED; BROWSER_UAT_AND_PRODUCTION_GATES_OPEN
**Actor:** Authenticated user / SYSTEM_ADMIN

## 1. Authority and scope
- Business baseline: [Approved requirements](../../APPROVED_REQUIREMENTS_BASELINE_R01_R26.md).
- API operations: `auth.changePassword`, `users.resetPassword` (API v1 JSON envelope, GAS POST except public health GET).
- Implementation: `backend/gas/src/application/use-cases/IdentityOperations.js`; server permission source `backend/gas/src/api/controllers/OperationController.js`.
- Diagram source: [sequence.mmd](sequence.mmd) (Mermaid, reviewed alongside spec).

## 2. Preconditions
User is pre-provisioned and has an active session; password_change_required may be set. System Admin has users.manage for resets.

## 3. Successful outcome / postconditions
Verify old password, write new PBKDF2 hash, clear first-login flag, revoke all sessions; admin reset sets flag again and revokes sessions.

## 4. Failure and alternate paths
Wrong old password or insufficient permission fails; admin-reset error does not create a new session. Abrupt Sheets partial writes need review.

## 5. Persistence / external side effects
- `vc_users`
- `vc_sessions`
- `vc_change_audit`

## 6. Acceptance trace
- Test case IDs: `TC-AUTH-04`, `TC-AUTH-05`, `ACTOR-01`, `GAS-AUTH.INITIAL_CHANGE_REQUIRED`.
- Executable evidence references: `backend/gas/tests/auth-session-integration.test.mjs`, `backend/gas/tests/actor-usecase-acceptance.test.mjs`.
- Aggregate PR #110 / bf3553d live DEV evidence covers 56/56 API operations (97/97 checks); it does not prove every business branch, external provider/device behavior, destructive retention execution, browser/business UAT or production approval.
- FE status: **NOT_WIRED**; design must align Vue 3, Pinia, Router and API adapter per Master Web Blueprint.

## 7. Development notes / explicit gaps
First login can use auth.session, auth.logout and auth.changePassword while other protected business operations are blocked.

## 8. Approval conditions
Traceability check PASS; frontend API adapter request/response and errors match backend v1; auth/default-deny and negative tests demonstrated; staging execution evidence linked to SHA; remaining discrepancies dispositioned by ADR.


**Evidence classification:** Source-reviewed implementation model plus scoped live DEV API evidence (GAS V48, backend 0.9.1). It is NOT browser/business UAT, destructive retention execution, real OIDC-provider or physical-QR acceptance, PDPA/security signoff, or production release approval. Runtime discrepancies require decision-log disposition and PR review.

## 9. GitHub Mermaid Preview

```mermaid
sequenceDiagram
  autonumber
  actor User
  actor Admin as SYSTEM_ADMIN
  participant FE as Vue Client
  participant API as GAS API
  participant Identity as IdentityOperations
  participant Session as SessionService
  participant DB as Sheets
  User->>FE: Submit old and new password
  FE->>API: auth.changePassword with sessionToken
  API->>Session: authorize allowPasswordChange
  API->>Identity: Validate old password / hash new
  alt Old password valid
    Identity->>DB: Update vc_users hash and change_required false
    Identity->>DB: Append password-change audit
    Identity->>Session: revokeUser(userId)
    Session->>DB: Revoke all active vc_sessions
    API-->>FE: changed true, reauthenticate true
  else Invalid old password
    API-->>FE: INVALID_CREDENTIALS
  end
  Admin->>API: users.resetPassword(userId,tempPassword)
  API->>Session: Require users.manage
  alt Allowed
    API->>Identity: resetPassword()
    Identity->>DB: Replace hash, set change_required true
    Identity->>Session: Revoke all sessions
    API-->>Admin: reset true
  else Forbidden
    API-->>Admin: FORBIDDEN
  end
```
