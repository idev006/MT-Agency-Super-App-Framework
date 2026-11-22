# P6 Vehicle Contact — DEV Clean-Init Reset Evidence

**Date:** 2026-11-22 (Asia/Bangkok)
**Owner authorization:** Mode B chosen for clean test init; synthetic DEV data only.
**Target:** published GAS Web App **V48 / backend 0.9.1** (`status:ready`), synthetic DEV spreadsheet.
**Branch/PR:** recorded on the delivering PR; source baseline `main` @ `b8e5bea` (PR #113).

## 1. What was delivered

Two complementary, gated reset mechanisms (no schema mutation, no real data, no production `ENFORCED`):

- **Mode A-full — bot-executable lifecycle clean init:** `backend/gas/scripts/reset-dev-data.mjs` (`npm run reset:dev`). Runs through the GAS API under exact gates `P6VC_ALLOW_DEV_RESET=RUN_SYNTHETIC_DEV_RESET` + `P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV` + admin creds + exec-URL allowlist. Backup snapshot before mutation; retires only allowlisted synthetic records; re-seeds N fresh ACTIVE; verifies; fail-closed; cleanup; exit codes 0/1/2/3.
- **Mode B — physical synthetic truncate (source):** `DevDataReset.js` + editor wrapper `resetDevDataFromEditor()`. Clears data rows on 15 transactional tables, preserves headers + 10 identity/config/reference/migration tables, full backup before clear, schema-drift fail-closed, `PARTIAL_FAILURE` returns complete backup. Editor-only; gate `VEHICLE_DEV_RESET_APPROVED=RUN_SYNTHETIC_DEV_RESET`. Execution needs Owner editor Run or one-time `clasp run` enablement (Apps Script API in GCP project).

## 2. Offline engineering evidence

| Gate | Result | Scope |
|---|---|---|
| Reset script tests | **PASS 8/8** | `tests/dev-data-reset.test.mjs`: gate blocking (no network), invalid url/creds, truncate-not-bot-executable, non-synthetic fail-closed (zero cancels), health fail-closed, happy path (backup-before-mutation, admin preserved, synthetic-only), cleanup-fail exit 3, classifiers |
| Editor truncate tests | **PASS 7/7** | `tests/dev-data-reset-editor.test.mjs`: clears 15 / preserves 10, headers untouched, backup-before-clear, schema-drift fail-closed, missing-table fail-closed, injected mid-clear `PARTIAL_FAILURE` with full backup, idempotent empty, guards, preserve-list coverage |
| GAS full check | **PASS (exit 0)** | `npm run check`: build + all suites incl. new tests; **GAS-VM-03** confirms `resetDevDataFromEditor` has a callable global wrapper |

## 3. Live clean-init execution (Mode A-full, synthetic DEV)

Command: `P6VC_ALLOW_DEV_RESET=RUN_SYNTHETIC_DEV_RESET npm run reset:dev -- --count=10`

| Metric | Result |
|---|---|
| Status | **PASS** |
| Step tests | **52/52 PASS**, 0 FAIL |
| Retired (lifecycle) | **10 vehicles** (`vehicles.cancel`), **3 campaigns** revoked, **6 organizations** disabled, **21 synthetic users** suspended |
| Admin preserved | `P6VC_ADMIN_USER` === `P6VC_TEST_USERNAME`, excluded from suspension; remains `ACTIVE` with `SYSTEM_ADMIN`+`REGISTRATION_ADMIN` |
| Re-seeded | **10 fresh ACTIVE** vehicles `ฑฆ1000`–`ฑฆ1009`, each 1 contact / 5 photos / QR `MATCH` (lookup + photo-count + qr.resolve verified) |
| Backup | sanitized inventory snapshot taken **before** mutation (`test-results/p6vc-dev-reset-backup-*.json`, gitignored) |
| Cleanup | **2/2 PASS** (seed campaign revoked, admin logout) |
| Secrets | `secretsExposed:false`; no tokens/credentials/raw PII in report |

Synthetic-only guard: every retired vehicle matched the allowlist (`ฑฆ|TST|DEV|กข` or brand `SYNTHETIC`); a non-synthetic ACTIVE row would have failed the run closed with zero cancellations.

## 4. Live API suite after clean init

<!-- SUITE_RESULTS -->
Command: `npm run test:live:full` (target published V48 / 0.9.1, re-seeded synthetic fixtures). Aggregate report `test-results/p6vc-live-api-suite.json`, `sourceCommit b8e5bea`, finished 2026-11-22T04:19:21Z.

| Stage | Result | Scope |
|---|---|---|
| PUBLIC_DIRECT_GAS | **11/11 PASS** | health + public direct-GAS operations |
| WORKER_FAIL_CLOSED | **14/14 PASS** | Cloudflare Worker gateway fail-closed probes |
| AUTHENTICATED_FULL_INVENTORY | **72/72 PASS** | all five roles (admin / registration / staff / owner / retention-worker), direct-GAS |
| **Total** | **97/97 PASS · 0 FAIL** | |

- **Operation coverage: `covered 56 / expected 56`, `missingOperations: []`** — every API operation exercised (52 distinct operations across the 72 authenticated cases + 4 cleanup-only operations `campaigns.revoke`, `organizations.disable`, `users.suspend`, `auth.logout`).
- **Cleanup 7/7 PASS** (campaign revoke, organization disable, 4 role-user suspends, automation-admin logout).
- `secretsExposed: false`; sanitized, gitignored reports.
- Boundary: the 72 authenticated cases are **direct-GAS**, not an all-through-Worker claim; the 14 Worker probes cover gateway fail-closed behavior separately. This is DEV API automation, **not** UAT / PDPA / security / production-release approval.
<!-- /SUITE_RESULTS -->

## 5. Boundary

- This is **synthetic DEV** clean init, not production data clearing, not destructive retention (C5 remains gated), not `ENFORCED` mode.
- Mode B physical truncate is **source-delivered**; its execution is an Owner editor/enablement action and was **not** run in this slice.
- PDPA, security, UAT, production-release sign-offs, physical QR-device acceptance and credential rotation remain **OPEN** human gates.