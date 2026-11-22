# E1 — Indexed datastore migration design & owner decision packet

**Date:** 2026-11-21 (Asia/Bangkok)
**Slice:** E1 (PM plan lane A-E1) — design + recommendation + owner decision packet. **NOT self-approved.** Owner ratifies via decision **D-E1**.
**Companion:** [Phase 1 Sheets data architecture](PHASE1_GOOGLE_SHEETS_DATA_ARCHITECTURE.md) (DEV logical model), [48h production readiness plan](PRODUCTION_READINESS_PLAN_20261121.md) (schedule/risk), [SSOT & Sheets directives](CURRENT_DELIVERY_STATUS.md).

## 1. Problem statement

Google Sheets is the Phase-1 system of record. Every read is an **O(rows) full-tab scan** (Sheets has no server-side index / query pushdown). At DEV scale (645 reference seed rows + synthetic registrations) this is fine and already mitigated. At **production volume** the same scan becomes the dominant latency and quota cost, and Sheets is **not an RDBMS**: no ACID multi-row transactions, no cross-sheet joins, real-world API latency.

**Owner directive (binding):** avoid cross-sheet joins; design for real-world usage, not relational convenience.

## 2. Mitigations already live (why DEV is safe today)

- **Single bounded snapshot** per operation: one tab read, bounded page window; never N+1 per-row reads.
- **No cross-sheet joins**: aggregates are assembled from one bounded snapshot + in-memory map keyed by id; reference catalog cached (Pinia/session) not re-read per request.
- **Pagination contract** (`page`/`pageSize`) on all list ops; server caps page size.
- **Text-preserving writes** (post-coercion fix): values written as plain text to avoid Sheets type coercion; checksum-verified seed apply.
- **Operation journal + reconciliation** (B2): state-driven recovery for partial writes; durable journaling for review/assignRoles deferred (B2b).
- **Retention / legal_hold** modelled in-sheet; executable set computed by bounded scan (`retention.listExecutable`).

These keep DEV correct and fast. They do **not** remove the O(rows) ceiling at production volume.

## 3. Options

| # | Option | Pros | Cons | Fit for 48h |
|---|---|---|---|---|
| 1 | **Stay Sheets, bounded-volume initial production** | Zero migration risk; journal/retention/seed already Sheets-native; fastest; matches no-join directive | O(rows) ceiling; must cap volume + archive; quota headroom must be monitored | ✅ best |
| 2 | **Migrate to Firestore (document + indexed queries)** | Server-side indexed queries (O(log n)); serverless; GAS reaches via REST; scales past Sheets ceiling | New store = new migration project (backfill, dual-write, cutover, rollback); ops/iam/billing; re-test all persistence | ❌ not in 48h |
| 3 | **Migrate to Cloud SQL (relational)** | True joins/transactions; mature | Heaviest ops; contradicts the spirit of the no-join/low-latency directive only if misused; overkill for Phase-1 access patterns | ❌ |
| 4 | **Sheets + in-Sheet index tab** | Cheap partial speedup | Index tab is itself O(rows) to maintain; dual-write consistency burden; limited gain | ⚠️ marginal |

## 4. Recommendation

**Option 1 for initial production within the 48h target**, with a **documented, gated migration path to Option 2 (Firestore)** triggered by a volume/latency threshold. Rationale:

- The 48h goal is best served by shipping the already-hardened, already-live Sheets backend (v41) rather than opening a migration project mid-release.
- All correctness machinery (journal, reconciliation, retention, seed checksums, text-preserving writes) is Sheets-native today; migrating now would re-open every one of those gates.
- The no-join directive and bounded-snapshot design already neutralise the worst Sheets pathologies at bounded volume.

**Proposed bounded-volume acceptance (owner to ratify numbers):**
- Cap active registrations per campaign and total active rows (e.g. ≤ 5,000 active vehicle rows; reference catalog ≤ 1,000 values) — exact caps = owner decision.
- Enforce **retention executable + archive** so active set stays under cap; `retention.listExecutable` + C5 console drive the purge (gated D5+B3).
- Monitor p95 read latency + Sheets quota; alert at threshold → triggers D-E1 migration review.

## 5. Migration design (if owner chooses Option 2 later)

Target: **Firestore** in the same GCP project as GAS; collections mirror tabs (`vehicles`, `registrations`, `references`, `sessions`, `journal`, `retention`).

1. **Schema mapping:** one document per row keyed by existing canonical id; keep canonical codes + `referenceVersion`; preserve text semantics (no coercion).
2. **No cross-store joins:** each use-case reads ONE bounded collection query (indexed) + in-memory assembly; reference catalog cached. Mirrors current bounded-snapshot contract so application layer is unchanged.
3. **Dual-write journal phase:** writes go to Sheets (system of record) AND Firestore (shadow) via the existing operation journal; reconcile mismatches before cutover.
4. **Backfill:** checksum-verified batch import of existing rows (reuse seed-apply checksum discipline); verify counts + checksums per collection.
5. **Cutover:** flip read path to Firestore behind a config flag; keep Sheets writes for rollback window; then flip writes.
6. **Rollback:** flag back to Sheets; journal reconciles any divergence; no data loss because dual-write preceded cutover.
7. **Re-test:** full persistence contract suite + live E2E + RBAC matrix + fail-closed against the new store; retention/legal_hold re-verified.
8. **Gates:** separate owner approval (data-scale D-E1 + PDPA for the new store + security review). NOT part of the 48h release.

## 6. Owner decision packet (D-E1) — RESOLVED

**Owner ratified Option 2 (Firestore migration) in chat on 2026-11-22**, overriding the assistant's Option-1 recommendation for the 48h target. Recorded as [VC-ADR-019](DECISION_LOG.md). The migration is a **separate project, not part of the 48h release**; the live Sheets backend (V49/0.9.2) stays the system of record until cutover.

- [x] **Choose:** (2) approve Firestore migration project (separate timeline).
- [x] **Keep the Sheets adapter** (owner direction): each DB engine is a swappable "black box" behind one interface — Sheets adapter retained for production/rollback/maintenance, Firestore adapter added alongside.
- [ ] **New-store PDPA + security review** (data residency: Bangkok `asia-southeast3` available) — separate human gate, PENDING.
- [ ] **Infra provisioning** (owner): GCP project + billing + Firestore database + service-account credentials in gitignored `.env`.
- [ ] **Volume/latency monitoring threshold** that triggers cutover review (carried over from Option 1 discipline).

## 7. Black-box persistence-adapter architecture (owner direction, F1 + F2 delivered)

The owner asked that the DB engine be a **black box**, one per store (Sheets / Firestore). The codebase already implements this seam:

- **Port (the black-box interface):** the runtime API depends only on an 8-method store contract — `one(name,filter)`, `list(name,filter?,limit?)`, `listNewest(name,filter?,limit?)`, `insert(name,data)`, `update(name,filter,patch)`, `remove(name,filter)`, `withLock(fn)`, `sequence(fn)`. `name` = a logical table in `DATABASE_SCHEMA`; records = plain objects keyed by canonical column; `filter` = equality conjunction.
- **Composition root:** [Container.js](../backend/gas/src/composition/Container.js) builds `store` and injects it into `createOperationController`; all 55 operations and `SessionService` use only the port. No use-case imports Sheets specifics (the only Sheets-coupled application file, `AdminOperations.js`, is legacy/editor-only and not in the runtime dispatch).
- **Proof of store-agnosticism:** the acceptance harness ([acceptance-fixture.mjs](../backend/gas/tests/acceptance-fixture.mjs)) runs the FULL real Router/Controller/UseCases/SessionService on an **in-memory store**, not Sheets — all 55 ops pass unchanged.
- **F1 — executable contract:** [store-port-contract.test.mjs](../backend/gas/tests/store-port-contract.test.mjs) defines an adapter-agnostic suite (read-back, copies, primary-key uniqueness, required fields, bounded windows + `INVALID_LIMIT`, equality filter, fail-closed `one`/`update`/`remove`, `withLock`/`sequence`, `UNKNOWN_TABLE`). **The Sheets adapter and an in-memory reference pass the identical suite.** The Firestore adapter MUST pass the same suite to be a drop-in — **F2 delivered: it now passes the identical suite offline** (see below).

**Firestore adapter mapping (F2 design):** table→collection; record→document (doc id = primary key); `filter`→indexed `where('==')` (composite indexes for multi-field); `list`/`listNewest`→`orderBy` a monotonic insertion key + `limit` (Firestore has no implicit row order, so the adapter must persist an ordering field — the contract test enforces the window semantics); `insert`→create-if-absent (`DUPLICATE_KEY` on conflict); `update`/`remove`→exactly-one within a transaction; `withLock`→transaction/optimistic concurrency; **`sequence`→a REAL Firestore transaction** (upgrades the no-op Sheets seam to ACID). GAS reaches Firestore via the REST API + service-account OAuth (`UrlFetchApp`), since the client SDK is not GAS-native.

**F2 — DELIVERED (offline, 2026-11-22):** [FirestoreStore.js](../backend/gas/src/infrastructure/persistence/firestore/FirestoreStore.js) implements the mapping above behind the same port and **passes the identical [F1 contract](../backend/gas/tests/store-port-contract.test.mjs)** via an in-memory fake Firestore gateway ([firestore-store-contract.test.mjs](../backend/gas/tests/firestore-store-contract.test.mjs), 5/5). Ordering is a **persisted** monotonic `_seq` (per-collection counter doc updated inside the insert transaction), proven to survive a fresh adapter instance; `sequence()` is a **real transaction** with a commit/rollback test. The adapter is bundled into the GAS artifact but **not wired into Container.js** — runtime stays Sheets, no GAS push needed. Full GAS `npm run check` EXIT 0. Evidence + honest boundaries (live REST/OAuth, composite indexes, counter hotspot, F3 cutover, #55 human PDPA/security gate): [F2 evidence](BACKEND_FIRESTORE_ADAPTER_F2_EVIDENCE_20261122.md).

**Cutover/rollback (F3):** a composition-root flag (`VEHICLE_PERSISTENCE_BACKEND=sheets|firestore`) selects the adapter; dual-write journal → checksum backfill → flag cutover → rollback window (§5). Because both adapters satisfy one port, the application/DTO/permission/Worker/frontend layers stay unchanged. **F3a delivered** (real REST gateway + selection flag, offline 19/19): [F3a evidence](BACKEND_FIRESTORE_GATEWAY_F3A_EVIDENCE_20261122.md). **F3b-1 delivered** (dual-write wrapper: Sheets SoR + best-effort Firestore shadow + divergence journal in `vc_operation_journal`, `VEHICLE_FIRESTORE_DUALWRITE=true`, offline 13/13, NOT enabled live): [F3b-1 evidence](BACKEND_FIRESTORE_DUALWRITE_F3B1_EVIDENCE_20261122.md). **F3b-2/F3b-3 delivered offline** (checksum backfill engine + independent read-back audit, gated DEV runner; reverse dual-write keeps Sheets warm for the rollback window per §5.5; cutover/rollback runbook): [F3b-2 evidence](BACKEND_FIRESTORE_BACKFILL_F3B2_EVIDENCE_20261122.md) · [runbook](FIRESTORE_CUTOVER_ROLLBACK_RUNBOOK.md). All live phases remain gated (#55, POC #2 indexes, POC #3 precondition calibration, push/publication).

**Verification directive (owner, binding):** every API call must be confirmed against the **actually-persisted data**, not just the API response. For Firestore this means an independent read-back audit of the documents (mirroring the read-only Sheets gviz audit) after each live suite — API `OK` ≠ data proof.