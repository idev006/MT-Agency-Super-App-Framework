# P6 Vehicle Contact — Current Delivery Status / Resume Here

**Last verified:** 2026-11-28 (Asia/Bangkok) — backend **0.9.65** + FE **0.9.24** live, proven through the Node core (live suite 112/112 + DATA_PROOF 7/7 fresher than the suite); Cloudflare Worker deleted. R10 reference seed core job DRY_RUN executed successfully.
**Status:** DEV / synthetic data only. Engine move to native async Node in progress (24 of 64 operations on the core). Not production-ready; go-live items in [ROADMAP.md](ROADMAP.md) R14 / R16 / R17.
**Main:** `7dc112f` (#344). Before any work: `git fetch origin main`, compare, read open PRs / issues / CI.

This page is the **current truth only** (short on purpose). History up to 2026-11-26 lives in this file's git history, the
[DECISION_LOG.md](DECISION_LOG.md) evidence column and the dated `*_EVIDENCE_*` documents (they prove only their own date).
Next steps, rules and the ready-to-paste prompt: [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md).

## 1. What runs (DEV, Google Cloud asia-southeast3 + GAS)

| Component | Now | Notes |
|---|---|---|
| Web app | **FE 0.9.24** live on GitHub Pages (2026-11-28, #335: photo rules applied on the device, admin card "กฎของรูปถ่าย"; works with the current backend using the default rules); browser calls p6vc-core directly | photos shown by Drive link (thumbnail at once, full size on tap, API fallback) |
| Cloudflare Worker | **retired** (VC-ADR-056 W1): code removed from the repo; the Cloudflare deletion follows the merge (owner approved) | the browser calls p6vc-core `/api/frontend`; gateway contract checked by `backend/cloudrun/verify-gateway-failclosed.mjs` |
| **p6vc-core** (Cloud Run, Node 22 ESM, async, gRPC Firestore) | front door; answers **24 / 64** ops, forwards the rest to p6vc-api | 2 vCPU, 512 Mi, cpu-boost, `UV_THREADPOOL_SIZE=2×vCPU`, secrets: media bridge + `p6vc-auth-pepper` |
| p6vc-api (Cloud Run, legacy engine) | the sync GAS-style backend (`backend/gas/src`), concurrency 1 | frozen (VC-ADR-051): no new features, deleted at N4 |
| GAS web app | **@113**, photo bridge (upload / read / trash / list / organize / stat, HMAC signed) + old API | current clasp artifact has 60 `.gs` files; bridge-only candidate is local, not published |
| Cloud Run Jobs | `p6vc-housekeeping` (mode APPLY: Drive trash, 30-day undo), `p6vc-photo-audit` (read-only), `p6vc-reference-seed` (manual DRY_RUN default) | housekeeping daily 03:30 Bangkok; R10 job has a separate manual workflow |
| Firestore `(default)` | 25 tables, **38** composite indexes (`contracts/firestore-indexes.v1.json`), TTL on log tables | indexes are deployed **before** the backend |
| Google Drive | photos: `รถ/<province>/<province> <plate> · <vehicle id 8>/<SIDE>.<ext>`, shared by link | owner: photos are not secret |

Operations on the core (`backend/core/src/facade/operations.mjs`):
- shared flows (`FLOWS`): vehicles.lookup / detail / history / photo, qr.resolve, contacts.read, auth.* (6), campaigns.validate, references.registration, photos.upload, registrations.submit
- native async use cases (`USE_CASES`, `backend/core/src/use-cases/`): vehicles.list, qr.markPrinted, system.config.get, system.config.update, system.reset.preview, system.reset.execute, qr.history, vehicles.listMine

## 2. Last proof (2026-11-28 Bangkok, 0.9.65)

| Check | Result |
|---|---|
| Deploy chain 0.9.65 (`7dc112f`, R11) | GAS @115 (bridge check: full, 0.9.65 PASS), p6vc-api 46120003654, p6vc-core 46120197350, jobs 46120392070 — all exit 0 |
| Live suite through the core (0.9.65) | **112/112 PASS**, DATA_PROOF 7/7 at 07:20:07.763Z after the inventory ended 07:20:07.663Z; p50 363 ms |
| R11 admin-tools job | code live in the core image; workflow `admin-tools-job.yml` ready; first run (RESET_PREVIEW) waits for the owner's secret |

| 0.9.64 check | Result |
|---|---|
| Deploy chain (`scripts/p6vc-deploy-backend.sh`, first run from the repo) | `56aeae3`: GAS @114 (run 46112332178), p6vc-api 46112531374, p6vc-core 46112691992, jobs 46112939754 — all exit 0; `/` = 0.9.64 |
| Live suite through the core | **112/112 PASS** (public 11, core gateway 14, authenticated 80 covering 64/64 ops, DATA_PROOF 7; the Worker stage is gone), latency p50 311 ms |
| DATA_PROOF (independent Firestore read-back) | 7/7, started 05:41:41.368Z after the authenticated inventory ended 05:41:41.249Z |
| Cloudflare Worker (W1) | `wrangler delete --name p6vc-api-test-console` → "Successfully deleted"; its deployment list no longer exists; the workers.dev URL returns HTTP 404 |
| Photo rules (VC-ADR-055) | server rules live; device rules + admin card live in FE 0.9.24; checked on localhost (portrait refused on the device and by the core) and by the owner on a real phone ("ระบบแจ้งเตือนเมื่อถ่ายผิดแนว") |

Previous proof (0.9.63): live suite 126/126 (incl. the Worker stage), DATA_PROOF 7/7; R10 seed DRY_RUN.

| Earlier check (0.9.63) | Result |
|---|---|
| Deploy chain (`scripts/p6vc-deploy-backend.sh`) | GAS @113, p6vc-api run 46091156532, p6vc-core run 46091400163, jobs run 46091668316 — all exit 0; `/` version checked by suite as 0.9.63 |
| Live suite through the core | **126/126 PASS** (public 11, Worker compatibility 14, core gateway 14, authenticated 80 covering 64/64 ops, DATA_PROOF 7), latency p50 179 ms |
| DATA_PROOF (independent Firestore read-back) | 7/7, started 01:13:34.063Z after authenticated inventory ended 01:13:33.929Z; cleanup all PASS |
| R10 reference seed job | workflow run 46092071596 deployed and executed DRY_RUN with exit 0; independent Firestore COUNT = 645 rows. Code returns success only for READY or ALREADY_APPLIED; with 645 rows, ALREADY_APPLIED is inferred. JOB report was not read directly (deployer lacks Logs Viewer). No apply/recover was run. |
| Engine answering | `x-p6vc-answered-by: core` for `vehicles.listMine` on an unauthenticated route probe; owner-scoped success path in the live suite |
| Offline | PR #331 core tests 101/101 · PR #332 full CI green · maps + SSOT validators PASS |
| Load (0.9.51, login) | p50 271 ms at 1 / 940 ms at 50 / 2,371 ms at 100 in flight, 0/300 errors; p95 ≈ 5 s at 100 (a 2nd instance cold-starts) → owner cost decision R14 |

## 3. Completed slices and next work

- **N1a** ([#311](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/311)): PR 1 (0.9.57) and PR 2 (0.9.58) deployed and proven; **PR 3 proven on 0.9.60**: `system.reset.preview/execute` on the core, off unless `P6VC_SYSTEM_RESET=ENABLED`. Its legacy acceptance test passes through the core; 0.9.59 live suite failed at SYSTEM.RESET.PREVIEW because the DEV plan exceeds 4,000 deletes. In 0.9.60 preview reports the full plan while execute refuses oversized plans before writes; live suite through core 126/126 and independent DATA_PROOF 7/7 passed (inventory ended 18:25:38.418Z; read-back began 18:25:38.565Z). Live proof used preview only; execute remains outside the DEV approval. `system.health` stays on the legacy engine until N4 (the deploy smoke checks its version).
- N4a direct browser route (#322, PR #324) proven: Pages build/deploy run 46050309613, public sign-in HTTP 200, bundle contains the core endpoint and no Worker endpoint; core CORS preflight 204, public health POST 200 at backend 0.9.60. No hosted credentials entered.
- N1b in progress (#312): PR 1 `qr.history` was proven on 0.9.61; PR 2 `vehicles.listMine` is live and proven on 0.9.62. Owner-scope acceptance passed, the route probe reported `answered-by: core`, and the core live suite 126/126 + DATA_PROOF 7/7 passed. Remaining operations follow [ROADMAP.md](ROADMAP.md) and [NODE_CORE_FINISH_PLAN.md](NODE_CORE_FINISH_PLAN.md).
- GAS source reduction (#329): `clasp status` shows 60 `.gs` files. A local bridge-only candidate builds to one `.gs` and passes VM tests. R10 reference seed core job is deployed and its DRY_RUN succeeded; R11 admin tools and the old trigger still need disposition. The bridge candidate is not published; see [GAS_BRIDGE_REDUCTION_PLAN.md](GAS_BRIDGE_REDUCTION_PLAN.md).

## 4. Open owner decisions / actions (not engineering)

R14 capacity (min instances / cost) · R16 production switches (GAS trigger `dailyDrivePhotoHousekeeping` removal, protect the pepper secret, Google OIDC decision, `P6VC_SYSTEM_RESET` off, Drive storage, legal/PDPA at go-live) · R17 old log retention (preview + confirm) · live UI checks of each deployed screen.
