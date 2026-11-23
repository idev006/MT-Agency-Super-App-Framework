# P6 Vehicle Contact — Source-Mirrored GAS Module Mapping

> **SUPERSEDED BY [CODE_MAP_20261121.md](CODE_MAP_20261121.md)** (current map + §10 addendum). STALE MODULE TABLE (2026-11-17, GAS Version 5, 14 modules). For the current 56-module / 56-operation structure, live dispatch path, operation→module→permission map and legacy-module list, use **[CODE_MAP_20261121.md](CODE_MAP_20261121.md)**. The `$`-flattening explanation below remains valid.

**Document:** P6VC-GAS-MODULE-001  
**Date:** 2026-11-17  
**Status:** DEPLOYED TO APPS SCRIPT SOURCE / EDITOR AND LIVE BUSINESS FUNCTIONS NOT YET FIELD VERIFIED  
**Source authority:** GitHub `apps/vehicle-contact/backend/gas/src/` (ES modules).  
**Build source:** [scripts/build.mjs](../backend/gas/scripts/build.mjs).  
**Deployment proof:** [GitHub Actions run 44035053861](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44035053861), commit `b1ea83d1f6e67d65952754b013651b23edff6b8b`, GAS Version **5**.  
**Target GAS project:** `1hgszMzlCLe5snPx7NY5fj-esZIIJDhXtiitTCXpgQRQKgqkBSXJyPvJX`.

## Why names are flattened

Google Apps Script's editor displays project script files in one flat list; it does **not** create directory trees from source paths. Preserve layer and subpath names with `$` segments in each generated `.gs` filename. Module identity remains its original GitHub path inside the lazy module registry.

For example `src/infrastructure/persistence/sheets/SheetsSchemaRepository.js` → `INFRASTRUCTURE$persistence$sheets$SheetsSchemaRepository.gs`. **No manually edited/generated GAS file is a competing SSOT.**

## Exact mapping — current deployment

| GitHub source (relative to backend/gas/) | Generated GAS filename |
|---|---|
| `src/entrypoints/WebApp.js` | `ENTRYPOINTS$WebApp.gs` |
| `src/api/controllers/VehicleController.js` | `API$controllers$VehicleController.gs` |
| `src/api/dto/RequestValidator.js` | `API$dto$RequestValidator.gs` |
| `src/api/groups/system/SystemGroup.js` | `API$groups$system$SystemGroup.gs` |
| `src/api/responses/ResponseFactory.js` | `API$responses$ResponseFactory.gs` |
| `src/api/routes/Router.js` | `API$routes$Router.gs` |
| `src/api/security/Policy.js` | `API$security$Policy.gs` |
| `src/application/schema-sync/CompareSchema.js` | `APPLICATION$schema-sync$CompareSchema.gs` |
| `src/application/schema-sync/ProposeMigration.js` | `APPLICATION$schema-sync$ProposeMigration.gs` |
| `src/application/use-cases/VerifySchema.js` | `APPLICATION$use-cases$VerifySchema.gs` |
| `src/composition/Container.js` | `COMPOSITION$Container.gs` |
| `src/domain/ports/SchemaRepository.js` | `DOMAIN$ports$SchemaRepository.gs` |
| `src/infrastructure/persistence/sheets/SheetsSchemaRepository.js` | `INFRASTRUCTURE$persistence$sheets$SheetsSchemaRepository.gs` |
| `../../schema/database.schema.json` (app canonical data dictionary) | `SCHEMA$database.schema.gs` |

All generated scripts are under **800 lines**. The single manifest `appsscript.json` accompanies these 14 modules.

## How runtime dependencies work

1. Build converts each ES module to an individual GAS-compatible CommonJS-style factory using esbuild (`format:'cjs'`), without shipping raw `import/export`.
2. Each `.gs` file lazily registers itself in `P6VC_Runtime`, keyed by its canonical relative GitHub path. A module is evaluated only upon first `load()`.
3. Import references resolve to the registered provider module; modules are cached per execution, and factory errors drop failed cache entries.
4. `ENTRYPOINTS$WebApp.gs` exposes GAS globals `doGet`, `doPost` and three authorized Editor-only administrative functions; internals remain behind `P6VC_Runtime`.
5. The inline registry bootstrap makes loading order-independent (tests load all files forward/reverse). **The registry is an implementation mechanism**, not a secure authentication system; protected API routes remain disabled.
6. There is no need for separate per-entrypoint duplication of the entire implementation, unlike Version 4's 5 independently bundled IIFEs.

## Evidence, caveats and release gates

- GitHub Actions run 44035053861: build/test PASS; `clasp push --force` reported `Pushed 15 files`; `clasp create-version` reported `Created version 5`.
- The one-off push request was triggered by owner-requested packaging experiment; immediately afterward the deployment Workflow returned to **workflow_dispatch only**, with exact confirmation `PUSH_VEHICLE_GAS`. Future commits do not automatically overwrite GAS.
- A GAS source push and version are **not** a Web App deployment. The Google Editor UI and actual `SpreadsheetApp` end-to-end execution are not yet independently confirmed.
- GAS Editor cannot display GitHub source directories as nested folders. Use the flattened naming convention above.
- Since `clasp push --force` updates the entire target source file set, unrelated manual edits in GAS may be overwritten. Never manually maintain parallel GAS source edits.

## Next validation

Open the [Apps Script Editor](https://script.google.com/d/1hgszMzlCLe5snPx7NY5fj-esZIIJDhXtiitTCXpgQRQKgqkBSXJyPvJX/edit), confirm 14 named files (plus manifest), and run `verifyVehicleSchemaFromEditor()` with an authorized identity and Script Property `VEHICLE_SHEET_ID` configured. Collect a sanitized execution result, then attach it to [GAS Test Evidence](GAS_TEST_EVIDENCE.md).

**Production restriction:** public /exec endpoints, user passwords, contact reads, photo access and visitor/pass flows remain disabled pending security and privacy approvals.
