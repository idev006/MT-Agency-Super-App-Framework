# UC-OWNER-01 — Owner proposes a change; Registration Admin approves
**Status:** LIVE_DEV_API_SCOPE_VERIFIED; BROWSER_UAT_AND_PRODUCTION_GATES_OPEN
**Actor:** OWNER (submit) / REGISTRATION_ADMIN (review)

## 1. Authority and scope
- Business baseline: [Approved requirements](../../APPROVED_REQUIREMENTS_BASELINE_R01_R26.md).
- API operations: `changes.submit`, `changes.listPending`, `changes.review`, `vehicles.listMine`, `changes.listMine` (API v1 JSON envelope, GAS POST except public health GET).
- Implementation: `backend/gas/src/application/use-cases/VehicleOperations.js`; server permission source `backend/gas/src/api/controllers/OperationController.js`.
- Diagram source: [sequence.mmd](sequence.mmd) (Mermaid, reviewed alongside spec).

## 2. Preconditions
Owner account authenticated and linked to an ACTIVE vehicle via `owner_user_id`, or has explicit `vehicle.update`; Admin has `vehicle.change.approve`. `vehicles.listMine` and `changes.listMine` additionally require `vehicle.own.read` and derive their owner/submitter scope only from the verified session.

## 3. Successful outcome / postconditions
OWNER discovers own ACTIVE vehicles via `vehicles.listMine`, submits a correction, and tracks it via `changes.listMine`; both use bounded, session-filtered snapshots and minimal DTOs under `vehicle.own.read`. Store `proposed_delta` PENDING with audit. The approver's `changes.listPending` DTO includes `proposedDelta`, and the C1 FE renders the delta diff before APPROVE/REJECT. APPROVE patches authorized vehicle/contact fields with audit; REJECT leaves current vehicle data unchanged.

## 4. Failure and alternate paths
Unverified ownership, empty change, invalid contact phone, unauthorized approver or already-reviewed request denied.

## 5. Persistence / external side effects
- `vc_change_requests`
- `vc_vehicles`
- `vc_vehicle_contacts`
- `vc_change_audit`

## 6. Acceptance trace
- Test case IDs: `ACTOR-04`, `GAS-FLOW.OWNER_PROPOSE`, `GAS-FLOW.REG_APPROVE_CHANGE`.
- Executable evidence references: `backend/gas/tests/actor-usecase-acceptance.test.mjs`.
- Aggregate PR #110 / bf3553d live DEV evidence covers 56/56 API operations (97/97 checks); it does not prove every business branch, external provider/device behavior, destructive retention execution, browser/business UAT or production approval.
- FE status: **WIRED_IN_SOURCE / LIVE_API_VERIFIED / BROWSER_UAT_OPEN**; C1 approver queue/delta review and C4 `my-vehicles` submit/track flows are wired.

## 7. Development notes / explicit gaps
Anonymous owner verification/claim is not implemented; campaign token alone does not grant owner edit. Ownership and request ownership are never taken from client payloads. C1/C4 wiring and live API scope do not prove browser/business UAT or production acceptance.

## 8. Approval conditions
Traceability check PASS; frontend API adapter request/response and errors match backend v1; auth/default-deny and negative tests demonstrated; staging execution evidence linked to SHA; remaining discrepancies dispositioned by ADR.


**Evidence classification:** Source-reviewed implementation model plus scoped live DEV API evidence (GAS V48, backend 0.9.1). It is NOT browser/business UAT, destructive retention execution, real OIDC-provider or physical-QR acceptance, PDPA/security signoff, or production release approval. Runtime discrepancies require decision-log disposition and PR review.

## 9. GitHub Mermaid Preview

```mermaid
sequenceDiagram
  autonumber
  actor Owner
  actor Admin as REGISTRATION_ADMIN
  participant FE as Vue Change Request
  participant API as GAS API
  participant Changes as VehicleOperations
  participant DB as Sheets
  Owner->>FE: Open my vehicles and request history
  FE->>API: vehicles.listMine / changes.listMine(session,page,pageSize)
  API->>API: Require vehicle.own.read; derive owner/submitter from session
  Changes->>DB: Bounded snapshots filtered by owner_user_id / submitted_by
  API-->>FE: Minimal own ACTIVE vehicles and own change requests
  Owner->>FE: Propose vehicle/contact correction
  FE->>API: changes.submit(session,vehicleId,delta)
  API->>Changes: Check ACTIVE vehicle and owner_user_id
  alt Ownership verified and nonempty delta
    Changes->>DB: Insert PENDING vc_change_requests and audit
    API-->>FE: requestId PENDING
  else Owner not verified or invalid
    API-->>FE: OWNERSHIP_NOT_VERIFIED / validation error
  end
  Admin->>FE: Open change-review queue
  FE->>API: changes.listPending(session)
  API->>API: Require vehicle.change.approve
  API->>DB: Read pending requests
  API-->>FE: Paginated queue including proposedDelta
  Admin->>FE: Inspect proposed delta diff then approve or reject
  FE->>API: changes.review(requestId,APPROVE/REJECT)
  Changes->>DB: Lock and reread request
  alt APPROVE
    Changes->>DB: Update vehicle and/or primary contact, increment version
  else REJECT
    Changes->>DB: Keep existing vehicle/contact values
  end
  Changes->>DB: Mark request reviewed and append audit
  API-->>Admin: Reviewed status
```
