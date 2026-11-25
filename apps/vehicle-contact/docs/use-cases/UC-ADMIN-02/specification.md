# UC-ADMIN-02 — Police hierarchy and external organization master
**Status:** LIVE_DEV_API_SCOPE_VERIFIED; BROWSER_UAT_AND_PRODUCTION_GATES_OPEN
**Actor:** SYSTEM_ADMIN (write) / STAFF or REGISTRATION_ADMIN (read)

## 1. Authority and scope
- Business baseline: [Approved requirements](../../APPROVED_REQUIREMENTS_BASELINE_R01_R26.md).
- API operations: `organizations.list`, `organizations.create`, `organizations.update`, `organizations.disable`, `organizations.enable` (API v1 JSON envelope, GAS POST except public health GET).
- Implementation: `backend/gas/src/application/use-cases/AdministrationOperations.js`; server permission source `backend/gas/src/api/controllers/OperationController.js`.
- Diagram source: [sequence.mmd](sequence.mmd) (Mermaid, reviewed alongside spec).

## 2. Preconditions
Authenticated reader has organizations.read; writes require organizations.manage; POLICE parent may be hierarchical; EXTERNAL remains flat.

## 3. Successful outcome / postconditions
List active/disabled organizations; create POLICE or EXTERNAL records; update allowed fields; disable rather than silently delete.

## 4. Failure and alternate paths
Invalid org_type, missing parent, self-parent, any multi-level ancestor cycle and unauthorized writes are rejected with `INVALID_ORG_PARENT` / `PARENT_NOT_FOUND` / `FORBIDDEN` as applicable.

## 5. Persistence / external side effects
- `vc_organizations`
- `vc_change_audit`

## 6. Acceptance trace
- Test case IDs: `ACTOR-01`, `MATRIX-02`.
- Executable evidence references: `backend/gas/tests/actor-usecase-acceptance.test.mjs`.
- Aggregate PR #110 / bf3553d live DEV evidence covers 56/56 API operations (97/97 checks); it does not prove every business branch, external provider/device behavior, destructive retention execution, browser/business UAT or production approval.
- FE status: **WIRED_IN_SOURCE / LIVE_API_VERIFIED / BROWSER_UAT_OPEN** for the System Admin organization screens; this is not business acceptance.

## 7. Development notes / explicit gaps
**B1 delivered:** update traverses the proposed parent's complete ancestor chain with a visited set, rejects direct and indirect cycles, and has negative tests. Live DEV API scope is verified; production security and business acceptance remain separate open gates.

## 8. Approval conditions
Traceability check PASS; frontend API adapter request/response and errors match backend v1; auth/default-deny and negative tests demonstrated; staging execution evidence linked to SHA; remaining discrepancies dispositioned by ADR.


**Evidence classification:** Source-reviewed implementation model plus scoped live DEV API evidence (GAS V48, backend 0.9.1). It is NOT browser/business UAT, destructive retention execution, real OIDC-provider or physical-QR acceptance, PDPA/security signoff, or production release approval. Runtime discrepancies require decision-log disposition and PR review.

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
  API->>Orgs: Validate type, parent and complete ancestor chain (B1)
  alt Valid POLICE hierarchy or flat EXTERNAL
    Orgs->>DB: Insert or update vc_organizations
    Orgs->>DB: Append change audit
    API-->>FE: Organization ID / success
  else Invalid type, missing parent or direct/indirect cycle
    Orgs-->>API: INVALID_ORG_TYPE / PARENT_NOT_FOUND / INVALID_ORG_PARENT
    API-->>FE: Safe validation error / FORBIDDEN
  end
  Note over Orgs,DB: B1 ancestor-cycle guard delivered with negative tests; production approval remains open
```
