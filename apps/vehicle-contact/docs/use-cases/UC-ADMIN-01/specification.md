# UC-ADMIN-01 — User provisioning, maintenance, suspension and role assignment
**Status:** LIVE_DEV_API_SCOPE_VERIFIED; BROWSER_UAT_AND_PRODUCTION_GATES_OPEN
**Actor:** SYSTEM_ADMIN

## 1. Authority and scope
- Business baseline: [Approved requirements](../../APPROVED_REQUIREMENTS_BASELINE_R01_R26.md).
- API operations: `users.create`, `users.list`, `users.update`, `users.suspend`, `users.reactivate`, `users.assignRoles` (API v1 JSON envelope, GAS POST except public health GET).
- Implementation: `backend/gas/src/application/use-cases/IdentityOperations.js`; server permission source `backend/gas/src/api/controllers/OperationController.js`.
- Diagram source: [sequence.mmd](sequence.mmd) (Mermaid, reviewed alongside spec).

## 2. Preconditions
System Admin has users.manage; username and roles meet allowlist; server session active.

## 3. Successful outcome / postconditions
Create a STAFF account with temporary password, edit profile, assign valid roles, suspend account, revoke sessions, write change audit.

## 4. Failure and alternate paths
Duplicate username, invalid roles, self-suspend, self-demotion and lack of users.manage are denied; no self-signup.

## 5. Persistence / external side effects
- `vc_users`
- `vc_user_roles`
- `vc_sessions`
- `vc_change_audit`

## 6. Acceptance trace
- Test case IDs: `ACTOR-01`, `TC-RBAC-03`, `MATRIX-02`.
- Executable evidence references: `backend/gas/tests/actor-usecase-acceptance.test.mjs`.
- Aggregate PR #110 / bf3553d live DEV evidence covers 56/56 API operations (97/97 checks); it does not prove every business branch, external provider/device behavior, destructive retention execution, browser/business UAT or production approval.
- FE status: **WIRED_IN_SOURCE / LIVE_API_VERIFIED / BROWSER_UAT_OPEN** for delivered System Admin user/role screens; residual B2b role-assignment journaling remains open.

## 7. Development notes / explicit gaps
Role assignment removes existing assignments then reinserts requested roles under a Sheets lock; mid-write interruption may leave a partial assignment and needs recovery plan.

## 8. Approval conditions
Traceability check PASS; frontend API adapter request/response and errors match backend v1; auth/default-deny and negative tests demonstrated; staging execution evidence linked to SHA; remaining discrepancies dispositioned by ADR.


**Evidence classification:** Source-reviewed implementation model plus scoped live DEV API evidence (GAS V48, backend 0.9.1). It is NOT browser/business UAT, destructive retention execution, real OIDC-provider or physical-QR acceptance, PDPA/security signoff, or production release approval. Runtime discrepancies require decision-log disposition and PR review.

## 9. GitHub Mermaid Preview

```mermaid
sequenceDiagram
  autonumber
  actor Admin as SYSTEM_ADMIN
  participant FE as Vue Admin UI
  participant API as GAS API / RBAC
  participant Users as IdentityOperations
  participant DB as Sheets
  Admin->>FE: Manage user account
  FE->>API: users.list / users.create
  API->>API: Require users.manage
  alt Authorized create
    API->>Users: Hash temp password; normalize username
    Users->>DB: Script lock, deduplicate vc_users
    Users->>DB: Insert vc_users + default STAFF role
    Users->>DB: Append vc_change_audit
    API-->>FE: userId
    FE->>API: users.update / users.assignRoles
    API->>Users: Verify role allowlist and self-demotion
    Users->>DB: Replace vc_user_roles; revoke user sessions
    API-->>FE: Updated roles
    FE->>API: users.suspend
    Users->>DB: Suspend vc_users; revoke all sessions; audit
  else Duplicate / unauthorized / invalid role
    API-->>FE: DUPLICATE_USERNAME / FORBIDDEN / INVALID_ROLES
  end
```
