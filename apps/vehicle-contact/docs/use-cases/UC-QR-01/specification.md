# UC-QR-01 — Authenticated QR scan and resolve
**Status:** DESIGN_BASELINED_FROM_SOURCE; LIVE_GAS_ACCEPTANCE_PENDING
**Actor:** STAFF / REGISTRATION_ADMIN

## 1. Authority and scope
- Business baseline: [Approved requirements](../../APPROVED_REQUIREMENTS_BASELINE_R01_R26.md).
- API operations: `qr.resolve` (API v1 JSON envelope, GAS POST except public health GET).
- Implementation: `backend/gas/src/application/use-cases/VehicleOperations.js`; server permission source `backend/gas/src/api/controllers/OperationController.js`.
- Diagram source: [sequence.mmd](sequence.mmd) (Mermaid, reviewed alongside spec).

## 2. Preconditions
Mobile scanner successfully decodes an opaque 64-character token; user has valid session and vehicle.lookup permission.

## 3. Successful outcome / postconditions
Hash token, find ACTIVE QR and ACTIVE vehicle, append lookup audit, return only fields authorized by caller.

## 4. Failure and alternate paths
Malformed, unknown, revoked or cancelled QR fails without releasing private data; revoked lookup may return null.

## 5. Persistence / external side effects
- `vc_qr_tokens`
- `vc_vehicles`
- `vc_lookup_audit`
- `vc_vehicle_contacts`
- `vc_vehicle_photos`

## 6. Acceptance trace
- Test case IDs: `ACTOR-03`, `EDGE-06`, `GAS-AUTH-QR.RESOLVE`.
- Executable evidence references: `backend/gas/tests/actor-usecase-acceptance.test.mjs`.
- Passing tests for source paths do not automatically prove all cases of this UC. Real GAS Editor and authenticated staging HTTP remain separate release gates.
- FE status: **MANUAL_RESOLVE_WIRED_IN_SOURCE / CAMERA_AND_LIVE_ACCEPTANCE_PENDING**; the authenticated route, strict Worker DTO, fail-closed result mapping and responsive evidence are recorded in [FE-QR-RESOLVE-01](../../FRONTEND_FE_QR_RESOLVE_01_EVIDENCE_20261120.md).

## 7. Development notes / explicit gaps
QR token must contain no PII. Camera permission, real mobile scanning and QR deep-link route are future frontend/device acceptance.

## 8. Approval conditions
Traceability check PASS; frontend API adapter request/response and errors match backend v1; auth/default-deny and negative tests demonstrated; staging execution evidence linked to SHA; remaining discrepancies dispositioned by ADR.


**Evidence classification:** Diagram is a source-reviewed implementation model, NOT proof of successful real GAS HTTP integration or production release. Runtime discrepancies must be recorded in decision log and revised via PR.

## 9. GitHub Mermaid Preview

```mermaid
sequenceDiagram
  autonumber
  actor Staff
  participant FE as Vue Scanner
  participant API as GAS API / Session RBAC
  participant QR as VehicleOperations
  participant DB as Sheets
  Staff->>FE: Camera scan QR
  FE->>FE: Extract opaque token; no contact in QR payload
  FE->>API: qr.resolve(sessionToken,token)
  API->>API: Require vehicle.lookup and valid session
  QR->>QR: Check token syntax and hash digest
  QR->>DB: Read vc_qr_tokens and linked vehicle
  alt ACTIVE token and ACTIVE vehicle
    QR->>DB: Record lookup audit
    QR->>DB: Read permitted contacts/photos
    API-->>FE: Authorized vehicle DTO
  else Unknown, revoked or inactive vehicle
    API-->>FE: Null or INVALID_QR
    FE-->>Staff: Show safe no-match / manual fallback
  end
```
