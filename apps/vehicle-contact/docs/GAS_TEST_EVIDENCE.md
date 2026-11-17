# Vehicle Contact GAS — Test Evidence & Deployment Status

**Date:** 2026-11-17  
**State:** ES Modules built and contract-tested; first authenticated `clasp push` to supplied GAS Script ID **SUCCESS** (run 44033187307), browser integration and security/PDPA gate **NOT DONE**.

| Gate | Result / evidence |
|---|---|
| Google Sheets created | **DONE** — six named tabs with headers; located inside Drive project root and verified by connected Drive metadata |
| Source scaffold | **DONE** — versioned Github source under `backend/gas/` |
| Source/API bundle contract test | **PASS (CI)** — GitHub Actions [run 44022203757](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44022203757), commit `617fd433`, tests for versioned route rejection, fake Sheets schema adapter, and GAS global entrypoints in built artifact |
| GAS package build | **PASS (CI)** — same GitHub Actions run, pinned esbuild bundling from ES Modules into `dist/Code.gs` and manifest; **not** a GAS cloud deployment |
| Script property `VEHICLE_SHEET_ID` | **PENDING** — configure only in secured Apps Script settings |
| Apps Script project / `clasp push` | **SUCCESS** — [run 44033187307](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44033187307), `Pushed 2 files`, created GAS version 3. Editor integration and Web App publication still OPEN. Tracked in [VC-W29](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/29). |
| End-to-end from GitHub Pages | **PENDING** |
| Username/Password auth and session | **NOT IMPLEMENTED** |
| Per-operation authorization and direct endpoint bypass | **NOT IMPLEMENTED / BLOCKING** |
| QR, data CRUD, concurrency, PDPA | **NOT IMPLEMENTED / BLOCKING** |

## GitHub source-mirrored multi-file GAS — VERIFIED 2026-11-17 (Version 5)

- **Workflow run:** [44035053861](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44035053861), conclusion **success**, commit `b1ea83d1f6e67d65952754b013651b23edff6b8b`.
- **GAS upload:** `clasp push --force` recorded **Pushed 15 files** = 14 named `.gs` modules + `appsscript.json`; `clasp create-version` recorded **Created version 5**.
- **Packaging:** one generated `.gs` per GitHub source file, plus one for canonical JSON schema. Names flatten source paths into `LAYER$subfolder$Module.gs` because Apps Script has no nested source folders. See [exact mapping](GAS_MODULE_MAPPING.md).
- **CI:** all 14 files meet the 800-line maximum, contract tests pass for forward/reverse loading, fake Sheets, schema drift and safe API denial.
- **Workflow restored:** manual-only dispatch after the one-time experiment, with `PUSH_VEHICLE_GAS` confirmation.
- **Not established:** independent live Editor functional test; real Sheets access; a published Web App, security/PDPA approvals. **Do not equate version creation to Web App deployment.**

## Multi-file GAS proof — VERIFIED 2026-11-17 (Version 4)

- **Workflow run:** [Run 44034261629](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44034261629), conclusion **success**, deployed commit `2083899ebe9e9b0a4779563f8e69203109abf058`.
- **Target script:** `1hgszMzlCLe5snPx7NY5fj-esZIIJDhXtiitTCXpgQRQKgqkBSXJyPvJX`.
- **Verified build:** five independent GAS IIFE files, one manifest, each file within the agreed 800-line limit. `ENTRY$WebGet.gs` (646), `ENTRY$WebPost.gs` (652), `ADMIN$VerifySchema.gs` (644), `ADMIN$InspectSchema.gs` (644), `ADMIN$ProposeSchema.gs` (644).
- **Tests:** Node contract tests pass, including positive `system.health`, rejected protected routes, fake Sheets Schema Drift and both forward/reverse file execution ordering.
- **Deployment:** `clasp push --force` reports **Pushed 6 files**; subsequent `clasp create-version` reports **Created version 4**. This is a successful **GAS script source push** and Apps Script version creation, not a live Web App deployment.
- **One-shot action:** a temporary deployment trigger was permitted solely for this explicit user-requested push, then removed. Workflow restored to **manual-only** `workflow_dispatch`.
- **Limitations:** each generated file is an independently tree-shaken self-contained bundle for its global entrypoint, so some code is duplicated across generated files. They are **not** separate runtime ES Modules. GAS editor function execution, actual Sheets verification, exposure/authorization and frontend E2E are not confirmed.
- **Source:** [Multi-file builder](../backend/gas/scripts/build.mjs) and [contract tests](../backend/gas/tests/contract.test.mjs).
- **Next quality step:** inspect GAS editor for five generated files, run admin-only schema verification with authorized identity, and retain source/version evidence. Never publish the privileged Web App surface before Security/PDPA gates.

## First authenticated GitHub Actions → GAS source push — VERIFIED 2026-11-17

- **Workflow run:** [Deploy P6 Vehicle Contact GAS #1](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44033187307), conclusion **success**, 2026-11-17 06:42 UTC (13:42 Asia/Bangkok).
- **Source commit:** `75c26b393fb1443e2076503fe2a06d0525c0f61a`.
- **Target GAS Script ID:** `1hgszMzlCLe5snPx7NY5fj-esZIIJDhXtiitTCXpgQRQKgqkBSXJyPvJX`.
- **Observed job results:** Build/test PASS; OAuth secret authentication step PASS; `clasp push --force` PASS; `Pushed 2 files`: `dist/appsscript.json`, `dist/Code.gs`; `clasp create-version` PASS: `Created version 3`; credential cleanup PASS.
- **Evidence:** workflow job [133869739280](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44033187307/job/133869739280).
- **Still not proven:** GAS editor admin function execution against actual Spreadsheet, Script Property validation, deployed Web App endpoint, identity/authorization, private photo read, production sign-off. Creating a GAS *version* is not publishing a Web App deployment.
- **Next validation:** open Apps Script Editor, confirm files and Script Property `VEHICLE_SHEET_ID`, run `verifyVehicleSchemaFromEditor()` under authorized identity, attach sanitized logs. Do not publish a public endpoint until security/PDPA gates pass.

Use synthetic, non-PII data for future tests. Store test dates, commit hashes, Apps Script version/deployment IDs, operator, environment, and sanitized results when tests are executed.
