# UC-VEH-02 — Direct authorized vehicle or primary contact correction
**Status:** LIVE_DEV_API_SCOPE_VERIFIED; BROWSER_UAT_AND_PRODUCTION_GATES_OPEN
**Actor:** REGISTRATION_ADMIN

## 1. Authority and scope
- Business baseline: [Approved requirements](../../APPROVED_REQUIREMENTS_BASELINE_R01_R26.md).
- API operations: `vehicles.update`, `contacts.update` (API v1 JSON envelope, GAS POST except public health GET).
- Implementation: `backend/gas/src/application/use-cases/VehicleOperations.js`; server permission source `backend/gas/src/api/controllers/OperationController.js`.
- Diagram source: [sequence.mmd](sequence.mmd) (Mermaid, reviewed alongside spec).

## 2. Preconditions
Vehicle ACTIVE, Registration Admin has vehicle.update, expectedVersion equals persisted version for vehicles.update.

## 3. Successful outcome / postconditions
Apply permitted vehicle fields or primary contact changes; version increment and change audit; ownership can be assigned only to ACTIVE user.

## 4. Failure and alternate paths
Stale version, duplicate plate+province, nonexistent owner, missing single primary contact or missing permission are rejected.

## 5. Persistence / external side effects
- `vc_vehicles`
- `vc_users`
- `vc_vehicle_contacts`
- `vc_change_audit`

## 6. Acceptance trace
- Test case IDs: `ACTOR-04`, `GAS-FLOW.REGISTER_OWNER`.
- Executable evidence references: `backend/gas/tests/actor-usecase-acceptance.test.mjs`.
- Aggregate PR #110 / bf3553d live DEV evidence covers 56/56 API operations (97/97 checks); it does not prove every business branch, external provider/device behavior, destructive retention execution, browser/business UAT or production approval.
- FE status: **WIRED_IN_SOURCE / LIVE_API_VERIFIED / BROWSER_UAT_OPEN**; C3 vehicle maintenance and version-conflict UX are delivered.

## 7. Development notes / explicit gaps
Vehicle update uses ScriptLock and optimistic version; contact update checks one primary active contact. Contact update is permission vehicle.update in deployed code.

## 8. Approval conditions
Traceability check PASS; frontend API adapter request/response and errors match backend v1; auth/default-deny and negative tests demonstrated; staging execution evidence linked to SHA; remaining discrepancies dispositioned by ADR.


**Evidence classification:** Source-reviewed implementation model plus scoped live DEV API evidence (GAS V48, backend 0.9.1). It is NOT browser/business UAT, destructive retention execution, real OIDC-provider or physical-QR acceptance, PDPA/security signoff, or production release approval. Runtime discrepancies require decision-log disposition and PR review.

## 9. GitHub Mermaid Preview

```mermaid
sequenceDiagram
  autonumber
  actor Admin as REGISTRATION_ADMIN
  participant FE as Vue Vehicle Edit
  participant API as GAS API / RBAC
  participant Vehicle as VehicleOperations
  participant DB as Sheets
  Admin->>FE: Edit vehicle details
  FE->>API: vehicles.update(vehicleId,expectedVersion,delta)
  API->>API: Require vehicle.update
  Vehicle->>DB: Acquire ScriptLock and reload ACTIVE vehicle
  alt expectedVersion matches; no duplicate plate
    Vehicle->>DB: Optionally validate ACTIVE owner
    Vehicle->>DB: Increment version, update row and append audit
    API-->>FE: New vehicle version
  else Stale version / duplicate / missing owner
    API-->>FE: VERSION_CONFLICT / DUPLICATE_VEHICLE / OWNER_NOT_FOUND
  end
  Admin->>FE: Edit primary contact
  FE->>API: contacts.update(vehicleId,contactName/contactPhone)
  API->>API: Require vehicle.update
  Vehicle->>DB: Require exactly one ACTIVE primary contact
  alt Valid contact
    Vehicle->>DB: Update contact and append audit
    API-->>FE: updated true
  else Missing primary contact
    API-->>FE: PRIMARY_CONTACT_INVARIANT
  end
```
