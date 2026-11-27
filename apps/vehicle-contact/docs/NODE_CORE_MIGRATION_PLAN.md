# Node core migration plan (VC-ADR-046)

**Owner direction (2026-11-26):** "ให้เขียนโค้ดสำหรับ nodejs ขึ้นมาอีกชุด จะดีกว่า จะได้จัดการ GAS ด้วยเลย" → "เขียนแผน และ project management แล้วดำเนินการ".
**This file is the scope and the rules. Status lives in one place only:** GitHub milestone [**"Node core (VC-ADR-046)"**](https://github.com/idev006/MT-Agency-Super-App-Framework/milestone/1) — one issue per phase (P0 #246 … P9 #255), closed by its PR.

## 1. Why
The business code was written for Google Apps Script, which is synchronous. On Cloud Run it runs behind a sync shim
(`backend/cloudrun/sync-fetch.mjs`: worker thread + `Atomics.wait`), so the service runs with `--concurrency 1 --max-instances 10`
— at most **10 requests at the same time for the whole system** — and talks to Firestore through a GAS-shaped REST gateway.
Live suite latency today: p50 ≈ 5.3 s, p95 ≈ 18 s. GAS still receives the whole code base (52 files) although it only stores photos.

## 2. Target
Architecture (layers, Dependency Rule, C4 views, sources): [NODE_CORE_ARCHITECTURE.md](NODE_CORE_ARCHITECTURE.md).
```
backend/core/        NEW  Node.js 22, ESM, async/await, Firestore Node SDK; one Cloud Run service "p6vc-core" (front door)
  http/                   driving adapter: server, /api/frontend gateway, /, routing table (core | legacy)
  facade/                 64 operations: route, DTO, permission, envelope
  application/            use cases, async, one folder per operation group
  domain/                 pure rules (imported from backend/gas/src/domain until phase 9)
  ports/                  interfaces the use cases need (Store, MediaStore, Clock, ...)
  adapters/               driven: Firestore SDK store, media-bridge client, legacy client, scheduled jobs
backend/gas-bridge/  NEW  GAS = photo bridge only (≈4 files, own small build)
backend/gas/         OLD  legacy engine; bug fixes only; deleted in phase 9
```
Unchanged throughout: the API contract (`contracts/api-inventory.v1.json`, DTOs, `api-permissions.v1.json`), Firestore data and
schema (`schema/database.schema.json`), indexes, the web app. **No data migration.**

## 3. Rules (all phases)
1. **Strangler, not big bang.** The new core is the front door from phase 1; every operation it has not ported yet is forwarded
   to the legacy service. One group of operations moves per PR; rollback = route that group back to legacy.
2. **One source.** `domain/` (pure rules, 851 lines) is **not copied**: during the migration the core imports it from
   `backend/gas/src/domain`; it moves to `backend/core/domain` in phase 9 with the legacy delete. Contracts stay in `contracts/`.
3. **Same tests on both engines.** The acceptance harness gets an engine switch (`legacy` | `core`); a ported group's
   acceptance tests must pass on both before its route switches. The live suite (black box) and DATA_PROOF prove every switch.
4. **Legacy freeze.** `backend/gas` takes bug fixes only; new features are written in the core.
5. **Owner rules (L0) apply per PR:** design before code where behaviour changes, OK per merge and per deploy, no PASS without
   live suite + fresh DATA_PROOF + Firestore read-back, synthetic DEV data only, no secrets in code or logs.

## 4. Phases (one issue each; PR size kept small — a phase may be several PRs)
Order since 2026-11-27 (owner: "ดำเนินการ แบบนี้เหมือนการจัดระเบียบใหม่ อย่าหมักหมมเลย"): 0 → 1 → 2 (2a foundation, 2b officer path, 2b-3 load test) → **2c GAS bridge-only** → **2d shared code out of backend/gas** → 3–7 → 9.
| # | Phase | Done when |
|---|---|---|
| 0 | Plan, ADR, tracking (this file) | merged |
| 1 | **Core skeleton + proxy:** `backend/core` package, HTTP server (`/`, `/api/frontend` from PR #245), proxy of every op to legacy, health, deploy workflow for a new service `p6vc-core` (first deploy = create; later = safe deploy), load-test script (baseline) | live suite through `p6vc-core` = same result as legacy; load baseline recorded |
| 2 | **Officer path:** `vehicles.lookup`, `qr.resolve`, `contacts.read`, `vehicles.detail`, `vehicles.history`, `vehicles.photo` + session check + Log Manager + Firestore SDK store + **Integration Manager foundation** (`adapters/outbound/`: http-client, manager, registry; legacy engine + photo bridge read as the first gateways — VC-ADR-047) + Dependency Rule test + **SSOT ratchet** (copies may only go down; architecture §6) | both-engine tests green; live suite + DATA_PROOF; load test vs baseline |
| 2c | **GAS = photo bridge only** (moved forward, owner 2026-11-27: "ที่ GAS มีโค้ดเท่าที่จำเป็น" · "อย่าหมักหมม"): the API on Cloud Run never needed GAS, so: Drive photo housekeeping as a core job (Cloud Scheduler, bridge op `list`); GAS editor admin tools as Node scripts; `doPost` bridge-only; GAS built from the bridge's imports only (~4 files) | GAS has no API or Firestore code; housekeeping dry run on DEV; owner removes the old GAS trigger |
| 2d | **Shared code out of `backend/gas`:** domain, flows, store rules, API rules → `backend/shared/` (imported by the core and the legacy Cloud Run engine); GAS keeps `backend/gas-bridge/` only | no module under a `gas` folder is used by Cloud Run; maps, ratchet, all tests green |
| 3 | Auth + users + organisations (`auth.*`, `users.*`, `organizations.*`) | same |
| 4 | Registration + review (`campaigns.*`, `registrations.*`, `photos.*`, `references.registration`) — media bridge client async | same + photo read-back in Drive |
| 5 | Vehicles maintenance + QR + print (`vehicles.update/cancel/list/listMine`, `qr.*`) | same |
| 6 | Change requests (`changes.*`) | same |
| 7 | Admin: settings registry, retention, audit, system reset (`system.*`, `retention.*`, `audit.*`) | same; reset preview only |
| 8 | (moved into 2c) | — |
| 9 | **Cut over:** web app → `p6vc-core`; Worker retired (owner disables it); legacy service `p6vc-api` deleted; concurrency raised (GAS already bridge-only in 2c; shared code already moved in 2d) | live suite + DATA_PROOF + live UI |

Runs alongside: **VC-ADR-044 PR 2a (#245) / 2b** — the browser gateway and the web-app switch to Cloud Run. The gateway code
moves into the core in phase 1. VC-ADR-044 PR 3–7 are absorbed by phases 8–9 (PR 6 "split VehicleOperations" is dropped: the
use cases are rewritten anyway).

## 5. Definition of done per ported group
- the group's use cases in `backend/core/application`, async, reading the same rows the legacy writes (and vice versa)
- its acceptance tests pass on **both** engines; no test edited to make the core pass without saying why in the PR
- route switched in the core's routing table; legacy fallback kept until phase 9
- deployed with the owner's OK: live suite (all stages) + DATA_PROOF fresher than the suite + read-back of the group's tables
- generated maps regenerated (`node scripts/gen-system-maps.mjs`); decision log row updated with the evidence
- no new copy of a fact (SSOT ratchet); copies the group used are removed (architecture §6)

## 6. Risks and answers
| Risk | Answer |
|---|---|
| A business rule is lost in the rewrite | both-engine acceptance tests + black-box live suite + DATA_PROOF on every switch; route back on failure |
| Two services cost more during the move | `min-instances 0` on both; legacy only receives forwarded ops; deleted in phase 9 |
| Forwarded ops are slower (one extra hop) | only until their group is ported; the officer path moves first |
| The new service cannot be created by the existing deploy identity | first-deploy step in phase 1; if the role is missing the owner grants it once in Cloud Shell (script provided) |
| Long migration blocks features | legacy freeze is bug-fix only; a needed feature is built in the core first |

## 7. Open input from the owner
- Peak simultaneous users at go-live (sets the load-test target in phase 1–2).
