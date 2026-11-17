# UC-AUTH-02 — First-login password change and administrator reset
**Status:** DESIGN_BASELINED_FROM_SOURCE; LIVE_GAS_ACCEPTANCE_PENDING
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
- Passing tests for source paths do not automatically prove all cases of this UC. Real GAS Editor and authenticated staging HTTP remain separate release gates.
- FE status: **NOT_WIRED**; design must align Vue 3, Pinia, Router and API adapter per Master Web Blueprint.

## 7. Development notes / explicit gaps
First login can use auth.session, auth.logout and auth.changePassword while other protected business operations are blocked.

## 8. Approval conditions
Traceability check PASS; frontend API adapter request/response and errors match backend v1; auth/default-deny and negative tests demonstrated; staging execution evidence linked to SHA; remaining discrepancies dispositioned by ADR.


**Evidence classification:** Diagram is a source-reviewed implementation model, NOT proof of successful real GAS HTTP integration or production release. Runtime discrepancies must be recorded in decision log and revised via PR.
