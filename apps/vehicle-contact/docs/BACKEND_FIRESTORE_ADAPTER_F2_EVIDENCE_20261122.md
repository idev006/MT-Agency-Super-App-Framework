# F2 — Firestore persistence adapter behind the store port (offline contract proof)

**Date:** 2026-11-22 (Asia/Bangkok)
**Doc ID:** P6VC-BE-F2-001
**Slice:** F2 (PM plan lane F, D-E1 Option 2 / [VC-ADR-019](DECISION_LOG.md)) — **ENGINEERING DELIVERED (offline).** Not live; not wired into the runtime. The Google Sheets adapter remains the system of record (V49 / 0.9.2).
**Companion:** [E1 datastore migration design](E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121.md) (§7 black-box architecture), [F1 store-port contract](../backend/gas/tests/store-port-contract.test.mjs), [Firestore adapter](../backend/gas/src/infrastructure/persistence/firestore/FirestoreStore.js), [offline contract test](../backend/gas/tests/firestore-store-contract.test.mjs).

## 1. What F2 delivers

A second persistence "black box" — `createFirestoreStore({firestore})` — that satisfies the **identical 8-method store port** as `createSheetStore`: `one, list, listNewest, insert, update, remove, withLock, sequence`. Because both adapters pass the same adapter-agnostic contract ([F1](../backend/gas/tests/store-port-contract.test.mjs)), the engine is swappable without touching any use-case, DTO, permission, Worker or frontend code.

F2 is proven **offline**: the adapter runs against an in-memory fake of the Firestore document gateway. No GCP project, billing, credentials or network are required, and **no live data is touched**. The real REST + service-account-OAuth gateway (`UrlFetchApp`) and live provisioning are **F4**; the composition-root selection flag + dual-write/backfill/cutover/rollback are **F3**.

**Runtime is provably unchanged by F2:** the adapter is bundled into the GAS artifact but is **not** imported by [Container.js](../backend/gas/src/composition/Container.js) (which still calls `createSheetStore`). Default backend stays Sheets until F3.

## 2. Port → Firestore mapping (implements E1 §7)

| Port method | Firestore semantics |
| --- | --- |
| `one(name,filter)` | equality `where` query; >1 hit → `DUPLICATE_KEY` (fail-closed); 0 → `null` |
| `list(name,filter?,limit?)` | `where` + `orderBy(_seq asc)` + `limit`; `INVALID_LIMIT` guard (1..5000) |
| `listNewest(name,filter?,limit?)` | `where` + `orderBy(_seq desc)` + `limit` |
| `insert(name,data)` | transaction: create-if-absent (doc id = primary key) → `DUPLICATE_KEY` on conflict; required-field validation; assign next `_seq` |
| `update(name,filter,patch)` | exactly-one match (`DUPLICATE_KEY`/`NOT_FOUND`); `INVALID_PATCH` on unknown keys; transactional merge |
| `remove(name,filter)` | exactly-one match; transactional delete |
| `withLock(fn)` | no-op (`fn()`): every write is already atomic via its own transaction |
| `sequence(fn)` | **REAL Firestore transaction** — `fn` receives a transaction-bound store (the ACID seam Sheets lacks) |

- **table → collection**, **record → document**, **doc id = primary key** (all 25 tables have a primary key in [database.schema.json](../schema/database.schema.json)).
- **Unknown logical table → `UNKNOWN_TABLE`** (validated against `DATABASE_SCHEMA`, same as Sheets).
- Reads return fresh shallow copies and **strip the internal `_seq` field** so canonical columns never leak ordering metadata.

## 3. Ordering is persisted, not held in adapter memory

Firestore has **no implicit row order**, but the contract requires `list` oldest-first and `listNewest` newest-first by insertion order. The adapter therefore persists a monotonic `_seq` per record, assigned from a per-collection counter document (`__p6vc_seq/{table}`) **inside the insert transaction**. A dedicated test creates a **fresh adapter instance over the same backend** and confirms the window order survives — proving ordering lives in the store, not in adapter RAM (E1 §7 requirement).

## 4. Injected gateway seam (why this is offline-testable and GAS-safe)

The adapter depends only on a narrow injected `firestore` gateway (`get/create/update/delete/query/runTransaction`). Production supplies a REST + OAuth client (F4); the offline test supplies an in-memory fake that mirrors Firestore semantics (create-if-absent, equality `where`, `orderBy`+`limit`, atomic `runTransaction` with clone→commit / rollback-on-throw). The adapter module uses **no GAS- or Node-specific API**, so it bundles unchanged into the layer-mirrored GAS artifact.

## 5. Verification evidence (observed)

| Check | Result |
| --- | --- |
| `node --test tests/firestore-store-contract.test.mjs` | **5/5 PASS** — Firestore adapter passes the reused Sheets/in-memory contract; persisted-order test; transaction commit/rollback test |
| Full GAS `npm run check` (build + entire `npm test` chain) | **EXIT 0** — every test file passed (chain is `&&`-gated; the final files ran) |
| GAS artifact build | **57 `.gs` modules** (was 56); `INFRASTRUCTURE$persistence$firestore$FirestoreStore.gs` emitted, ≤800-line bound honored |
| Runtime wiring | Container.js still `createSheetStore` → **no behavior change**, no GAS push needed |

The transaction test asserts: a `sequence` write is visible to its own transactional read and persists after commit; a `sequence` that throws **rolls back** its insert and leaves prior committed state intact.

## 6. Honest boundaries / not yet done

- **Offline only.** No live Firestore database has been provisioned, written or read. The fake gateway proves *contract interchangeability*, not live REST/OAuth/network behavior.
- **F4 (live) still required:** REST gateway via `UrlFetchApp` + service-account OAuth; GCP project + billing + Firestore DB (Bangkok `asia-southeast3`) + creds in gitignored `.env` (owner infra); checksum-verified backfill; **independent document read-back audit** after each live suite (owner verification directive: API `OK` ≠ data proof).
- **F3 still required:** `VEHICLE_PERSISTENCE_BACKEND=sheets|firestore` flag at the composition root; dual-write journal → backfill → cutover → rollback window.
- **Composite indexes:** multi-field equality filters need Firestore composite indexes (F4 must create them; the offline fake filters in memory).
- **Counter hotspot:** `__p6vc_seq/{table}` is a single document incremented per insert. Firestore sustains ~1 write/s per document; at high write concurrency this needs sharded counters or server `createTime` ordering (F4 scaling decision).
- **Find-then-mutate window:** `update`/`remove` query outside the transaction then re-check existence inside it (fail-closed `NOT_FOUND`). F4 can move the query inside the transaction for snapshot consistency.
- **Human gate (#55):** new-store **PDPA + security review** is a separate human sign-off — **not self-approvable by an assistant**.

## 7. Best practices recorded (SSOT knowledge transfer)

1. **Reuse the adapter-agnostic contract, don't fork it.** Importing `runStorePortContract` and running it against the new adapter is the proof of drop-in interchangeability — the same suite the Sheets adapter passes.
2. **Persist ordering, never rely on adapter memory.** A stateless adapter over a shared backend must store its ordering key; test it with a *second* adapter instance.
3. **Test transaction atomicity explicitly** (commit visibility + rollback-on-throw), not just the happy path — this is the ACID upgrade over Sheets and must be evidenced.
4. **Keep the runtime provably unchanged until the cutover slice.** Bundle the adapter but don't wire it; default stays Sheets. This lets F2 merge safely without a GAS push or live risk.
5. **Inject the transport seam** so the adapter is offline-testable and GAS-safe (no Node/GAS globals in the module body).

## 8. Next slices / owner actions

- **F3** (engineering, next): selection flag + dual-write/backfill/cutover/rollback behind the port.
- **F4** (needs owner infra): GCP project + billing + Firestore DB + service-account creds in gitignored `.env`; then live REST gateway + backfill + read-back audit + full live suite.
- **#55** (human gate, owner): new-store PDPA + security review/ratification.
- No GAS push is required for F2 (runtime unchanged). Any future GAS push still waits for the owner's `PUSH_VEHICLE_GAS` trigger.