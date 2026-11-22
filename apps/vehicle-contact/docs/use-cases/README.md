# P6 Vehicle Contact — Use Case and Sequence Diagram SSOT

**Document classification:** Current implementation/live-DEV handoff, not production approval.
**Verified baseline:** PR **#110**, `main` **`bf3553d`**; GAS Web App **V48**, backend **0.9.1**.
**Authority:** [Approved Business Baseline](../APPROVED_REQUIREMENTS_BASELINE_R01_R26.md), [v1 inventory](../../contracts/api-inventory.v1.json), [GAS backend](../../backend/gas/src/api/controllers/OperationController.js), and [Master Web Blueprint](../../../../blueprint/MASTER_WEB_APP_BLUEPRINT.md).  
**Architecture:** Vue 3 → typed API adapter → Cloudflare Worker / GAS `/exec` JSON envelope → Router + session/permission enforcement → application use cases → Sheets / Drive adapters. Client-side roles are never authoritative.

## Live evidence and exclusions

- **56 canonical operations**, including **50 session-protected RBAC operations**; cross-role matrix **5 × 50 = 250 checks**.
- Live DEV suite **97/97 PASS = 11 public + 14 Worker + 72 authenticated direct-GAS**, **56/56 operations**, cleanup **7/7**.
- Frontend delivery slices **C1–C4 and C6 are delivered/wired in source**; **C5 remains blocked on D5+B3**.
- Scope is synthetic DEV API verification. It does **not** pass physical QR/device scanning, a real external OIDC provider, destructive retention execution, browser/business UAT, PDPA/security review, or production release.

## Coverage

20 business Use Case specifications + 20 versioned Mermaid `.mmd` sequence diagrams cover **56/56 declared v1 API operations exactly once as primary owner**. Sharing an operation across UI screens is allowed by reference to its owning UC; do not fork competing diagrams.

| Use Case | Title | Owned operations | Source diagram | Evidence / remaining scope |
|---|---|---:|---|---|
| [UC-AUTH-01](UC-AUTH-01/specification.md) | Local login, session check and logout | 3 | [sequence](./UC-AUTH-01/sequence.mmd) | Live API; B4 constant-work delivered; security signoff open |
| [UC-AUTH-02](UC-AUTH-02/specification.md) | First-login password change and administrator reset | 2 | [sequence](./UC-AUTH-02/sequence.mmd) | Live API; browser/business UAT open |
| [UC-AUTH-03](UC-AUTH-03/specification.md) | Google identity linking and pre-provisioned Google sign-in | 2 | [sequence](./UC-AUTH-03/sequence.mmd) | Live API scope; real OIDC-provider test open |
| [UC-ADMIN-01](UC-ADMIN-01/specification.md) | User provisioning, maintenance, suspension and role assignment | 5 | [sequence](./UC-ADMIN-01/sequence.mmd) | Live API; residual B2b role-assignment journaling open |
| [UC-ADMIN-02](UC-ADMIN-02/specification.md) | Police hierarchy and external organization master | 4 | [sequence](./UC-ADMIN-02/sequence.mmd) | Live API; B1 ancestor-cycle guard delivered |
| [UC-ADMIN-03](UC-ADMIN-03/specification.md) | System settings and public health check | 3 | [sequence](./UC-ADMIN-03/sequence.mmd) | Public/authenticated live API; release gates open |
| [UC-CAMP-01](UC-CAMP-01/specification.md) | Create, list and revoke registration campaigns | 3 | [sequence](./UC-CAMP-01/sequence.mmd) | Live API; browser/business UAT open |
| [UC-CAMP-02](UC-CAMP-02/specification.md) | Validate a public registration campaign token | 1 | [sequence](./UC-CAMP-02/sequence.mmd) | Campaign-token direct-GAS workflow; browser/business UAT open |
| [UC-PHOTO-01](UC-PHOTO-01/specification.md) | Upload five staged vehicle photos | 1 | [sequence](./UC-PHOTO-01/sequence.mmd) | Live API; device/browser media UAT open |
| [UC-REG-01](UC-REG-01/specification.md) | Vehicle application submission with five photos | 2 | [sequence](./UC-REG-01/sequence.mmd) | Live API; B2 retry reconciliation delivered; quota/ambiguous recovery manual |
| [UC-REG-02](UC-REG-02/specification.md) | Administrator review, approval or rejection of vehicle registration | 4 | [sequence](./UC-REG-02/sequence.mmd) | Live API; human review UAT + residual B2b approval journaling open |
| [UC-VEH-01](UC-VEH-01/specification.md) | Authorized vehicle registry, plate search, details and disclosure | 6 | [sequence](./UC-VEH-01/sequence.mmd) | Live API; C2/C6 FE wired; browser/business UAT open |
| [UC-VEH-02](UC-VEH-02/specification.md) | Direct authorized vehicle or primary contact correction | 2 | [sequence](./UC-VEH-02/sequence.mmd) | Live API; C3 maintenance delivered; browser/business UAT open |
| [UC-OWNER-01](UC-OWNER-01/specification.md) | Owner proposes a change; Registration Admin approves | 5 | [sequence](./UC-OWNER-01/sequence.mmd) | Live API; C1/C4 FE wired incl. own lists + approver proposedDelta |
| [UC-QR-01](UC-QR-01/specification.md) | Authenticated QR scan and resolve | 1 | [sequence](./UC-QR-01/sequence.mmd) | Live API token resolution; physical QR/device acceptance open |
| [UC-QR-02](UC-QR-02/specification.md) | Issue, revoke and rotate vehicle QR token | 3 | [sequence](./UC-QR-02/sequence.mmd) | Live API token lifecycle; physical QR acceptance open |
| [UC-PHOTO-02](UC-PHOTO-02/specification.md) | List or replace a registered vehicle photo | 1 | [sequence](./UC-PHOTO-02/sequence.mmd) | Live API; browser/device media + Drive privacy UAT open |
| [UC-RET-01](UC-RET-01/specification.md) | Cancel vehicle and list retention work due | 2 | [sequence](./UC-RET-01/sequence.mmd) | Live API; scheduler/notification + business UAT open |
| [UC-RET-02](UC-RET-02/specification.md) | Retention approval, worker deletion and job status | 4 | [sequence](./UC-RET-02/sequence.mmd) | Job-tracked retry evidence; destructive execution disabled; C5 blocked D5+B3 |
| [UC-AUD-01](UC-AUD-01/specification.md) | Restricted lookup/change audit query and JSON export | 2 | [sequence](./UC-AUD-01/sequence.mmd) | Live API; audit/business acceptance open |

- [Traceability Matrix](../traceability-matrix.md)
- [Machine-readable UC catalog](./catalog.json)
- [UML and design standard](../../../../blueprint/standards/USE_CASE_SEQUENCE_STANDARD.md)
- [Live API automation and executed evidence](../LIVE_API_AUTOMATION.md)
- [Backend acceptance report](../BACKEND_ACCEPTANCE_REPORT_20261117.md) (historical evidence; current baseline above supersedes its counts)

**CI guarantee:** 56 operation names appear in the catalog exactly once, all 20 spec/diagram pairs exist, Mermaid structure is checked, every embedded preview equals its canonical `.mmd` after trimming, and referenced source/test files exist. CI is not graphical rendering, browser UAT, production security review or runtime certification.

## Design and evidence gates

1. Business requirements, actors, inputs, preconditions, success and errors remain traceable to the approved baseline.
2. Source and diagrams reflect current implementation, including locks, sessions, audit and recovery; known discrepancies stay explicit.
3. FE/BE DTO and permission wiring is recorded separately from browser/business acceptance. C1–C4/C6 delivered does not imply C5 or UAT passed.
4. Live DEV evidence is scoped exactly to 97/97 checks and 56/56 operation coverage; direct-GAS success does not imply full Worker browser E2E.
5. Physical QR, real OIDC provider, destructive retention, browser/business UAT, PDPA/security and production release remain open gates.

## Discrepancy governance

[Known conflicts](../traceability-matrix.md#open-contract-and-design-discrepancies) are not silently reconciled. Approved business requirements override older draft descriptions, but code-vs-contract mismatches require an owner/security decision and reviewed change. Historical reports remain evidence for their own date/SHA only.
