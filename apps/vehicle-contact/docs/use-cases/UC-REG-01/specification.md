# UC-REG-01 — Vehicle application submission with five photos
**Status:** DESIGN_BASELINED_FROM_SOURCE; LIVE_GAS_ACCEPTANCE_PENDING
**Actor:** Registrant or assisted REGISTRATION_ADMIN with valid campaign

## 1. Authority and scope
- Business baseline: [Approved requirements](../../APPROVED_REQUIREMENTS_BASELINE_R01_R26.md).
- API operations: `references.registration`, `registrations.submit` (API v1 JSON envelope, GAS POST except public health GET).
- Implementation: `backend/gas/src/application/use-cases/ReferenceOperations.js`, `backend/gas/src/application/use-cases/VehicleOperations.js`; server permission source `backend/gas/src/api/controllers/OperationController.js`.
- Diagram source: [sequence.mmd](sequence.mmd) (Mermaid, reviewed alongside spec).

## 2. Preconditions
Campaign active with available quota; organization active; all mandatory vehicle/contact fields present; exactly five staged photo IDs.
Assisted intake may load canonical reference data with a verified session holding `vehicle.registration.approve`; anonymous legacy submission does not receive this protected catalog.

## 3. Successful outcome / postconditions
Store PENDING_APPROVAL registration, claim media, increment quota once, persist idempotency response and operation journal.

## 4. Failure and alternate paths
Duplicate plate+province, invalid campaign, staged photo mismatch, quota exhaustion or idempotency conflict denied; caught write errors compensated but abrupt timeout requires manual recovery.

## 5. Persistence / external side effects
- `vc_campaigns`
- `vc_organizations`
- `vc_reference_values`
- `vc_photo_staging`
- `vc_registration_requests`
- `vc_idempotency`
- `vc_operation_journal`
- `vc_vehicles`

## 6. Acceptance trace
- Test case IDs: `ACTOR-03`, `EDGE-01`, `EDGE-03`, `EDGE-04`, `EDGE-09`, `GAS-FLOW.REGISTRATION_SUBMIT`, `REF-CATALOG-01`.
- Executable evidence references: `backend/gas/tests/actor-usecase-acceptance.test.mjs`, `backend/gas/tests/reference-data.test.mjs`.
- Passing tests for source paths do not automatically prove all cases of this UC. Real GAS Editor and authenticated staging HTTP remain separate release gates.
- FE status: **WIRED_IN_SOURCE / LIVE_ACCEPTANCE_PENDING**; assisted intake, campaign validation, five responsive photo inputs and idempotent submit are recorded in [FE-REGISTRATION-INTAKE-01 evidence](../../FRONTEND_FE_REGISTRATION_INTAKE_01_EVIDENCE_20261120.md).

## 7. Development notes / explicit gaps
Exactly one primary contact is created only during approval. Sheets compensation is not atomic database rollback; journal PREPARED after crash is a release blocker.

## 8. Approval conditions
Traceability check PASS; frontend API adapter request/response and errors match backend v1; auth/default-deny and negative tests demonstrated; staging execution evidence linked to SHA; remaining discrepancies dispositioned by ADR.


**Evidence classification:** Diagram is a source-reviewed implementation model, NOT proof of successful real GAS HTTP integration or production release. Runtime discrepancies must be recorded in decision log and revised via PR.

## 9. GitHub Mermaid Preview

```mermaid
sequenceDiagram
  autonumber
  actor Registrant
  participant FE as Vue Registration Form
  participant API as GAS API
  participant Ref as ReferenceOperations
  participant Reg as VehicleOperations
  participant DB as Google Sheets
  opt Assisted intake with verified admin session
    FE->>API: references.registration
    API->>Ref: Require vehicle.registration.approve
    Ref->>DB: Read active canonical values and organizations
    Ref-->>FE: mode, version, lists, policies
  end
  Registrant->>FE: Submit vehicle, contact, five photoIds, idempotencyKey
  FE->>API: registrations.submit(payload,campaignToken)
  API->>Reg: Validate DTO and business fields
  Reg->>DB: Acquire ScriptLock
  Reg->>DB: Check campaign, digest and idempotency
  alt Completed identical submission
    DB-->>Reg: Stored result
    Reg-->>FE: Same requestId and vehicleId
  else New valid submission
    Reg->>DB: Check quota, org, plate+province and five STAGED slots
    Reg->>DB: Insert vc_operation_journal PREPARED
    Reg->>DB: Insert PENDING_APPROVAL registration
    Reg->>DB: Mark five photos CLAIMED and increment quota
    Reg->>DB: Insert completed idempotency response
    Reg->>DB: Mark journal APPLIED
    Reg-->>FE: requestId, vehicleId, PENDING_APPROVAL
  else Validation conflict
    Reg-->>FE: CAMPAIGN_INVALID / DUPLICATE_VEHICLE / conflict
  end
  opt Caught write exception after PREPARED
    Reg->>DB: Best-effort reverse compensation under lock
    Reg->>DB: Journal ROLLED_BACK or RECOVERY_REQUIRED
    Reg-->>FE: Safe error
  end
  Reg->>DB: Release lock and flush
  Note over Reg,DB: Abrupt GAS timeout may leave PREPARED journal; manual reconciliation still required
```
