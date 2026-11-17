# UC-ADMIN-01 — User provisioning, maintenance, suspension and role assignment
**Status:** DESIGN_BASELINED_FROM_SOURCE; LIVE_GAS_ACCEPTANCE_PENDING
**Actor:** SYSTEM_ADMIN

## 1. Authority and scope
- Business baseline: [Approved requirements](../../APPROVED_REQUIREMENTS_BASELINE_R01_R26.md).
- API operations: `users.create`, `users.list`, `users.update`, `users.suspend`, `users.assignRoles` (API v1 JSON envelope, GAS POST except public health GET).
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
- Passing tests for source paths do not automatically prove all cases of this UC. Real GAS Editor and authenticated staging HTTP remain separate release gates.
- FE status: **NOT_WIRED**; design must align Vue 3, Pinia, Router and API adapter per Master Web Blueprint.

## 7. Development notes / explicit gaps
Role assignment removes existing assignments then reinserts requested roles under a Sheets lock; mid-write interruption may leave a partial assignment and needs recovery plan.

## 8. Approval conditions
Traceability check PASS; frontend API adapter request/response and errors match backend v1; auth/default-deny and negative tests demonstrated; staging execution evidence linked to SHA; remaining discrepancies dispositioned by ADR.


**Evidence classification:** Diagram is a source-reviewed implementation model, NOT proof of successful real GAS HTTP integration or production release. Runtime discrepancies must be recorded in decision log and revised via PR.
