# UC-RET-02 — Retention approval, worker deletion and job status
**Status:** LIVE_DEV_API_SCOPE_VERIFIED; BROWSER_UAT_AND_PRODUCTION_GATES_OPEN
**Actor:** SYSTEM_ADMIN (approve) / RETENTION_WORKER (execute)

## 1. Authority and scope
- Business baseline: [Approved requirements](../../APPROVED_REQUIREMENTS_BASELINE_R01_R26.md).
- API operations: `retention.approve`, `retention.execute`, `retention.jobStatus`, `retention.listExecutable` (API v1 JSON envelope, GAS POST except public health GET).
- Implementation: `backend/gas/src/application/use-cases/MediaRetentionOperations.js`; server permission source `backend/gas/src/api/controllers/OperationController.js`.
- Diagram source: [sequence.mmd](sequence.mmd) (Mermaid, reviewed alongside spec).

## 2. Preconditions
Retention job due; legal_hold false; System Admin approves; worker receives retention.worker permission; destructive deletion explicitly enabled in isolated staging only.

## 3. Successful outcome / postconditions
Approve status and audit; worker trashes Drive files, deletes related Sheets rows, keeps required change/lookup audit; job DELETION_COMPLETED.

## 4. Failure and alternate paths
Not due, legal hold, missing approver or disabled worker flag denies execution. B2 provides job-tracked retry evidence: each attempt increments `attempts`, storage/write failure records `DELETION_FAILED` plus `last_error`, and `retention.jobStatus` / `retention.listExecutable` expose the retryable state. This does not permit or prove destructive execution.

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
- Aggregate PR #110 / bf3553d live DEV evidence covers 56/56 API operations (97/97 checks); it does not prove every business branch, external provider/device behavior, destructive retention execution, browser/business UAT or production approval.
- FE status: **NOT_WIRED — C5 BLOCKED ON D5+B3**; destructive execution remains disabled/gated regardless of future console wiring.

## 7. Development notes / explicit gaps
Deletion first trashes Drive then mutates multiple Sheets tables; B2 job status/attempt/`last_error` retry evidence is test-covered, but actual destructive Drive/Sheets execution remains **disabled/gated** and is not accepted by the 56-operation live API inventory run. `retention.listExecutable` gives RETENTION_WORKER a least-privilege queue (`retention.worker`, not `retention.read`): one bounded `vc_retention_jobs` snapshot filtered to due, non-hold, approved `DELETION_APPROVED` / `DELETION_FAILED` rows, with no cross-sheet join. C5 execution console remains blocked on D5+B3; PDPA/security/release approval remains open.

## 8. Approval conditions
Traceability check PASS; frontend API adapter request/response and errors match backend v1; auth/default-deny and negative tests demonstrated; staging execution evidence linked to SHA; remaining discrepancies dispositioned by ADR.


**Evidence classification:** Source-reviewed implementation model plus scoped live DEV API evidence (GAS V48, backend 0.9.1). It is NOT browser/business UAT, destructive retention execution, real OIDC-provider or physical-QR acceptance, PDPA/security signoff, or production release approval. Runtime discrepancies require decision-log disposition and PR review.

## 9. GitHub Mermaid Preview

```mermaid
sequenceDiagram
  autonumber
  actor Sys as SYSTEM_ADMIN
  actor Worker as RETENTION_WORKER
  participant API as GAS API / RBAC
  participant Retention as MediaRetentionOperations
  participant DB as Sheets
  participant Drive as Google Drive
  Sys->>API: retention.approve(jobId)
  API->>API: Require retention.delete.approve
  Retention->>DB: Lock, check due and legal_hold false
  alt Authorized approval
    Retention->>DB: Set DELETION_APPROVED and append audit
    API-->>Sys: approved true
  else Hold, not due or invalid state
    API-->>Sys: RETENTION_NOT_APPROVABLE
  end
  Worker->>API: retention.listExecutable(session,page,pageSize)
  API->>API: Require retention.worker
  Retention->>DB: Bounded approved/failed, due, non-hold job snapshot
  API-->>Worker: Job IDs, status, attempts and lastError
  Worker->>API: retention.execute(jobId)
  API->>API: Require retention.worker and destructive feature flag
  alt Destructive execution disabled
    API-->>Worker: RETENTION_EXECUTION_DISABLED; no Drive/Sheets deletion
  else Explicitly enabled isolated staging execution
    Retention->>DB: Mark DELETION_IN_PROGRESS and increment attempts
    alt Deletion completes
      Retention->>Drive: Trash all linked photo files
      Retention->>DB: Delete dependent rows; preserve required audit
      Retention->>DB: Mark DELETION_COMPLETED
      API-->>Worker: DELETION_COMPLETED
    else Storage or write failure
      Retention->>DB: Mark DELETION_FAILED and persist last_error
      API-->>Worker: DELETION_RETRY_REQUIRED
    end
  end
  Worker->>API: retention.jobStatus(jobId)
  API-->>Worker: Current status, attempts and lastError for job-tracked retry
  Note over Retention,Drive: B2 retry evidence delivered; destructive execution remains disabled/gated and unaccepted
```
