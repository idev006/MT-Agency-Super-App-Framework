# Node core — porting the remaining operations (VC-ADR-046 phases 3–7)

Owner, 2026-11-27: *"backend engine must Nodejs for best performance"* · *"you and team must diagnosis analyst planing design and implement"*.
Goal: **every** API operation answered by the async Node core (`p6vc-core`); the synchronous legacy engine (`p6vc-api`, GAS-style
code on Node) retired in phase 9. Parent plan: [NODE_CORE_MIGRATION_PLAN.md](NODE_CORE_MIGRATION_PLAN.md) · architecture:
[NODE_CORE_ARCHITECTURE.md](NODE_CORE_ARCHITECTURE.md).

## 1. Diagnosis (measured 2026-11-27, synthetic DEV)

| # | Finding | Evidence |
|---|---|---|
| D1 | The core answers **6 of 64** operations; 58 still go to the legacy engine, which serves **one request at a time per instance** (concurrency 1, ≤ 10 instances). | `core/src/facade/operations.mjs` FLOWS; deploy-vehicle-cloudrun.yml |
| D2 | **Login is the slowest operation: 1.4–4.2 s live** (4 logins), `auth.session` 75–115 ms. | live timing through the core, this session |
| D3 | Cause of D2: password hashing is **pure-JS PBKDF2-SHA256, 150,000 rounds** (written for GAS) — **1,375 ms CPU** per hash on Node. Node's `crypto.pbkdf2` gives the **identical hash in 59 ms**, async in the thread pool (8 concurrent: 116 ms wall). Same output → **no password migration**. | `infrastructure/security/Pbkdf2.js`, `GasSecurity.js`; benchmark this session |
| D4 | With D1 + D3 the legacy can complete only ~4–7 logins per second in total (10 instances × one hash at a time) — a shift start or a registration campaign queues. | arithmetic from D1–D3 |
| D5 | The core's store has **no transactions** (`sequence()` throws `SEQUENCE_NOT_SUPPORTED`); **21 legacy call sites** use `store.sequence` (Identity 7, Administration 5, SessionService 3, MediaRetention 2, VehicleList 2, VehicleOperations 1, Settings 1, LogManager 1) and 5 modules use `withLock`. | grep of `backend/gas/src` |
| D6 | Legacy transactions **buffer writes with read-your-writes** and commit once (REST gateway `runTransaction`). The Firestore Node SDK requires all reads before writes — compatible only if the adapter also buffers writes until the end. | `FirestoreRestGateway.js` `runTransaction` |
| D7 | Firestore over REST (`preferRest`) cost 17–31 ms CPU per request; gRPC 3–10 ms — fixed in 2b-3 (#274). | VC-ADR-046 2b-3 evidence |

## 2. Analysis — the 58 operations

| Group | Operations | Writes | Traffic / value |
|---|---|---|---|
| auth | login, googleLogin, changePassword, logout, session, linkGoogle | sessions, users, security events (tx) | **every user, every day — slowest op (D2)** |
| public registration | campaigns.validate, references.registration, photos.upload, registrations.submit | staging, registration (tx, idempotency), bridge upload | **peaks during campaigns** (public) |
| review | registrations.listPending / detail / photo / review | vehicle + QR creation (tx, journal) | registration admins |
| vehicle admin | vehicles.list / listMine / update / cancel, qr.issue / revoke / replace / history / export / markPrinted | vehicles, QR (tx, print state rule) | admins, owners |
| owner changes | contacts.update, changes.submit / listPending / review / listMine, photos.list / replace | change requests (tx, OCC) | owners, admins |
| administration | users.* (7), organizations.* (5), campaigns.create / list / revoke, system.config.* , system.health | users/orgs/settings (tx, audit) | system admins (low volume) |
| retention + audit | retention.* (5), audit.query / export, system.reset.* | bulk (journal) | rare |

## 3. Design

**Same pattern as phase 2b** (proven live: dual call 19/19, live suite 126/126): each use case becomes a **shared flow** (generator
yielding effect data) in one place; the legacy runs it with `runFlowSync`, the core with `runFlowAsync`; acceptance tests compare
both engines byte for byte, including the rows written.

New pieces (wave 0):
1. **Transactions in flows** — effect `{transaction: () => subFlow}` (a *factory*, because Firestore retries a contended
   transaction and a generator cannot be replayed). Sync runner: `store.sequence(s => runFlowSync(factory(), {store: s}))`.
   Async runner: the core store's new `sequence` over the SDK's `runTransaction`, with the **same buffered-write,
   read-your-writes overlay as the REST gateway** (D6) so both engines see identical semantics. `withLock` stays a no-op
   (every Firestore write is already atomic).
2. **Async password security port** — `PasswordHasher` with `hash` / `verify` returning promises; core adapter =
   `crypto.pbkdf2` (D3), legacy adapter = the existing pure-JS one wrapped. Flows yield `{verifyPassword}` / `{hashPassword}`
   effects, so the rule (format, rounds 100k–900k, 150k for new hashes, constant-time compare) stays in one place.
3. **Idempotency + operation journal** as shared flow helpers (registration submit / review use them).
4. Everything else already exists: Log Manager on the core store, store rules (`FirestoreRules.js`), Integration Manager
   (photo bridge), `x-p6vc-answered-by`.

## 4. Plan — waves (each = one small PR → owner OK → deploy → proof)

| Wave | Scope | Acceptance |
|---|---|---|
| 0 | transactions in flows + core store `sequence`; async `PasswordHasher`; journal/idempotency helpers | both-engine tests: same results + same rows; contended transaction retried |
| 1 | **auth.*** (6) | dual call equal; login p50 < 300 ms live; load test 50 concurrent logins |
| 2 | **public registration** (4) | dual call equal; registration end-to-end with a photo through the bridge |
| 3 | review (4) | dual call; approve → vehicle + QR rows equal on both |
| 4 | vehicle admin + QR (10) | dual call; print-state rule rows equal |
| 5 | owner changes + photos (7) | dual call; OCC conflict case |
| 6 | administration (18) | dual call; audit rows equal |
| 7 | retention, audit, system reset (9) | dual call; bulk ops on DEV only, dry run first |
| 9 | web app → core direct (no Worker); `p6vc-api` deleted; `backend/shared` (2d) completed as groups move; max instances from the peak-user figure | live suite + DATA_PROOF + live UI |

Proof for every wave (owner rules): live suite through the core 126/126 + DATA_PROOF fresher than the suite, the
`ported-compare-live` dual call for the wave's operations (`answered-by: core`), Firestore read-back of the rows written,
load test where the wave is on a hot path. Rollback of a wave = remove its entries from `FLOWS` and redeploy the core.

GAS clean-up (2c-3b seed job, 2c-3c first-admin / admin-reset jobs, 2c-4 bridge-only) continues between waves; 2c-3c
reuses the wave-0 `PasswordHasher`.
