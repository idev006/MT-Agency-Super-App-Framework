# UC-RET-02 — Retention approval, worker deletion and job status
**Status:** DESIGN_BASELINED_FROM_SOURCE; LIVE_GAS_ACCEPTANCE_PENDING
**Actor:** SYSTEM_ADMIN (approve) / RETENTION_WORKER (execute)

## 1. Authority and scope
- Business baseline: [Approved requirements](../../APPROVED_REQUIREMENTS_BASELINE_R01_R26.md).
- API operations: `retention.approve`, `retention.execute`, `retention.jobStatus` (API v1 JSON envelope, GAS POST except public health GET).
- Implementation: `backend/gas/src/application/use-cases/MediaRetentionOperations.js`; server permission source `backend/gas/src/api/controllers/OperationController.js`.
- Diagram source: [sequence.mmd](sequence.mmd) (Mermaid, reviewed alongside spec).

## 2. Preconditions
Retention job due; legal_hold false; System Admin approves; worker receives retention.worker permission; destructive deletion explicitly enabled in isolated staging only.

## 3. Successful outcome / postconditions
Approve status and audit; worker trashes Drive files, deletes related Sheets rows, keeps required change/lookup audit; job DELETION_COMPLETED.

## 4. Failure and alternate paths
Not due, hold, missing approver, disabled worker flag, storage fault produces retry-required; partial deletion reconciliation and idempotent retries still incomplete.

## 5. Persistence / external side effects
- `vc_retention_jobs`
- `vc_vehicle_photos`
- `vc_vehicle_contacts`
- `vc_qr_tokens`
- `vc_vehicles`
- `vc_change_audit`
- `vc_lookup_audit`

## 6. Acceptance trace
- Test case IDs: `ACTOR-06`, `EDGE-07`, `GAS-FLOW.WORKER_DELETE`.
- Executable evidence references: `backend/gas/tests/acceptance-failures.test.mjs`.
- Passing tests for source paths do not automatically prove all cases of this UC. Real GAS Editor and authenticated staging HTTP remain separate release gates.
- FE status: **NOT_WIRED**; design must align Vue 3, Pinia, Router and API adapter per Master Web Blueprint.

## 7. Development notes / explicit gaps
Deletion first trashes Drive then mutates multiple Sheets tables; abrupt interruption and repeated file trash calls can leave DELETION_FAILED and need verified reconciliation.

## 8. Approval conditions
Traceability check PASS; frontend API adapter request/response and errors match backend v1; auth/default-deny and negative tests demonstrated; staging execution evidence linked to SHA; remaining discrepancies dispositioned by ADR.


**Evidence classification:** Diagram is a source-reviewed implementation model, NOT proof of successful real GAS HTTP integration or production release. Runtime discrepancies must be recorded in decision log and revised via PR.
