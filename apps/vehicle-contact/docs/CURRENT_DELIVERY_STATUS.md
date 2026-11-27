# P6 Vehicle Contact — Current Delivery Status / Resume Here

**Last verified:** 2026-11-27 (Asia/Bangkok) — backend **0.9.58** live, proven through the Node core (live suite 126/126 + DATA_PROOF 7/7 fresher than the suite).
**Status:** DEV / synthetic data only. Engine move to native async Node in progress (20 of 64 operations on the core). Not production-ready; go-live items in [ROADMAP.md](ROADMAP.md) R14 / R16 / R17.
**Main:** `61cf743` (#318) + docs. Before any work: `git fetch origin main`, compare, read open PRs / issues / CI.

This page is the **current truth only** (short on purpose). History up to 2026-11-26 lives in this file's git history, the
[DECISION_LOG.md](DECISION_LOG.md) evidence column and the dated `*_EVIDENCE_*` documents (they prove only their own date).
Next steps, rules and the ready-to-paste prompt: [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md).

## 1. What runs (DEV, Google Cloud asia-southeast3 + GAS)

| Component | Now | Notes |
|---|---|---|
| Web app | **FE 0.9.22**, GitHub Pages (auto on every merge to main) | photos shown by Drive link (thumbnail at once, full size on tap, API fallback) |
| Cloudflare Worker `tools/p6vc-api-test-console` | browser → legacy API (until N4) | separate deploy `npx wrangler@4 deploy`; the live suite does NOT go through it |
| **p6vc-core** (Cloud Run, Node 22 ESM, async, gRPC Firestore) | front door; answers **20 / 64** ops, forwards the rest to p6vc-api | 2 vCPU, 512 Mi, cpu-boost, `UV_THREADPOOL_SIZE=2×vCPU`, secrets: media bridge + `p6vc-auth-pepper` |
| p6vc-api (Cloud Run, legacy engine) | the sync GAS-style backend (`backend/gas/src`), concurrency 1 | frozen (VC-ADR-051): no new features, deleted at N4 |
| GAS web app | **@108**, photo bridge (upload / read / trash / list / organize / stat, HMAC signed) + old API | pinned deployment id = `MEDIA_BRIDGE_URL` in `.github/workflows/deploy-vehicle-cloudrun.yml` |
| Cloud Run Jobs | `p6vc-housekeeping` (mode APPLY: Drive trash, 30-day undo), `p6vc-photo-audit` (read-only) | daily 03:30 Bangkok by `.github/workflows/run-vehicle-jobs.yml` |
| Firestore `(default)` | 25 tables, **38** composite indexes (`contracts/firestore-indexes.v1.json`), TTL on log tables | indexes are deployed **before** the backend |
| Google Drive | photos: `รถ/<province>/<province> <plate> · <vehicle id 8>/<SIDE>.<ext>`, shared by link | owner: photos are not secret |

Operations on the core (`backend/core/src/facade/operations.mjs`):
- shared flows (`FLOWS`): vehicles.lookup / detail / history / photo, qr.resolve, contacts.read, auth.* (6), campaigns.validate, references.registration, photos.upload, registrations.submit
- native async use cases (`USE_CASES`, `backend/core/src/use-cases/`): vehicles.list, qr.markPrinted, system.config.get, system.config.update

## 2. Last proof (2026-11-27, 0.9.58)

| Check | Result |
|---|---|
| Deploy chain (`scripts/p6vc-deploy-backend.sh`) | GAS @108, p6vc-api, p6vc-core, jobs KEEP — all exit 0; `/` = 0.9.58 |
| Live suite through the core | **126/126 PASS** (public 11, Worker 14, core gateway 14, authenticated 80 covering 64/64 ops, DATA_PROOF 7), latency p50 160 ms |
| DATA_PROOF (independent Firestore read-back) | 7/7, started 16:39:04.4Z after the inventory ended 16:39:04.3Z |
| Engine answering | `x-p6vc-answered-by: core` for the 20 ops above |
| Offline | legacy `npm run check` 900 pass / 0 fail · core `npm test` 67/67 (26 generated) · frontend 296/296 · maps + SSOT validators PASS |
| Load (0.9.51, login) | p50 271 ms at 1 / 940 ms at 50 / 2,371 ms at 100 in flight, 0/300 errors; p95 ≈ 5 s at 100 (a 2nd instance cold-starts) → owner cost decision R14 |

## 3. Work in flight

- **N1a** ([#311](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/311)): PR 1 (0.9.57) and PR 2 (0.9.58) deployed and proven; **PR 3 proven on 0.9.60**: `system.reset.preview/execute` on the core, off unless `P6VC_SYSTEM_RESET=ENABLED`. Its legacy acceptance test passes through the core; 0.9.59 live suite failed at SYSTEM.RESET.PREVIEW because the DEV plan exceeds 4,000 deletes. In 0.9.60 preview reports the full plan while execute refuses oversized plans before writes; live suite through core 126/126 and independent DATA_PROOF 7/7 passed (inventory ended 18:25:38.418Z; read-back began 18:25:38.565Z). Live proof used preview only; execute remains outside the DEV approval. `system.health` stays on the legacy engine until N4 (the deploy smoke checks its version).
- Then N1b → N2 → N3 → (R10, R11) → N4, photos R03 / R04, go-live R14 / R16 / R17 — order and done-criteria in [ROADMAP.md](ROADMAP.md), plan + diagrams in [NODE_CORE_FINISH_PLAN.md](NODE_CORE_FINISH_PLAN.md).

## 4. Open owner decisions / actions (not engineering)

R14 capacity (min instances / cost) · R16 production switches (GAS trigger `dailyDrivePhotoHousekeeping` removal, protect the pepper secret, Google OIDC decision, `P6VC_SYSTEM_RESET` off, Drive storage, legal/PDPA at go-live) · R17 old log retention (preview + confirm) · live UI checks of each deployed screen.
