# UC-ADMIN-02 — Police hierarchy and external organization master
**Status:** DESIGN_BASELINED_FROM_SOURCE; LIVE_GAS_ACCEPTANCE_PENDING
**Actor:** SYSTEM_ADMIN (write) / STAFF or REGISTRATION_ADMIN (read)

## 1. Authority and scope
- Business baseline: [Approved requirements](../../APPROVED_REQUIREMENTS_BASELINE_R01_R26.md).
- API operations: `organizations.list`, `organizations.create`, `organizations.update`, `organizations.disable` (API v1 JSON envelope, GAS POST except public health GET).
- Implementation: `backend/gas/src/application/use-cases/AdministrationOperations.js`; server permission source `backend/gas/src/api/controllers/OperationController.js`.
- Diagram source: [sequence.mmd](sequence.mmd) (Mermaid, reviewed alongside spec).

## 2. Preconditions
Authenticated reader has organizations.read; writes require organizations.manage; POLICE parent may be hierarchical; EXTERNAL remains flat.

## 3. Successful outcome / postconditions
List active/disabled organizations; create POLICE or EXTERNAL records; update allowed fields; disable rather than silently delete.

## 4. Failure and alternate paths
Invalid org_type, missing parent, self-parent and unauthorized writes are rejected.

## 5. Persistence / external side effects
- `vc_organizations`
- `vc_change_audit`

## 6. Acceptance trace
- Test case IDs: `ACTOR-01`, `MATRIX-02`.
- Executable evidence references: `backend/gas/tests/actor-usecase-acceptance.test.mjs`.
- Passing tests for source paths do not automatically prove all cases of this UC. Real GAS Editor and authenticated staging HTTP remain separate release gates.
- FE status: **NOT_WIRED**; design must align Vue 3, Pinia, Router and API adapter per Master Web Blueprint.

## 7. Development notes / explicit gaps
Source checks a direct self-parent but not arbitrary multi-level cycles; cyclic hierarchy prevention is a design-review gap.

## 8. Approval conditions
Traceability check PASS; frontend API adapter request/response and errors match backend v1; auth/default-deny and negative tests demonstrated; staging execution evidence linked to SHA; remaining discrepancies dispositioned by ADR.


**Evidence classification:** Diagram is a source-reviewed implementation model, NOT proof of successful real GAS HTTP integration or production release. Runtime discrepancies must be recorded in decision log and revised via PR.

## 9. GitHub Mermaid Preview

```mermaid
sequenceDiagram
  autonumber
  actor Admin as SYSTEM_ADMIN
  participant FE as Vue Org Admin
  participant API as GAS API / RBAC
  participant Orgs as AdministrationOperations
  participant DB as Sheets
  FE->>API: organizations.list
  API->>API: Require organizations.read
  API->>DB: Read vc_organizations
  API-->>FE: Organization rows
  Admin->>FE: Create, update or disable organization
  FE->>API: organizations.create / update / disable
  API->>API: Require organizations.manage
  alt Valid POLICE hierarchy or flat EXTERNAL
    API->>Orgs: Validate type and direct parent; full ancestor-cycle guard missing
    Orgs->>DB: Insert or update vc_organizations
    Orgs->>DB: Append change audit
    API-->>FE: Organization ID / success
  else Invalid type, parent or permission
    API-->>FE: INVALID_ORG_TYPE / PARENT_NOT_FOUND / FORBIDDEN
  end
  Note over Orgs,DB: Arbitrary hierarchy cycles are not currently detected: design gap
```
