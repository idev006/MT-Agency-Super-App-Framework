# P6 Vehicle Contact — GAS Backend Architecture Conformance Review

**Review basis:** [Master GAS Backend API Blueprint v1.5.0](../../../blueprint/MASTER_GAS_BACKEND_API_BLUEPRINT.md), [Phase 1 Google Sheets Architecture](PHASE1_GOOGLE_SHEETS_DATA_ARCHITECTURE.md), and [approved business requirements R01–R26](APPROVED_REQUIREMENTS_BASELINE_R01_R26.md).  
**Review type:** Source-path inspection only; **no runtime execution, security certification, test evidence or deployment**.  
**Branch:** `docs/vehicle-management-gates-20261117`.

## Structural wiring

```text
WebApp.js (doPost)
  -> api/routes/Router.js
  -> api/routes/GroupRoutes.js  [explicit 13-group / 50-operation allowlist]
  -> api/controllers/OperationController.js
       -> api/dto/RequestValidator.js + OperationPayloadValidator.js
       -> application/security/SessionService.js (server-only session/RBAC)
       -> application/use-cases/{Identity,Administration,Vehicle,MediaRetention}Operations.js
            -> infrastructure/persistence/sheets/SheetStore.js
            -> infrastructure/security/GasSecurity.js
            -> infrastructure/media/DrivePhotos.js
  <- api/responses/ResponseFactory.js
composition/Container.js wires all dependencies and checks VEHICLE_API_ENABLED.
Editor-only migration: WebApp.js -> Container.js -> infrastructure/migrations/ExecuteAdditiveMigration.js.
```

| Master-design requirement | Source finding | Evidence / outstanding task |
|---|---|---|
| Dedicated API Layer / group router | **Wired in source** | `Router.js`, `GroupRoutes.js`, `OperationController.js` |
| Exactly 50 logical operation names | **Static inventory names match** | 50/50 names in `contracts/api-inventory.v1.json`; not success results |
| Composition Root and DI | **Wired in source** | `Container.js` creates real provider adapters and injects use cases |
| Layer separation | **Improved, incomplete** | Controller moved from Application to API; migration moved to Infrastructure; application still knows physical table names |
| Provider-independent domain repository ports | **Partial / gap** | Generic `SheetStore` directly referenced from use cases; needs business-facing ports to decouple physical table schema |
| Authentication, sessions, RBAC | **Source present, unverified** | Server-side session and permissions; negative tests/direct `/exec` bypass assessment outstanding |
| Regular Google Sheets CRUD | **Source wired, unverified** | Sequential `insert/update/remove`; no SQL-style transaction |
| LockService | **Narrowed to critical races** | Quota, duplicate, approval, versions, QR, role assignment, retention status; GAS `flush()` before release |
| Photo/Drive adapter | **Wired in source, unverified** | Image upload outside lock; Drive sharing and cleanup behavior require staging |
| Schema migration | **Editor path wired, unverified** | Forward-only additive migration, copy backup, journal; never invoked by HTTP |
| DTO / error envelope | **Source present, unverified** | Per-operation payload allowlist and normalized `apiSuccess/apiFailure` |
| Idempotency and partial failure recovery | **Partial** | Registration key and journal exist; multi-tab and Drive failure recovery not complete or verified |
| Automated acceptance and live GAS execution | **Not performed** | User explicitly deferred tests; no runtime results |
| Production readiness | **No** | Feature flags off; approvals, review, build, test and deployment gates open |

## Sheets concurrency policy — avoid overengineering

Ordinary writes are **sequential** GAS calls, not ACID transactions. Do not implement Unit of Work, SQL rollback or distributed transaction framework for Google Sheets. Use `store.withLock(fn)` only for a bounded critical section where two requests can corrupt uniqueness, quotas, lifecycle or permissions. Keep slow Drive uploads outside locks and flush before release. A partially completed multi-row workflow remains possible and requires business-level reconciliation, not a fictitious rollback.

**Final assessment:** The primary backend components are structurally wired to the intended API execution path. They are **not verified end to end** and do not yet satisfy every Master Blueprint requirement (notably business-facing repository-port isolation and operational recovery). **Do not mark the project fully complete or deploy protected endpoints yet.**
