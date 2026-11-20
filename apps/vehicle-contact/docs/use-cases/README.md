# P6 Vehicle Contact — Use Case and Sequence Diagram SSOT

**Document classification:** Source-derived design, not production approval.  
**Authority:** [Approved Business Baseline](../APPROVED_REQUIREMENTS_BASELINE_R01_R26.md), [v1 inventory](../../contracts/api-inventory.v1.json), [GAS backend](../../backend/gas/src/api/controllers/OperationController.js), and [Master Web Blueprint](../../../../blueprint/MASTER_WEB_APP_BLUEPRINT.md).  
**Architecture:** Vue 3 → typed API adapter → GAS /exec JSON envelope → Router + session/permission enforcement → application use cases → Sheets / Drive adapters. The public health route is special. Client-side roles are never authoritative.

## Coverage
20 business Use Case specifications + 20 versioned Mermaid `.mmd` sequence diagrams cover **51/51 declared v1 API operations exactly once as primary owner**. Sharing an operation across UI screens is allowed via reference to its owning UC; do not fork competing diagrams.

| Use Case | Title | Owned operations | Source diagram | Evidence |
|---|---|---:|---|---|
| [UC-AUTH-01](UC-AUTH-01/specification.md) | Local login, session check and logout | 3 | [sequence](./UC-AUTH-01/sequence.mmd) | Pending real GAS |
| [UC-AUTH-02](UC-AUTH-02/specification.md) | First-login password change and administrator reset | 2 | [sequence](./UC-AUTH-02/sequence.mmd) | Pending real GAS |
| [UC-AUTH-03](UC-AUTH-03/specification.md) | Google identity linking and pre-provisioned Google sign-in | 2 | [sequence](./UC-AUTH-03/sequence.mmd) | Pending real GAS |
| [UC-ADMIN-01](UC-ADMIN-01/specification.md) | User provisioning, maintenance, suspension and role assignment | 5 | [sequence](./UC-ADMIN-01/sequence.mmd) | Pending real GAS |
| [UC-ADMIN-02](UC-ADMIN-02/specification.md) | Police hierarchy and external organization master | 4 | [sequence](./UC-ADMIN-02/sequence.mmd) | Pending real GAS |
| [UC-ADMIN-03](UC-ADMIN-03/specification.md) | System settings and public health check | 3 | [sequence](./UC-ADMIN-03/sequence.mmd) | Pending real GAS |
| [UC-CAMP-01](UC-CAMP-01/specification.md) | Create, list and revoke registration campaigns | 3 | [sequence](./UC-CAMP-01/sequence.mmd) | Pending real GAS |
| [UC-CAMP-02](UC-CAMP-02/specification.md) | Validate a public registration campaign token | 1 | [sequence](./UC-CAMP-02/sequence.mmd) | Pending real GAS |
| [UC-PHOTO-01](UC-PHOTO-01/specification.md) | Upload five staged vehicle photos | 1 | [sequence](./UC-PHOTO-01/sequence.mmd) | Pending real GAS |
| [UC-REG-01](UC-REG-01/specification.md) | Public vehicle application submission with five photos | 1 | [sequence](./UC-REG-01/sequence.mmd) | Pending real GAS |
| [UC-REG-02](UC-REG-02/specification.md) | Administrator review, approval or rejection of vehicle registration | 3 | [sequence](./UC-REG-02/sequence.mmd) | Pending real GAS |
| [UC-VEH-01](UC-VEH-01/specification.md) | Authorized cross-org plate search, details and contact/photo disclosure | 5 | [sequence](./UC-VEH-01/sequence.mmd) | Pending real GAS |
| [UC-VEH-02](UC-VEH-02/specification.md) | Direct authorized vehicle or primary contact correction | 2 | [sequence](./UC-VEH-02/sequence.mmd) | Pending real GAS |
| [UC-OWNER-01](UC-OWNER-01/specification.md) | Owner proposes a change; Registration Admin approves | 3 | [sequence](./UC-OWNER-01/sequence.mmd) | Pending real GAS |
| [UC-QR-01](UC-QR-01/specification.md) | Authenticated QR scan and resolve | 1 | [sequence](./UC-QR-01/sequence.mmd) | Pending real GAS |
| [UC-QR-02](UC-QR-02/specification.md) | Issue, revoke and rotate vehicle QR token | 3 | [sequence](./UC-QR-02/sequence.mmd) | Pending real GAS |
| [UC-PHOTO-02](UC-PHOTO-02/specification.md) | List or replace a registered vehicle photo | 1 | [sequence](./UC-PHOTO-02/sequence.mmd) | Pending real GAS |
| [UC-RET-01](UC-RET-01/specification.md) | Cancel vehicle and list retention work due | 2 | [sequence](./UC-RET-01/sequence.mmd) | Pending real GAS |
| [UC-RET-02](UC-RET-02/specification.md) | Retention approval, worker deletion and job status | 3 | [sequence](./UC-RET-02/sequence.mmd) | Pending real GAS |
| [UC-AUD-01](UC-AUD-01/specification.md) | Restricted lookup/change audit query and JSON export | 2 | [sequence](./UC-AUD-01/sequence.mmd) | Pending real GAS |

- [Traceability Matrix](../traceability-matrix.md)
- [Machine-readable UC catalog](./catalog.json)
- [UML and design standard](../../../../blueprint/standards/USE_CASE_SEQUENCE_STANDARD.md)
- [Backend acceptance report](../BACKEND_ACCEPTANCE_REPORT_20261117.md)

**CI guarantee:** 50 route names appear in catalog once, all spec/diagram files exist, Mermaid syntax is structurally checked, minimum happy/alternate/error cues exist, and source/tests referenced in specs exist. CI is not graphical rendering or runtime validation.

## Design and evidence gates
1. Business requirements actor, input, preconditions, success and error results agreed.
2. Source and diagram reflect current code, including LockService, token/session handling, audit and recovery where applicable.
3. FE/BE request DTO, response envelope and permission contract reviewed; known discrepancies recorded.
4. Unit/contract/integration + GAS Editor + separate authenticated HTTP staging evidence recorded.
5. Only then mark UC `READY_FOR_FE_BE_WIRING`; presently **all UCs are LIVE_GAS_ACCEPTANCE_PENDING**.

## Discrepancy governance
[Known conflicts](../traceability-matrix.md#open-contract-and-design-discrepancies) are **not silently reconciled**. Approved business baseline overrides older proposed draft descriptions, but code-vs-contract mismatches require decision and code/docs change review. Production release gate remains closed.

