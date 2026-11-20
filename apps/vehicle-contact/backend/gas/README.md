# P6 Vehicle Contact — GAS Backend source

**Current source state (2026-11-17):** All **50 logical v1 operations** are represented by source handlers/health route. **No new build, execution, end-to-end test, Apps Script deployment or production release is claimed.** Protected operations remain **disabled by default** via server-side `VEHICLE_API_ENABLED` Script Property.

## Architecture

```
src/entrypoints/WebApp.js                 doGet/doPost; Editor-only admin entrypoints
  → src/api/routes/Router.js              Versioned request envelope, public health, feature gate
  → src/api/controllers/OperationController.js
      → src/api/dto/OperationPayloadValidator.js       Per-operation allowlisted DTOs
      → src/application/security/SessionService.js     Server-side identity/RBAC/session
      → IdentityOperations.js / AdministrationOperations.js /
        VehicleOperations.js / MediaRetentionOperations.js
      → src/infrastructure/persistence/sheets/SheetStore.js
      → src/infrastructure/security/GasSecurity.js
      → src/infrastructure/media/DrivePhotos.js
  → src/domain/policies/                   Pure business invariants
```

Other legacy prototype modules remain present for reference; only modules wired through `OperationController.js` are part of the new feature-gated path.

## v1 source inventory (50 operations)

| Group | Count |
|---|---:|
| system | 3 |
| auth | 6 |
| users | 6 |
| organizations | 4 |
| campaigns | 4 |
| registrations | 4 |
| vehicles | 5 |
| contacts | 2 |
| changes | 3 |
| qr | 4 |
| photos | 3 |
| retention | 4 |
| audit | 2 |
| **Total** | **50** |

Authoritative operation names: [API inventory](../../contracts/api-inventory.v1.json). All `implementationVerified`, `integrationVerified` and `liveVerified` flags remain false pending evidence. A source handler is **not proof** of correct behavior, secure deployment or API completion.

## Schema and migration

The canonical [database.schema.json](../../schema/database.schema.json) has a **0.3.0-draft physical extension** with 25 tabs and append-only columns, based on existing approved business requirements. It has **not** been applied to the user's production spreadsheet. The Infrastructure-owned editor-only migration executor performs a pre-change Drive backup, Script Properties journal, additive table/header changes and post-change header comparison. Any drift requiring destructive changes is blocked. Details: [GAS migration runbook](../../docs/GAS_MIGRATION_RUNBOOK.md).

GAS Editor entrypoints:
- `verifyVehicleSchemaFromEditor`, `inspectVehicleSchemaDriftFromEditor`, `proposeVehicleSchemaChangeFromEditor`
- `migrateVehicleSchemaFromEditor` — dry-run only
- `applyVehicleSchemaFromEditor` — requires `VEHICLE_SCHEMA_MIGRATION_APPROVED=true` Script Property
- `previewVehicleReferenceSeedFromEditor` — read-only 645-row seed diff and deterministic checksum
- `applyVehicleReferenceSeedFromEditor` — requires `VEHICLE_REFERENCE_SEED_APPROVED_SHA256` to equal the exact preview checksum; creates backup/journal and consumes approval
- `bootstrapVehicleAdminFromEditor` — one-time, staging-only, approved admin initialization

## Staging configuration

Set Script Properties securely (not in Git):
- `VEHICLE_SHEET_ID` — private staging database spreadsheet
- `VEHICLE_AUTH_PEPPER` — high-entropy server secret
- `VEHICLE_GOOGLE_CLIENT_ID` — Google OIDC audience for linked accounts
- `VEHICLE_PHOTOS_FOLDER_ID` — Drive parent folder ID (see documented public-link risk)
- `VEHICLE_API_ENABLED` — **leave false until staging security and API acceptance**
- `VEHICLE_RETENTION_EXECUTE_ENABLED` — separate destructive worker gate, **leave false**
- Migration and bootstrap flags explained in their own runbooks.

See [first-admin bootstrap instructions](../../docs/GAS_STAGING_BOOTSTRAP.md). No password, token or ID is hardcoded into source.

## Build/deploy boundary

`npm run build` uses esbuild to compile ESM modules into separate mirrored `.gs` files under `dist/`. `npm run check` includes tests and may expose integration regressions; **this revision has not been run through it yet**. Building does not deploy. GitHub Actions deployment is manual and **main-branch only**; this code is on `docs/vehicle-management-gates-20261117` and must be reviewed/merged before that workflow can use it.

Do not run `clasp push` or enable public/protected data handlers without code review, synthetic staging migration, identity/authorization threat model, verified schema, media/PDPA risk review and test evidence. See [approved business baseline](../../docs/APPROVED_REQUIREMENTS_BASELINE_R01_R26.md).

## Known gaps / release blockers

1. **Verification:** source has not been built or tested in this development increment. GAS Runtime, Authorization, LockService concurrency, Drive sharing and 50 API success/failure cases require separate evidence.
2. **Recoverability:** Sheets is not ACID. Multi-row writes, staged media, deletion retries, migration recovery and idempotency need fault-injection/reconciliation testing and potentially further hardening.
3. **Operational:** scheduler notifications, full per-operation JSON Schema/OpenAPI specifications, production-ready owner-claim proof and session/privacy/security sign-off remain open.
4. **Deployment:** branch is not main and no new `clasp` action, Apps Script version or live Web App deployment has occurred.

## 2026-11-17 source wiring and concurrency refactor

- GAS `WebApp.doPost` → `api/routes/Router.js` → `api/routes/GroupRoutes.js` (13 business groups / 50 allowed operation names) → `api/controllers/OperationController.js` (DTO, server-side session/RBAC, response/error mapping) → injected application use cases → `infrastructure/persistence/sheets/SheetStore.js` and `infrastructure/media/DrivePhotos.js`.
- `composition/Container.js` wires the dependencies and checks the server-owned `VEHICLE_API_ENABLED` gate.
- Regular Google Sheets writes are sequential writes. `store.sequence(fn)` is a clarity-only wrapper around `fn()`: **no implicit transaction, rollback, or lock**.
- `store.withLock(fn)` is used only around critical concurrent read/check/write sequences (registration quota/duplicate, approval, plate version, QR rotation, user uniqueness, photo slot/quota and retention state). It flushes pending Spreadsheet writes before releasing the GAS script lock.
- Drive image transfers occur **outside** the script-lock window; only associated bounded metadata writes/counts are guarded.
- Migration executor is in `infrastructure/migrations/ExecuteAdditiveMigration.js`, invoked only from editor-only entrypoints via the composition root.
- **Source wiring reviewed, not executed.** No new build, tests, live GAS calls, or deployments have been performed for this refactor. Store-level APIs remain generic; richer domain-owned repository ports and resource-scoped authorization require further engineering review.
