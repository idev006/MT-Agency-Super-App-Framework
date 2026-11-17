# UC-REG-01 — Public vehicle application submission with five photos
**Status:** DESIGN_BASELINED_FROM_SOURCE; LIVE_GAS_ACCEPTANCE_PENDING
**Actor:** Anonymous registrant with valid campaign

## 1. Authority and scope
- Business baseline: [Approved requirements](../../APPROVED_REQUIREMENTS_BASELINE_R01_R26.md).
- API operations: `registrations.submit` (API v1 JSON envelope, GAS POST except public health GET).
- Implementation: `backend/gas/src/application/use-cases/VehicleOperations.js`; server permission source `backend/gas/src/api/controllers/OperationController.js`.
- Diagram source: [sequence.mmd](sequence.mmd) (Mermaid, reviewed alongside spec).

## 2. Preconditions
Campaign active with available quota; organization active; all mandatory vehicle/contact fields present; exactly five staged photo IDs.

## 3. Successful outcome / postconditions
Store PENDING_APPROVAL registration, claim media, increment quota once, persist idempotency response and operation journal.

## 4. Failure and alternate paths
Duplicate plate+province, invalid campaign, staged photo mismatch, quota exhaustion or idempotency conflict denied; caught write errors compensated but abrupt timeout requires manual recovery.

## 5. Persistence / external side effects
- `vc_campaigns`
- `vc_organizations`
- `vc_photo_staging`
- `vc_registration_requests`
- `vc_idempotency`
- `vc_operation_journal`
- `vc_vehicles`

## 6. Acceptance trace
- Test case IDs: `ACTOR-03`, `EDGE-01`, `EDGE-03`, `EDGE-04`, `EDGE-09`, `GAS-FLOW.REGISTRATION_SUBMIT`.
- Executable evidence references: `backend/gas/tests/actor-usecase-acceptance.test.mjs`.
- Passing tests for source paths do not automatically prove all cases of this UC. Real GAS Editor and authenticated staging HTTP remain separate release gates.
- FE status: **NOT_WIRED**; design must align Vue 3, Pinia, Router and API adapter per Master Web Blueprint.

## 7. Development notes / explicit gaps
Exactly one primary contact is created only during approval. Sheets compensation is not atomic database rollback; journal PREPARED after crash is a release blocker.

## 8. Approval conditions
Traceability check PASS; frontend API adapter request/response and errors match backend v1; auth/default-deny and negative tests demonstrated; staging execution evidence linked to SHA; remaining discrepancies dispositioned by ADR.


**Evidence classification:** Diagram is a source-reviewed implementation model, NOT proof of successful real GAS HTTP integration or production release. Runtime discrepancies must be recorded in decision log and revised via PR.
