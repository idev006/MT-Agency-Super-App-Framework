# UC-ADMIN-03 — System settings and public health check
**Status:** DESIGN_BASELINED_FROM_SOURCE; LIVE_GAS_ACCEPTANCE_PENDING
**Actor:** SYSTEM_ADMIN / anonymous monitor (health only)

## 1. Authority and scope
- Business baseline: [Approved requirements](../../APPROVED_REQUIREMENTS_BASELINE_R01_R26.md).
- API operations: `system.health`, `system.config.get`, `system.config.update` (API v1 JSON envelope, GAS POST except public health GET).
- Implementation: `backend/gas/src/api/routes/Router.js`; server permission source `backend/gas/src/api/controllers/OperationController.js`.
- Diagram source: [sequence.mmd](sequence.mmd) (Mermaid, reviewed alongside spec).

## 2. Preconditions
Public health may be checked without credentials; settings require a server-verified SYSTEM_ADMIN session.

## 3. Successful outcome / postconditions
Health returns minimal status; settings allow idle_timeout_minutes (1–480) and retention_days (1–3650), audit writes.

## 4. Failure and alternate paths
Unauthorized get/update, unsupported keys, invalid integer ranges are denied; health must not disclose secrets.

## 5. Persistence / external side effects
- `vc_settings`
- `vc_change_audit`

## 6. Acceptance trace
- Test case IDs: `LIVE-01`, `LIVE-02`, `ACTOR-01`, `MATRIX-00`.
- Executable evidence references: `backend/gas/tests/actor-rbac-matrix.test.mjs`.
- Passing tests for source paths do not automatically prove all cases of this UC. Real GAS Editor and authenticated staging HTTP remain separate release gates.
- FE status: **NOT_WIRED**; design must align Vue 3, Pinia, Router and API adapter per Master Web Blueprint.

## 7. Development notes / explicit gaps
Health is special public route in Router, not one of 49 protected DTO handler operations.

## 8. Approval conditions
Traceability check PASS; frontend API adapter request/response and errors match backend v1; auth/default-deny and negative tests demonstrated; staging execution evidence linked to SHA; remaining discrepancies dispositioned by ADR.


**Evidence classification:** Diagram is a source-reviewed implementation model, NOT proof of successful real GAS HTTP integration or production release. Runtime discrepancies must be recorded in decision log and revised via PR.
