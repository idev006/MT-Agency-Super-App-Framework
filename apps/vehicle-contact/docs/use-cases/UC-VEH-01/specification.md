# UC-VEH-01 — Authorized vehicle registry, plate search, details and disclosure
**Status:** LIVE_DEV_API_SCOPE_VERIFIED; BROWSER_UAT_AND_PRODUCTION_GATES_OPEN
**Actor:** STAFF / REGISTRATION_ADMIN with read permissions; SYSTEM_ADMIN / REGISTRATION_ADMIN with `vehicle.list` for the admin registry

## 1. Authority and scope
- Business baseline: [Approved requirements](../../APPROVED_REQUIREMENTS_BASELINE_R01_R26.md).
- API operations: `vehicles.lookup`, `vehicles.list`, `vehicles.detail`, `vehicles.history`, `contacts.read`, `photos.list` (API v1 JSON envelope, GAS POST except public health GET).
- Implementation: `backend/gas/src/application/use-cases/VehicleOperations.js`, `backend/gas/src/application/use-cases/MediaRetentionOperations.js`; server permission source `backend/gas/src/api/controllers/OperationController.js`.
- Diagram source: [sequence.mmd](sequence.mmd) (Mermaid, reviewed alongside spec).

## 2. Preconditions
Valid server session; permissions `vehicle.lookup`, `vehicle.contact.read`, `vehicle.photos.read` and optionally `vehicle.history.read`; registry access requires `vehicle.list`; returned vehicles are ACTIVE.

## 3. Successful outcome / postconditions
Search normalized Thai plate+province across organizations; show permitted contact and 5 photo references with lookup audit; allow user-initiated phone dial. C6 `vehicles.list` provides SYSTEM_ADMIN / REGISTRATION_ADMIN an ACTIVE-only registry with minimal non-PII DTO (`vehicleId`, `plate`, `province`, `vehicleType`, `brand`, `model`, `color`, `status`, `version`, `createdAt`), excluding owner id and contacts. It uses one bounded `vc_vehicles` snapshot, pagination and no cross-sheet join.

## 4. Failure and alternate paths
Unknown/inactive vehicle, missing permission, revoked session or ambiguous active duplicate fail safely. Registry DTO validation rejects client-supplied `status` / `ownerUserId` spoof filters; server code alone determines ACTIVE scope. No public contact directory is exposed.

## 5. Persistence / external side effects
- `vc_vehicles`
- `vc_vehicle_contacts`
- `vc_vehicle_photos`
- `vc_lookup_audit`
- `vc_change_audit`

## 6. Acceptance trace
- Test case IDs: `ACTOR-03`, `ACTOR-04`, `GAS-AUTH-LOOKUP.STAFF`, `GAS-AUTH-CONTACT.READ`, `REG-01`…`REG-05`; aggregate live inventory `56/56`.
- Executable evidence references: `backend/gas/tests/actor-usecase-acceptance.test.mjs`; PR #110 live API evidence baseline `bf3553d`.
- Aggregate PR #110 / bf3553d live DEV evidence covers 56/56 API operations (97/97 checks); it does not prove every business branch, external provider/device behavior, destructive retention execution, browser/business UAT or production approval.
- FE status: **WIRED_IN_SOURCE / LIVE_API_VERIFIED / BROWSER_UAT_OPEN**; C2 search/detail and C6 permission-gated registry are wired, with drill-down conditional on `vehicle.lookup`.

## 7. Development notes / explicit gaps
Approved business baseline permits immediate contact/5-photo visibility to authorized staff, no reason prompt. Images may be link-accessible outside the app because of the shared parent folder risk. Live API verification does not constitute browser/business UAT or Drive privacy acceptance.

## 8. Approval conditions
Traceability check PASS; frontend API adapter request/response and errors match backend v1; auth/default-deny and negative tests demonstrated; staging execution evidence linked to SHA; remaining discrepancies dispositioned by ADR.


**Evidence classification:** Source-reviewed implementation model plus scoped live DEV API evidence (GAS V48, backend 0.9.1). It is NOT browser/business UAT, destructive retention execution, real OIDC-provider or physical-QR acceptance, PDPA/security signoff, or production release approval. Runtime discrepancies require decision-log disposition and PR review.

## 9. GitHub Mermaid Preview

```mermaid
sequenceDiagram
  autonumber
  actor Staff
  actor Admin as SYSTEM_ADMIN / REGISTRATION_ADMIN
  participant FE as Vue Search + Registry
  participant API as GAS API / Session RBAC
  participant Search as VehicleOperations
  participant DB as Sheets
  opt C6 approved-vehicle admin registry
    Admin->>FE: Browse ACTIVE vehicle registry
    FE->>API: vehicles.list(session,page,pageSize)
    API->>API: Require vehicle.list; reject status/ownerUserId spoof filters
    Search->>DB: Single bounded vc_vehicles snapshot; ACTIVE only; no join
    API-->>FE: Paginated minimal non-PII DTO; no contacts or owner id
  end
  Staff->>FE: Enter plate and province
  FE->>API: vehicles.lookup(session,plate,province)
  API->>API: Validate session + vehicle.lookup
  Search->>DB: Find unique ACTIVE normalized vehicle
  alt Vehicle found
    Search->>DB: Append lookup audit
    opt Contact and photos permissions exist
      Search->>DB: Read active contact and five photo metadata
    end
    API-->>FE: Vehicle DTO with permitted fields
    FE->>API: vehicles.detail / contacts.read / photos.list
    API->>DB: Recheck active vehicle, access and audit
    API-->>FE: Authorized details
    Staff->>FE: Tap phone number to call
    FE-->>Staff: Launch dialer via user gesture, not automatic call
  else Not found / unauthorized / ambiguous
    API-->>FE: Safe null / forbidden / conflict
    FE-->>Staff: Manual fallback SOP
  end
  opt History permission
    FE->>API: vehicles.history
    API-->>FE: Limited change audit
  end
```
