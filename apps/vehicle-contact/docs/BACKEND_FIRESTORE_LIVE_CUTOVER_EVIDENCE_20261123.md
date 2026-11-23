# Backend Firestore LIVE cutover + integration test evidence (synthetic DEV)

**Doc ID:** P6VC-BE-FS-LIVE-CUTOVER-001 · **Date:** 2026-11-23 (Asia/Bangkok)
**Status:** SYNTHETIC-DEV CUTOVER Phases 0→2 EXECUTED + verified on live GAS @51; **Phase 3 (Firestore SoR) flip done**. The first integration suite at @51/0.9.2 **FAILED on latency** (26/97, one `registrations.submit` 40 s timeout cascading). Root cause POC-diagnosed (§5); **targeted optimization shipped as `backendVersion` 0.9.3 and DEPLOYED: owner `PUSH_VEHICLE_GAS` → CI version 52 → clasp self-publish @52** (main `0cc74ba`, PR #139; live health `persistence{firestore,dualWrite:true}` verified). **0.9.3 suite re-run COMPLETE and GREEN: 97/97 PASS** (public 11/11 + worker 14/14 + authenticated 72/72, 56/56 ops covered, 0 missing, cleanup 7/7, 0 residue). **`REGISTRATIONS.SUBMIT` PASS at 32.1 s** (the 40 s timeout is resolved). Latency still marginal (p50 9.7 s, p95 23 s, max 36.7 s `REGISTRATIONS.REVIEW`) with the Sheets dual-write mirror on every write. **The independent dual-store read-back audit (§4.3) is GREEN: 25/25 tables, 2,464/2,464 docs matched, `divergenceOpen=0`** on a fresh post-suite export — **Phase 3 data-proof gate CLOSED**. **2026-11-23 ~09:30 +07: owner-approved EARLY EXIT of the monitoring window → `VEHICLE_FIRESTORE_DUALWRITE=false` → live runtime is FIRESTORE-ONLY; re-verified GREEN 97/97 + direct Firestore read-back 6/6 + Sheets-absence proof (§4.4, §6.1).** **Real-data go-live remains BLOCKED** (#55 legal/DPO sign-off outstanding; no real data exists — synthetic only). See [continuation handoff](HANDOFF_FIRESTORE_PHASE3_CONTINUATION_20261123.md).
**Design authority:** [E1 §5](E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121.md) (D-E1 Option 2 / VC-ADR-019) · **Procedure:** [F3b-3 runbook](FIRESTORE_CUTOVER_ROLLBACK_RUNBOOK.md) · **Prior rehearsal (Node pipeline):** [BACKEND_FIRESTORE_CUTOVER_REHEARSAL_EVIDENCE_20261123.md](BACKEND_FIRESTORE_CUTOVER_REHEARSAL_EVIDENCE_20261123.md)
**Owner authorization:** `PUSH_VEHICLE_GAS` (CI source push → V51) + `approve` (clasp self-publish @51 + synthetic-DEV cutover). Blanket "-PDPA real-data go-live gate // อนุมัติเสมอ" recorded as intent in VC-ADR-020; it does **not** substitute legal-counsel/DPO sign-off, so the real-data gate stays BLOCKED.

## 0. What this proves (and what it does not)

This is the **first live execution of the cutover on the real GAS V8 runtime** (the prior rehearsal ran the Node→Firestore pipeline, which is NOT the GAS runtime). It proves:

- The wired `Container → StoreSelector → DualWriteStore` actually fires on live GAS @51 (flag-driven, no code change per phase).
- Forward dual-write (Sheets SoR + Firestore shadow) and reverse dual-write (Firestore SoR + Sheets warm shadow) both persist correctly, verified by **independent read-back of both stores** (owner directive: API OK ≠ data proof).
- A quiesced checksum backfill aligns Firestore to the current synthetic Sheets state before the flip.
- The full live API/use-case integration suite was **run against Firestore-backed GAS @51 and FAILED on latency** (26/97, all cascading from one `registrations.submit` 40 s timeout). The root cause was POC-diagnosed (§5) and a **targeted round-trip optimization was delivered as `backendVersion` 0.9.3**; the re-run on **@52 / 0.9.3 is GREEN 97/97** (§4.2).
- A **fresh post-suite gviz export of all 25 Sheets** was compared per-doc against Firestore (Node SDK) by primary key — **2,464/2,464 docs matched, 0 missing, 0 extras, `divergenceOpen=0`** (§4.3). Suite green ≠ data proof; this audit is the data proof. **Phase 3 is GREEN.**

It does **not** prove production readiness: cross-store atomicity is not claimed; real-data PDPA/security gates are unsigned; and the GAS Firestore REST path's per-op latency (§5) — though now reduced in source — still needs live re-measurement and a production runtime decision.

## 1. Deployment state

| Item | Value |
|---|---|
| GAS Script ID | `1hgszMzlCLe5snPx7NY5fj-esZIIJDhXtiitTCXpgQRQKgqkBSXJyPvJX` |
| Worker-facing deployment | `AKfycby15c-Aux2za0BuedeIYni8-tc6rkf9ZVNmw-6ZMTgPvG9SvFjuQVSzNoMouiMhqTmxrA` |
| **Cutover deployment (Phases 0→2 + first Phase 3 suite)** | **@51** · source `436c6e3` (main, PR #138, 61 GAS modules incl. F3a/F3b wired) · `backendVersion 0.9.2` (no marker bump for the F3 wiring; verified by pin @51 + functional flag behavior) |
| **Optimization re-deploy (Phase 3 re-verification — CURRENT)** | **@52** · source `0cc74ba` (main, PR #139, incl. 0.9.3 round-trip fix `e81a960` + connection-panel `5a6d1b9`) · `backendVersion 0.9.3` |
| Publish path | owner `PUSH_VEHICLE_GAS` → CI `deploy-vehicle-gas` created version 52 (CI never publishes); owner-authorized clasp self-publish `update-deployment -V 52` → **@52** |
| Health (direct, post-@52) | HTTP 200 · `status:ready`, `apiVersion:v1`, **`backendVersion:0.9.3`**, `releaseChannel:development`, **`persistence:{engine:"firestore",dualWrite:true}`** (Firestore SoR + Sheets warm shadow) |
| Firestore DEV | project `mt-iam-core-2026`, db `(default)`, Bangkok `asia-southeast3`; SA key outside repo via gitignored `.env` |
| Sheets SSOT | `17uVyxgLkWoMrqUhgRVZQFp6EFs4oWb6lw2FPKogDqEE` (25 `vc_*` tables) |

Script Properties (project-level) persist across GAS versions, so the Phase 3 flag flip (`VEHICLE_PERSISTENCE_BACKEND=firestore` + `VEHICLE_FIRESTORE_DUALWRITE=true`) carried from @51 to @52 unchanged; @52 only swaps in the optimized code. V52 is verified by the **health marker `0.9.3` + deployment pin @52 + `persistence` block**.

## 2. Phase 1 — forward dual-write verified on live GAS (Sheets SoR)

Flag set via GAS editor Script Properties UI: `VEHICLE_FIRESTORE_DUALWRITE=true`, backend stays `sheets` (default). Controlled synthetic smoke through the live `/exec` (admin login → `organizations.create` → independent Firestore SDK read-back → `organizations.list` Sheets primary read → divergence journal → `organizations.disable` cleanup):

| Check | Result |
|---|---|
| Admin login | PASS |
| `organizations.create` → Firestore shadow doc exists | **true** |
| Firestore shadow `name` matches submitted value | **true** |
| Firestore shadow `_seq` present (safe integer) | **true** |
| Sheets primary row exists (API list reads SoR) | **true** |
| Sheets primary `name` matches | **true** |
| `dualwrite.divergence` OPEN entries | **0** |
| `organizations.disable` → Firestore shadow status | **DISABLED** |
| `organizations.disable` → Sheets primary status | **DISABLED** |
| Smoke verdict | **PASS** |

Create latency (cold, first write after publish): **12,795 ms**. This is the GAS dual-write path (Sheets write + synchronous Firestore REST mirror). See §5 for the latency analysis.

Independent read-back used a **second Firestore client** (Node SDK, `preferRest`) distinct from the GAS REST gateway — not the API's own read path. Script: `backend/gas/test-results/smoke-dualwrite.mjs` (gitignored; counters/booleans only, no secrets/PII).

## 3. Phase 2 — quiesced checksum backfill (Firestore aligned to current Sheets)

Firestore DEV was empty after the prior rehearsal cleanup, so it **had to be populated before the flip** (else the live app would read an empty store).

1. **Phase 0 fresh export:** read-only gviz CSV export of all 25 tables in the logged-in Sheets session, POSTed to a local loopback receiver (`127.0.0.1:5179`) that writes the gitignored `test-results/snapshot.json` directly. **Secret-bearing values never pass through the agent context** — only counters return. Result: **25 tables / 2,277 rows**, 0 fetch failures, 0 header drift. Marker `SYNTHETIC_DEV_BACKFILL`.
2. **Backfill:** `node scripts/firestore-backfill.mjs --snapshot test-results/snapshot.json` (gate `P6VC_ALLOW_FIRESTORE_BACKFILL=RUN_FIRESTORE_BACKFILL_DEV`). Writes docs in primary row order (`_seq=index+1`), deletes extras, resets `__p6vc_seq`, then independently reads back every collection.

| Metric | Result |
|---|---|
| Tables matched (sha256 + per-doc deep-equal + count) | **25 / 25** |
| `_seq` parity | **25 / 25 true** |
| `divergenceOpen` | **0** |
| Duration | **10 s** |
| Verdict | **PASS** |

Report: `test-results/firestore-backfill.json` (counters/checksums only).

## 4. Phase 3 — cutover to Firestore SoR (Sheets warm shadow) + integration test

### 4.1 Flag flip

Set via GAS editor Script Properties UI (secret-safe: only property NAMES/structure read, never values; the non-secret backend flag value confirmed):

- `VEHICLE_PERSISTENCE_BACKEND=firestore`
- `VEHICLE_FIRESTORE_DUALWRITE=true` (kept → reverse dual-write keeps Sheets warm for rollback)

Verified **server-side after a full page reload**: 19 properties present incl. `VEHICLE_PERSISTENCE_BACKEND`; `backendValue="firestore"`, `dualwriteValue="true"`. Effective store per runbook §1: **Firestore SoR + Sheets shadow kept warm**.

### 4.2 Full live integration suite (Firestore-backed GAS @51)

`npm run test:live:full` (`--require-authenticated`), gate `P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV`. Three stages: public direct-GAS smoke, Worker fail-closed edge probes, authenticated full-inventory regression (RBAC across all 5 roles + 56 operations + cleanup).

<!-- SUITE_RESULTS -->
**First run on Firestore-backed GAS @51 (0.9.2): FAIL — 71/97 overall, authenticated stage 46/72.**

| Stage | Result |
|---|---|
| PUBLIC_DIRECT_GAS | PASS 11/11 |
| WORKER_FAIL_CLOSED | PASS 14/14 |
| AUTHENTICATED_FULL_INVENTORY | **FAIL 46/72** (26 failed, 19 ops uncovered) |
| Cleanup | PASS 7/7 (0 residue) |

**All 26 failures cascade from ONE root timeout:** `REGISTRATIONS.SUBMIT` aborted at **40,010 ms** (the harness per-request timeout). Every downstream case then failed with `Cannot read properties of undefined (reading 'requestId'/'vehicleId')` because no registration/vehicle was created. This is a **latency failure, not a correctness failure** — the Firestore-backed write path is functionally correct (Phases 1–2 read-backs proved it) but too slow at 0.9.2's call count.

**Root cause + fix:** POC-diagnosed in §5 (GAS `UrlFetchApp` ~1 s/call × sequential REST call count). A targeted round-trip optimization was delivered in source as **`backendVersion` 0.9.3** (commit `e81a960`): `users.list` N+1 38→7, `config.get` 2→1, standalone `update`/`remove` by PK 4→2, `insert` 4→3, session `last_seen` touch de-sequenced. Offline **GAS check 224/224 EXIT 0** incl. a new round-trip regression test (insert=3 / update=2 / remove=2). `registrations.submit` projected ~33–50 calls → ~20–26 calls (under the 40 s timeout).

**Re-run on Firestore-backed GAS @52 (0.9.3): PASS — 97/97 overall, authenticated 72/72, 56/56 operations covered, 0 missing, cleanup 7/7 (0 residue).** Finished 2026-11-23T01:21:44Z.

| Stage | Result |
|---|---|
| PUBLIC_DIRECT_GAS | PASS 11/11 |
| WORKER_FAIL_CLOSED | PASS 14/14 |
| AUTHENTICATED_FULL_INVENTORY | **PASS 72/72** (56/56 ops, 0 missing) |
| Cleanup | PASS 7/7 (CAMPAIGN_REVOKE, ORGANIZATION_DISABLE, USER_SUSPEND ×4, AUTOMATION_ADMIN_LOGOUT; 0 residue) |

**The latency fix resolved the timeout:** `REGISTRATIONS.SUBMIT` **PASS at 32,125 ms** (was 40,010 ms abort at 0.9.2). **Latency is still marginal, recorded honestly:** p50 **9,726 ms**, p90 **20,056 ms**, p95 **23,000 ms**, max **36,737 ms (`REGISTRATIONS.REVIEW`, near the 40 s ceiling)**; write-heavy ops (`users.assignRoles`, `auth.changePassword`, `changes.submit`, `system.config.update`) 15–25 s. The synchronous **Sheets dual-write mirror is still on every write** — clearing it after the rollback window (§6) is the next latency win. Owner chose **GAS Firestore REST** for production (cost, VC-ADR-022); Node/Cloud Run remains a documented fallback. **Functional correctness is proven (97/97); the independent dual-store read-back audit (§4.3) is the remaining Phase 3 data-proof gate.** Continuation: [handoff](HANDOFF_FIRESTORE_PHASE3_CONTINUATION_20261123.md).
<!-- /SUITE_RESULTS -->

### 4.3 Independent dual-store read-back audit (API OK ≠ data proof)

After the suite, a fresh gviz Sheets snapshot is compared against Firestore (Node SDK) per-doc by primary key with type normalization (Firestore typed number/boolean vs Sheets text display). Script: `backend/gas/test-results/dualstore-audit.mjs` (gitignored; counters + field NAMES only).

<!-- AUDIT_RESULTS -->
**Executed 2026-11-23 after the green 97/97 suite — PASS (data proof, independent of the API).**

| Metric | Result |
|---|---|
| Fresh post-suite gviz export (read-only, 25 tabs) | **25 tables · 2,464 rows · `failures={}`** (pre-suite snapshot recorded 2,277 rows; that file was replaced by this fresh export, so the pre-count is retained from the Phase 0 record; the suite's writes are included in 2,464) |
| Tables compared (per-doc by PK, type-normalized) | **25 / 25** |
| Docs matched | **2,464 / 2,464** |
| Missing in Firestore / extras in Firestore | **0 / 0** |
| Field mismatches | **0** |
| `divergenceOpen` (vc_operation_journal `dualwrite.divergence`) | **0** |
| Verdict | **PASS** (`status=PASS`, `allMatch=true`) |

Empty `vc_roles` / `vc_user_identities` / `vc_role_permissions` / `vc_user_permissions` on **both** stores are **by design** (frozen code catalog `ROLE_PERMISSIONS`). Report: `test-results/firestore-dualstore-audit.json` (gas dir, gitignored; counters + field NAMES only).

**Bug found + fixed during the audit (SSOT):** the first audit run reported `0 matched` on all 21 non-empty tables while PKs aligned 100% (0 missing / 0 extras) and the per-row field-diff list was empty. Diagnosis (field NAMES only): Google gviz CSV appends an **unnamed trailing column** to every tab, so every Sheets row carried an extra `""`-keyed field that Firestore docs do not have — `canon()` therefore never matched, and the diff filter (which compares values by key) could not surface it. **Fix:** the exporter now drops empty-header columns and the audit's `canon()` ignores the `""` key. Re-ran against a **fresh clean re-export** → PASS above. Lesson: *when a dual-store audit reports total mismatch with zero field diffs, compare row **key sets**, not values — an export artifact can masquerade as divergence.*
<!-- /AUDIT_RESULTS -->

### 4.4 Firestore-only re-verification (after dual-write cleared — CURRENT)

**Executed 2026-11-23 after the owner-approved early exit (§6.1). The §4.3 dual-store audit is HISTORICAL from this point: Sheets stopped mirroring at the flip, so dual-store comparison is no longer the valid data proof — Firestore-only direct read-back replaces it.**

**Suite re-run on Firestore-only V52/0.9.3: PASS 97/97** (public 11/11 + worker 14/14 + authenticated 72/72, **56/56 ops**, 0 missing, cleanup 7/7). Started 02:30:50Z, finished **02:46:13Z**. `REGISTRATIONS.SUBMIT` PASS 35,852 ms (under the 40 s ceiling; run-to-run GAS variance).

**Direct Firestore read-back (Node SDK, independent of the API): 6/6 PASS** — the suite's synthetic records located by run marker (`make=SYNTHETIC`, `model=AUTOMATED`, plate `TST########`, `created_at >= suite start`):

| Check | Result |
|---|---|
| RB-01 new vehicle persisted | PASS — plate `TST01586925`, version 4 (post-lifecycle), owner set, timestamps in run window |
| RB-02 registration APPROVED | PASS — `reviewed_at` set, `application_json.plate_normalized` matches, idempotency key = sha256 |
| RB-03 contact updated | PASS — `display_name='Synthetic Updated'`, phone persisted |
| RB-04 photos | PASS — 5 persisted |
| RB-05 cleanup lifecycle | PASS — post-`VEHICLE_CANCEL` status `INACTIVE` |
| RB-06 divergence journal | PASS — 0 OPEN |

**Sheets-absence proof (dual-write OFF at the data level):** fresh gviz export of the live Sheet — `vc_vehicles` **38 rows** (frozen pre-suite) vs Firestore **39**; `vc_registration_requests` **40** vs **41**; the new plate/vehicleId/requestId are **absent from Sheets** (0 needles found). Suite writes landed in Firestore only.

**Post-suite Firestore totals:** **2,558 docs** (+94 from this run: vehicles +1, registrations +1, users +4, journal +6, …), `divergenceOpen=0`. Cleanup = disable/suspend (not delete), so the synthetic baseline grows per run — residue lifecycle automation proposed in the [test design](TEST_AUTOMATION_INTEGRATION_DESIGN_20261123.md) G5.

**Latency, dual-write OFF vs ON (same method: floor(q·n)-th of ascending durations, n=72):**

| Quantile | dual-write ON (baseline) | dual-write OFF | Δ |
|---|---|---|---|
| p50 | 9,726 ms | **8,382 ms** | −13.8% |
| p90 | 20,056 ms | **16,500 ms** | −17.7% |
| p95 | 23,000 ms | **22,374 ms** | −2.7% |
| max | 36,737 ms (REVIEW) | **35,852 ms (SUBMIT)** | −2.4% |

**Honest reading:** clearing dual-write helps (p50 −14%, p90 −18%) but is NOT a dramatic win — the dominant cost remains GAS `UrlFetchApp` ~1 s/call × sequential call count + cold starts (§5). `REGISTRATIONS.SUBMIT` at 35.9 s is still near the 40 s ceiling; write-heavy `users.assignRoles` 21–24 s. Latency remains a production-readiness blocker; next levers (token `CacheService` caching, further call-count reduction) stay measure-first per VC-ADR-022.

**Bug found + fixed during this verification (SSOT):** the first read-back run reported 2/6 FAIL while the persisted data was CORRECT. Root cause: scratch-script expectations were written against the API payload shape, not the persisted schema — (1) `application_json` stores NORMALIZED field names (`plate_normalized`, `make`), not the submit DTO names (`plate`, `brand`); (2) `idempotency_key` is the sha256 digest of the payload, not the client-supplied key; (3) final vehicle `version` reflects the WHOLE lifecycle (update → QR/photos → cancel = 4), not the mid-suite API snapshot (2). **Best practice: independent read-back expectations must be derived from the persisted schema + full operation lifecycle, never from the request DTO or a mid-flow API response.** Fixed expectations → 6/6 PASS.

**Sheets freeze note:** the live Sheet is **frozen/read-only shadow as of 2026-11-23T02:30Z** (flip time; last mirrored state = 2,464-row baseline). Retained for rollback (`VEHICLE_PERSISTENCE_BACKEND=sheets` — note: writes after the flip are NOT in Sheets; rollback requires reconciling Firestore-only writes first) until the owner approves decommission. **Do not delete.**

### 4.5 Slice A test-automation tooling — live end-to-end proof (G1+G2+G6, VC-ADR-024)

The committed tooling from Slice A (PR #146) was proven on live V52 @52 / 0.9.3 Firestore-only by running the new `verify-live-publish.mjs` chain (detached, 2026-11-23T03:04:31Z → 03:18:38Z). **Chain PASS end-to-end:**

| Chain stage | Result |
|---|---|
| `HEALTH_VERSION_MATCH` (live health vs `expected-live-version.json`) | **PASS** — backendVersion 0.9.3 / engine firestore / dualWrite:false |
| `PUBLIC_SMOKE` | **PASS** 11/11 |
| `FULL_SUITE_WITH_DATA_PROOF` → PUBLIC_DIRECT_GAS | **PASS** 11/11 |
| → WORKER_FAIL_CLOSED | **PASS** 14/14 |
| → AUTHENTICATED_FULL_INVENTORY | **PASS** 72/72, **56/56 ops**, cleanup 7/7 |
| → **DATA_PROOF** (G1, `firestore-readback-proof.mjs`) | **PASS 6/6** — vehicle `TST03539720` persisted (version≥2, owner set), registration APPROVED (sha256 idem), contact updated, photos 5, post-cleanup INACTIVE, 0 OPEN divergence |
| **VERIFY_PUBLISH overall** | **PASS** |

**G2 latency guard live (n=72 authenticated):** p50 **7,562 ms** / p90 13,948 / p95 **19,230** / max 24,471 (SUBMIT). vs the recorded Firestore-only baseline (p50 8,382 / p95 22,374): **p95 −14.1%, budget OK** (WARN threshold = baseline p95 ×1.25). Slowest 5: SUBMIT 24.5s, assignRoles.staff 23.4s, REVIEW 20.5s, config.update 19.2s, assignRoles.reg 16.3s. The guard is **WARN-only** until the owner sets a production budget (VC-ADR-022).

**Significance:** "API OK ≠ data proof" is now an **automated committed suite stage** (DATA_PROOF), not an ad-hoc scratch script; every post-publish verify is one fail-closed command. CI `full-api-suite` still reports `SKIPPED_DATA_PROOF` (no SA secret in CI — owner gate) — never a silent PASS.

**Note:** this run's suite aggregate shows DATA_PROOF as 0/0 in the stage counter because the child spawned before the `counts()` enhancement (which folds proof `checks` into the suite total); the 6/6 is recorded in `p6vc-firestore-readback-proof.json`. Future runs (incl. Slice F re-verify) count the 6 checks in the aggregate (97+6).

## 5. Latency: POC-diagnosed root cause + delivered optimization

### 5.1 POC (owner ask: "แก้ปัญหา GAS+Firestore ช้าให้ได้ ด้วยการ POC ก่อน")

A standalone REST CRUD POC (`backend/gas/test-results/latency-poc.mjs`, gitignored) mirrored the GAS gateway's exact call sequence against live Firestore DEV from Node, timing every round-trip:

| POC measurement | Result |
|---|---|
| Full CRUD cycle (9 REST round-trips: begin/batchGet/commit ×3 + runQuery) | **~335 ms warm** |
| Each individual REST call | **~25–37 ms** |
| OAuth token exchange | **~59 ms warm / ~1,066 ms first cold** |
| Token overhead per cycle (warm) | **~0 ms (cached)** |

**Conclusion: Firestore REST + SA OAuth are FAST.** The ~9–40 s GAS latency is **NOT** Firestore or OAuth. It is **GAS `UrlFetchApp` ≈ 1 s per call × the number of sequential REST calls per operation**, compounded by GAS V8 cold starts. (This corrected an earlier wrong hypothesis that OAuth-per-request dominated; the POC disproved it.)

### 5.2 Call-count hotspots (code-confirmed)

| Hotspot | Calls before | Why |
|---|---|---|
| `users.list` | **~38** | N+1: one `vc_user_roles` query **per user** |
| `authorize` (every authenticated op) | **7** | 4 reads + a 3-call `sequence(update last_seen)` touch |
| Each write (`insert`/`update`/`remove`) | **4** | `:beginTransaction` + 2×`:batchGet` + `:commit` |
| `config.get` | **2** | one `vc_settings` query per key |
| `registrations.submit` | **~33–50** | ~5 reads + 3 inserts + several updates, all at 4 calls → **>40 s timeout** |

### 5.3 Optimization delivered (`backendVersion` 0.9.3, commit `e81a960`)

Safe, targeted round-trip reduction — **no over-engineering**, no contract/DTO/permission/inventory change:

- **Gateway:** added non-transactional `commit(ops)` (single `:commit` with existence preconditions) + `batchGetMany` + transaction **prefetch** (folds the tx's initial doc+counter reads into ONE `:batchGet`).
- **Store:** standalone `update`/`remove` by PK = `batchGet` + single `commit` (**4→2**); `insert` = begin + prefetched batchGet + commit (**4→3**, keeps `_seq` atomicity); `sequence()` keeps the atomic tx path (the tx object lacks `commit`/`batchGetMany`, so transactional callers are unchanged).
- **`users.list`:** one `vc_user_roles` read grouped by `user_id` (**38→7**).
- **`config.get`:** single `vc_settings` list (**2→1**).
- **Session `last_seen`:** dropped the `sequence` wrapper (a single-row touch needs no multi-write atomicity).

**Offline proof:** store-port + REST contract green; new regression test asserts **insert=3 / update=2 / remove=2** round-trips and that standalone update/remove avoid `:beginTransaction`; full **GAS check 224/224 EXIT 0**. Projected `registrations.submit` ~20–26 calls (under the 40 s timeout).

### 5.4 Remaining latency levers (owner decisions / future slices)

- **Token caching across executions** (`CacheService`): each GAS execution builds a fresh gateway → one token exchange per execution. Caching would save ~1 call/exec. Deferred (avoid over-engineer; measure first).
- **Production runtime:** if GAS latency is still unacceptable for production UX, a **Node/Cloud Run** runtime with the Firestore SDK + connection reuse (the #135 pipeline showed ~0.7 s p50) is the alternative. This is an owner production decision, separate from synthetic-DEV correctness.
- ~~Clear `VEHICLE_FIRESTORE_DUALWRITE`~~ — **DONE** (owner-approved early exit ~02:30Z; Firestore-only, §4.4). ~~Live re-measurement of 0.9.3 pending~~ — **DONE** (§4.4/§4.5).

### 5.5 Detail-page latency diagnosis + Slice F (owner UX-confirmed, VC-ADR-025)

The owner tested the live `vehicles/detail` page and reported it slow ("มันช้านะ"), confirming the latency blocker is real for UX. Code-traced + fake-server-measured round-trip breakdown of the page (2 sequential GAS APIs, `vehicles.detail` → `vehicles.history`):

| Component | Round-trips (Firestore REST via UrlFetchApp) |
|---|---|
| **`SessionService.authorize` (PER API call)** | session runQuery(1) + user runQuery(1) + roles runQuery(1) + permissions runQuery(1) + `last_seen` update batchGet+commit(2) = **6** |
| `vehicles.detail` backend | activeVehicle runQuery(1) + lookupAudit + contacts runQuery(1) + photos runQuery(1) |
| `vehicles.history` backend | change_audit runQuery(1) |

**Dominant cost = authorize ≈ 6 round-trips × 2 APIs ≈ 12/page** (each ~1 s). This is the bulk of the ~8–10 s page load.

**Slice F (safe, implemented):** `VehicleOperations.lookupAudit` wrapped a single append-only `vc_lookup_audit` insert in `store.sequence()` — a redundant second transaction. **Measured on the fake REST server: plain `insert` = 3 round-trips vs `sequence(insert)` = 5 → 2 saved per lookup** (detail backend 8 → 6). Safe: `insert` is already an atomic transaction maintaining `_seq` ordering; Sheets `sequence` is a no-op so Sheets behavior is identical. Regression test asserts `vehicles.detail` = 6 round-trips (fails at 8 if re-wrapped). Offline `npm run check` EXIT 0. **GAS runtime change → pending owner `PUSH_VEHICLE_GAS` + publish + G6-chain re-verify.**

**Bigger lever — NOT done, owner security gate:** reducing the authorize path (session/permission caching, `last_seen` write field-masking) touches auth/revocation semantics and **cannot be self-approved** (PM hard rule: no self-approval of security). Proposed as the next slice requiring owner security review. Honest expectation: Slice F alone is a modest ~2 s win; the meaningful detail-page speedup requires the authorize-path work.

## 6. Rollback posture

### 6.1 Post-green monitoring window (owner item 6 — duration delegated, executed by Tech Lead)

**Window:** starts **2026-11-23 ~08:40 +07** (after the green suite + PASS audit) and runs **~24 h → ~2026-11-24 08:40 +07**. `VEHICLE_FIRESTORE_DUALWRITE=true` stays on for the whole window (Sheets stays warm).

**Baseline at window start (measured):** `system.health` HTTP 200 · `backendVersion 0.9.3` · `status:ready` · `persistence{engine:"firestore",dualWrite:true}` · 2.7 s round-trip · divergence journal `OPEN` = **0** (audit).

**Checks during the window (sanitized counters only):** health flag/latency; `vc_operation_journal` `operation='dualwrite.divergence'` `status='OPEN'` count; GAS quota/errors in the console; no suite re-run needed unless an anomaly appears.

**Exit criteria → clear dual-write:** 0 OPEN divergences, health stable on 0.9.3/ready, no write-error spike. Then set `VEHICLE_FIRESTORE_DUALWRITE=false` in GAS Script Properties (owner-facing editor step, secret-safe) → **Firestore-only** (drops the synchronous Sheets mirror → the next latency win). Sheets is retained **read-only** until the owner approves decommission.

**EXECUTED — EARLY EXIT 2026-11-23 (owner-approved in chat; window duration delegated to Tech Lead by VC-ADR-022 item 6):**
- **Rationale for shortening ~24 h → ~50 min:** synthetic DEV has no organic overnight traffic, so the window would accrue little additional signal; the green suite + PASS audit + 0 OPEN divergences already met every exit criterion; Sheets stayed warm as the rollback path. Owner explicitly chose "clear dual-write now" over waiting.
- **Pre-flight (02:28:52Z, measured):** health 0.9.3/ready/`dualWrite:true` (2,393 ms); Firestore 2,464 docs / 25 tables; divergence OPEN = 0. The 6-hourly read-only window-check automation was removed before the flip (its `dualWrite:true` expectation would false-ALERT afterwards).
- **Flip (~02:30Z):** GAS editor Script Properties UI, secret-safe flow (property NAMES only via `evaluate_script`, never `take_snapshot`); edit buffer `true→false` → Save → **page reload → server value `false` confirmed**.
- **Post-flip health (measured):** `backendVersion 0.9.3`, `status:ready`, **`persistence{engine:firestore,dualWrite:false}`** (2,473 ms). No source push, no publication — runtime bundle unchanged (@52, source `0cc74ba`).
- **Re-verification:** §4.4 — suite 97/97 + direct read-back 6/6 + Sheets-absence proof + latency re-measurement. **Window CLOSED; task #78 DONE.**
**Rollback at any point in or after the window:** flip `VEHICLE_PERSISTENCE_BACKEND=sheets` (dual-write back on) — no committed write is lost; re-run suite + independent dual-store audit; journal the incident as SSOT.

### 6.2 Rollback mechanics

Reverse dual-write keeps Sheets warm. Rollback = set `VEHICLE_PERSISTENCE_BACKEND=sheets` (keep dual-write → Firestore becomes shadow again); **no committed write is lost** because Sheets stayed current. Reconcile divergence journals both directions; re-run suite + independent Sheets audit; record incident as SSOT. Cross-store atomicity is **not claimed** — the guarantee is SoR-first + journal + checksum audit + warm standby.

## 7. Honest boundaries

- **Synthetic DEV only.** No real personal data exists or was processed. The real-data go-live gate (#55) requires named legal-counsel + DPO sign-off, retention numbers, lawful basis, ROPA, notices/consent, cloud-transfer assessment and breach SOP — all **outstanding/BLOCKED**. Owner blanket "อนุมัติเสมอ" is recorded as intent (VC-ADR-020), not as legal sign-off.
- **GAS V8 ≠ Node.** This cutover ran the real GAS runtime; the prior rehearsal ran the Node pipeline. Both are now evidenced, but they are different runtimes.
- **gviz display semantics.** The Sheets snapshot uses gviz display values; the dual-store audit normalizes types to compare fairly. Text-format cells preserve string semantics.
- **Latency (§5)** is a production-readiness blocker for the GAS Firestore path, separate from correctness.
- **Publication gate honored:** source push used owner `PUSH_VEHICLE_GAS`; publication used owner `approve` (clasp self-publish, V50 precedent). Each push needs its own phrase.

## 8. Reproduce

```bash
# Phase 1 smoke (gates inline; .env at repo root supplies creds + SA key path)
P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV \
P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE \
  node apps/vehicle-contact/backend/gas/test-results/smoke-dualwrite.mjs

# Phase 0 export: logged-in Sheets page → gviz CSV → loopback receiver (secret-safe)
node apps/vehicle-contact/backend/gas/test-results/snapshot-receiver.mjs   # then browser export

# Phase 2 backfill + independent read-back
P6VC_ALLOW_FIRESTORE_BACKFILL=RUN_FIRESTORE_BACKFILL_DEV \
  node apps/vehicle-contact/backend/gas/scripts/firestore-backfill.mjs \
  --snapshot apps/vehicle-contact/backend/gas/test-results/snapshot.json

# Phase 3 flip backend=firestore (keep dualwrite=true) via GAS editor Script Properties, then:
P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV \
  npm --prefix apps/vehicle-contact/backend/gas run test:live:full

# Phase 3 independent dual-store audit (after a fresh post-suite Sheets export)
P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE \
  node apps/vehicle-contact/backend/gas/test-results/dualstore-audit.mjs \
  --snapshot apps/vehicle-contact/backend/gas/test-results/snapshot.json
```

## 9. Owner gates / actions

- **Real-data go-live (#55): BLOCKED** — needs legal-counsel + DPO sign-off and the PDPA dossier items. Synthetic-DEV cutover does not authorize real data.
- **Production runtime decision:** GAS Firestore REST latency (§5) is too high for production UX — decide Node/Cloud Run vs GAS optimizations.
- **Rollback window duration:** owner sets the monitoring window before clearing dual-write (Firestore-only).
- **Production Firestore provisioning + SA-key rotation:** owner gates.
- Outstanding ratifications: D3/D5/B3, VC-ADR-014/015/017, E3 four sign-offs, physical QR-device acceptance.