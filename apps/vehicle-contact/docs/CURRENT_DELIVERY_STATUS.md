# P6 Vehicle Contact — Current Delivery Status / Resume Here

**Last verified:** 2026-11-28 (Asia/Bangkok) — backend **0.9.74** + FE **0.9.25** live, proven through the Node core (live suite 112/112 + DATA_PROOF 7/7 fresher than the suite).
**Status:** DEV / synthetic data only. **p6vc-core is the only backend** (VC-ADR-051 done 2026-11-28): it answers all 64 operations; **p6vc-api was deleted from Cloud Run** (owner: "ลบ p6vc-api"; workflow retire-vehicle-api.yml run 46152626788; old URL → 404; code backed up on the owner's machine + git history). Not production-ready; go-live items in [ROADMAP.md](ROADMAP.md) R14 / R16 / R17.
**Main:** see `git log origin/main`. Next-session handoff: [HANDOFF_NEXT_SESSION_20261128.md](HANDOFF_NEXT_SESSION_20261128.md). Before any work: `git fetch origin main`, compare, read open PRs / issues / CI.

This page is the **current truth only** (short on purpose). Older proofs live in this file's git history, the
[DECISION_LOG.md](DECISION_LOG.md) evidence column and the dated `*_EVIDENCE_*` documents (they prove only their own date).
Next steps, rules and the ready-to-paste prompt: [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md).

## 1. What runs (DEV, Google Cloud asia-southeast3 + GAS)

| Component | Now | Notes |
|---|---|---|
| Web app | **FE 0.9.25** on GitHub Pages (#357: 3 UI fixes found by the live sweep); the browser calls p6vc-core `/api/frontend` directly | photos shown by Drive link (thumbnail at once, full size on tap, API fallback) |
| **p6vc-core** (Cloud Run, Node 22 ESM, async, gRPC Firestore) | front door; answers **64 / 64** operations itself, health included (N4 PR 1) | 2 vCPU, 512 Mi, cpu-boost, `UV_THREADPOOL_SIZE=2×vCPU`, secrets: media bridge + `p6vc-auth-pepper` (also the key of the registration QR token, `deriveSecret`) |
| p6vc-api (legacy engine) | **deleted 2026-11-28** (Cloud Run service gone, its deploy / rollback workflows removed, the core has no legacy integration) | the legacy code in `backend/gas/src` stays as the shared rules the core imports + the 914-test specification; backup `F:\programming\police6\p6vc-api-backup-20261128` |
| GAS web app (image manager) | **photo bridge ONLY** (`MediaBridge.gs` + `appsscript.json`), pinned **@126** | the deploy chain pushes the bridge by default (#348, proven: "Pushed 2 files"); `--full-api` + RESTORE_GAS_API_FILES = rollback only |
| Cloud Run Jobs | `p6vc-housekeeping` (APPLY: Drive trash, 30-day undo, daily 03:30 Bangkok), `p6vc-photo-audit` (read-only, after each deploy), `p6vc-reference-seed` (manual, DRY_RUN default), `p6vc-admin-tools` (manual, typed approval) | all from the live core image |
| Firestore `(default)` | 25 tables, **38** composite indexes (`contracts/firestore-indexes.v1.json`), TTL on log tables | no index change in N1b–N4 PR 1 |
| Cloudflare Worker | retired and deleted (W1) | — |

Operations on the core (`backend/core/src/facade/operations.mjs`): shared flows (`FLOWS`, 16: officer path, auth, public registration)
and native async use cases (`USE_CASES`, `backend/core/src/use-cases/`) for everything else; `system.health` from the shared
`systemHealth()` without a store read. `retention.execute` (permanent delete) stays OFF unless `VEHICLE_RETENTION_EXECUTE_ENABLED=true`
(not set on Cloud Run), exactly as the legacy engine.

## 2. Last proof (2026-11-28 Bangkok) — one deploy + proof per slice

| Version (commit) | Slice | Deploy chain (all exit 0) | Live suite through the core | DATA_PROOF 7/7 started … after inventory ended … |
|---|---|---|---|---|
| **0.9.74** (`fda2932`, #361) | fix: malformed requests BAD_REQUEST again without the legacy engine (0.9.73 regression LIVE-06, found by the live full test) | GAS @126 bridge PASS; core 46151487282, jobs 46151691977 (no p6vc-api step) | **full test PASS 12/12**: 112/112 p50 100 ms, live UI 11/11 + 58 page views | 13:59:03.080Z after 13:59:02.971Z |
| 0.9.73 (`547148b`, #360) | p6vc-api retired in code: no legacy engine, chain without p6vc-api, uptime scripts on the core | GAS @125 bridge PASS; core 46149543175, jobs 46149780415 | full test FAIL: LIVE-06 (fixed in 0.9.74) + one flaky mocked E2E (31/31 on rerun) | — |
| 0.9.72 (`090da5e`, #356) | N4 PR 1: health on the core (64/64) | GAS @124 bridge PASS; api 46140516591, core 46140708899, jobs 46140915295 | 112/112, p50 324 ms | 11:44:32.206Z after 11:44:32.115Z |
| 0.9.71 (`593ce65`, #355) | N3: users, organizations, campaigns (15) | GAS @123 bridge PASS; api 46139518696, core 46139745481, jobs 46139958627 | 112/112 | 11:31:17.174Z after 11:31:17.074Z |
| 0.9.70 (`f9fcd80`, #354) | N2: photos, retention, audit (9) | GAS @122; api 46138511190, core 46138681682, jobs 46138933503 | 112/112 | 11:18:43.411Z after 11:18:43.314Z |
| 0.9.69 (`48b30cf`, #353) | N1b PR 5: QR issue / revoke / replace / export (4) | GAS @121; api 46137227644, core 46137409267, jobs 46137635760 | 112/112, p50 281 ms | 11:02:34.480Z after 11:02:34.394Z |
| 0.9.68 (`c4797da`, #352) | N1b PR 4: vehicle admin + change requests (7) | ran **twice by mistake** (same commit, every step exit 0); pinned GAS @120 (@119 = identical, unused) | 112/112, p50 483 ms | 10:48:44.225Z after 10:48:44.020Z |
| 0.9.67 (`2f4a74e`, #351) | N1b PR 3: registration review (4) | first deploy on the bridge default: GAS "Pushed 2 files", @118 bridge PASS; api 46134851770, core 46135074798, jobs 46135286825 | 112/112, p50 353 ms | 10:32:08.885Z after 10:32:08.796Z |

Route probe (unauthenticated, header only) on 0.9.67: `registrations.listPending` / `registrations.review` → `x-p6vc-answered-by: core`.
Offline at the last slice: core tests 182/182, legacy `npm run check` 914/914, `gen-system-maps --check`, `validate-ssot`, `validate-usecase-ssot` PASS.
Earlier: 0.9.66 (G1 bridge-only GAS, R11 RESET_PREVIEW) and before — see git history and DECISION_LOG.

**Full automated test (#357):** `node scripts/p6vc-full-test.mjs --offline | --live` — L0 static, L1 unit (core 182 incl. the legacy acceptance through the core, legacy 914, web 301), L2 mocked browser E2E + axe (31), L3 production build aimed at the core, L4 live suite + DATA_PROOF freshness, L5 live UI journey (`frontend/scripts/live-journey-ui.mjs`: approve in the review page → read-back → owner / staff / public QR page; route sweep 4 roles × desktop / phone = 58 page views: renders, no error, every API call to the core, axe clean, no sideways scroll). Report `test-results/p6vc-full-test.{json,md}`. Result: **PASS 12/12** on main `a391d59` (2026-11-28 12:19–12:28 UTC): core 182, legacy 914, web 301, web E2E 31, build → core, live suite 112/112 p50 114 ms, DATA_PROOF 12:24:31.486Z after inventory 12:24:31.380Z, live UI 11/11 checks + 58/58 page views. The sweep first found 3 UI defects (About sideways on the phone + unfocusable tables, QR scanner hint contrast, reset title contrast) — fixed in FE 0.9.25.

## 3. Completed slices and next work

- **N1b** ([#312](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/312)) done — 16 ops (0.9.61–0.9.69). Approval's duplicate check is a plate + province query (no whole-table vehicle read); pending / change lists = one window + COUNT; each write path one commit; the review QR token derived exactly as the legacy engine.
- **N2** ([#313](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/313)) done — 9 ops (0.9.70).
- **N3** ([#314](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/314)) done — 15 ops (0.9.71); `users.assignRoles` now reads THE newest role journal (legacy `.at(-1)` bug on Firestore fixed).
- **N4** ([#255](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/255)) done for the runtime: 0.9.72 nothing forwarded; 0.9.73–0.9.74 no legacy engine in the core or the deploy chain; p6vc-api deleted from Cloud Run (after the live full test PASS 12/12; live suite 112/112 again after the delete). Left (code only, no runtime change): move the shared rules the core imports from `backend/gas/src` into the core.

## 4. Open owner decisions / actions (not engineering)

**Run the uptime script for the core** (`apps/vehicle-contact/ops/cloudrun-uptime-alert.sh <e-mail>` in Cloud Shell from a repo checkout: creates the p6vc-core check + alert and removes the old p6vc-api check — until then the old check reports p6vc-api down) · R14 capacity (min instances / cost) · R16 production switches (protect the pepper secret, Google OIDC decision, `P6VC_SYSTEM_RESET` off, Drive storage, legal/PDPA at go-live) · R17 old log retention (preview + confirm) · live UI checks of each deployed screen.
