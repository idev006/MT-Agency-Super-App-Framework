# P6 Vehicle Contact — Architecture SSOT (canonical, living)

**Document:** P6VC-ARCH-001 | **Date:** 2026-11-22 (Asia/Bangkok) | **Status:** LIVING ARCHITECTURE REFERENCE — navigation + design authority, **not** a release/security approval.
**Markers:** backend `0.9.2` (published Web App **V49**, `releaseChannel: development`) · frontend `0.8.0` · source baseline `main` @ `248a3a6` (PR #122) · **56 source `.js` modules → 57 `.gs`** (incl. schema) · **56 v1 operations** (55 DTO + `system.health`; 50 protected, 6 public).
**Companions:** [CODE_MAP](CODE_MAP_20261121.md) (module/operation tables) · [E1 datastore design](E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121.md) · [VC-ADR-019](DECISION_LOG.md) · [F1 store-port contract](../backend/gas/tests/store-port-contract.test.mjs) · [F2 Firestore evidence](BACKEND_FIRESTORE_ADAPTER_F2_EVIDENCE_20261122.md) · [Frontend architecture](FRONTEND_ARCHITECTURE.md) · [2026-11-17 conformance review](GAS_BACKEND_ARCHITECTURE_CONFORMANCE_20261117.md) (historical, pre-port; see §10).

This document answers the owner's question: *what architecture does the Backend/API use, does each DB engine implement one common interface/design pattern, and how do self-managed layers interoperate to a common standard — grounded in world-class sources?*

---

## 1. Architectural style — Hexagonal / Ports & Adapters / Clean layers

The backend is a **Hexagonal (Ports & Adapters)** application (Cockburn, 2005) organised as **Clean Architecture** concentric layers (Martin, 2017). The **dependency rule** points inward: source-code dependencies only ever point from outer mechanisms toward inner policy. `domain` knows nothing about `api`, `infrastructure`, or GAS globals; `application` orchestrates `domain` and depends only on **ports**; `infrastructure` implements ports; `composition` is the single place that wires concrete adapters into the inner layers.

```
            ┌─────────────────────────────────────────────┐
            │  entrypoints (GAS doPost/doGet)              │  outermost: transport trigger
            │   ┌─────────────────────────────────────┐   │
            │   │ api (Router, Controller, DTO, RBAC)  │   │  transport / contract
            │   │   ┌─────────────────────────────┐   │   │
            │   │   │ application (use cases)      │   │   │  orchestration
            │   │   │   ┌─────────────────────┐   │   │   │
            │   │   │   │ domain (policy/ports)│   │   │   │  innermost: pure rules
            │   │   │   └─────────────────────┘   │   │   │
            │   │   └─────────────────────────────┘   │   │
            │   └─────────────────────────────────────┘   │
            │  infrastructure (Sheets/Firestore/Drive/…)  │  adapters implement ports
            └─────────────────────────────────────────────┘
                 composition/Container.js wires it all (DI root)
```

## 2. The six self-managed GAS layers

Source root `apps/vehicle-contact/backend/gas/src/`; each `.js` mirrors one flattened `.gs` (build ≤800 lines/module). Layers are enforced by the build (`allowedFolders`).

| Layer | Responsibility | Depends on |
| --- | --- | --- |
| `entrypoints` | GAS `doPost`/`doGet`; delegates to `createApplication().dispatch` | composition |
| `api` | Transport + contract: route allowlist, envelope/DTO validation, **server-authoritative RBAC**, response envelope | application, domain |
| `application` | Use-case orchestration (the five `create*Operations`), `SessionService`, pagination, schema-sync, migration planning/journal | domain + **ports** |
| `domain` | Pure policy (lifecycle, registration, photo slots, QR token, session/security-event), **ports** (`SchemaRepository`), reference catalog | nothing outer |
| `infrastructure` | Adapters: Sheets/Firestore persistence, Drive media, GAS crypto, reference seed, migrations, bootstrap | domain ports |
| `composition` | `Container.createApplication(deps)` — the **DI root**; builds adapters, injects into controller; feature-flag gate `VEHICLE_API_ENABLED` | all (only place allowed to) |

**Interop invariant:** the client never supplies role/permission/owner identity. RBAC and ownership are resolved server-side from the session (`SessionService.ROLE_PERMISSIONS` + `OperationController.OPERATION_PERMISSIONS`), fail-closed.

## 3. The common DB interface — one 8-method store port (the "black box")

**Yes: every DB engine implements one common interface.** The runtime API (56 ops) and `SessionService` depend **only** on an 8-method **store port**, injected at the composition root. No use-case imports a Sheets- or Firestore-specific symbol.

| Method | Contract |
| --- | --- |
| `one(name,filter)` | exactly-one equality match; `null` if absent; `DUPLICATE_KEY` if >1 (fail-closed) |
| `list(name,filter?,limit?)` | oldest-first insertion window; `INVALID_LIMIT` outside 1..5000 |
| `listNewest(name,filter?,limit?)` | newest-first window |
| `insert(name,data)` | required-field validation; primary-key uniqueness (`DUPLICATE_KEY`) |
| `update(name,filter,patch)` | exactly-one; `INVALID_PATCH` on unknown keys; `NOT_FOUND`/`DUPLICATE_KEY` |
| `remove(name,filter)` | exactly-one; returns `true` |
| `withLock(fn)` | bounded critical section for conflicting writes |
| `sequence(fn)` | transaction seam (Sheets: no-op; **Firestore: real ACID transaction**) |

`name` = a logical table in `DATABASE_SCHEMA`; records = plain objects keyed by canonical column; `filter` = equality conjunction.

**Executable proof (F1):** [store-port-contract.test.mjs](../backend/gas/tests/store-port-contract.test.mjs) exports `runStorePortContract` — an **adapter-agnostic** suite. The **Sheets adapter**, an **in-memory reference**, and the **Firestore adapter (F2)** all pass the *identical* suite. The acceptance harness runs the FULL real Router/Controller/UseCases/SessionService on an in-memory store, proving the engine is swappable without touching use-cases.

> Honest nuance: the port is **table-oriented** (keyed by logical table name), not yet a set of **business-facing repository ports per aggregate**. The 2026-11-17 conformance review flagged this; the generic port formalises the common interface (owner's "one interface per DB" direction) while business-facing ports remain a future refinement (§10).

## 4. Design-pattern catalog (where used → world-class source)

| Pattern | Where in this codebase | Source |
| --- | --- | --- |
| **Ports & Adapters / Hexagonal** | store port + Sheets/Firestore/Drive/GasSecurity adapters; `domain/ports` | Cockburn (2005) |
| **Repository** | `SheetStore`, `SheetsVehicleRepository`, `SheetsVehicleReadRepository`, `QrReadRepository`, `SheetsSchemaRepository` | Fowler, PoEAA (2002) |
| **Adapter** | `SheetStore`/`FirestoreStore` (port→engine), `DrivePhotos` (port→Drive), `GasSecurity` (port→GAS crypto) | GoF (1994) |
| **Strategy** | interchangeable persistence backends behind one port; selection flag `VEHICLE_PERSISTENCE_BACKEND` (**F3**, forthcoming) | GoF (1994) |
| **Dependency Injection / Inversion** | `Container.createApplication(deps)` builds + injects store/security/sessions/drivePhotos; inner layers depend on abstractions | Martin, DIP / Clean Architecture (2017) |
| **Unit of Work / transaction seam** | `withLock` (Sheets bounded critical section); `sequence` (**Firestore real transaction**); **B2b durable journaling** (PREPARED→APPLIED/ROLLED_BACK/RECOVERY_REQUIRED + compensation + idempotent replay) for `registrations.review` / `users.assignRoles` | Fowler, PoEAA (2002) |
| **Anti-Corruption Layer** | Cloudflare Worker `FRONTEND_PAYLOAD_FIELDS` allowlist + DTO validation + envelope translation between FE and GAS | Evans, DDD (2003) |
| **DTO / Service envelope** | `apiSuccess`/`apiFailure` `{ok,data,error,requestId}`; per-op `DTO_SCHEMAS` allowlist | Fowler, PoEAA (2002) |

**Sheets concurrency discipline (binding, do not overengineer):** Sheets is **not an RDBMS** — ordinary writes are sequential GAS calls, **no SQL rollback**. Use `withLock(fn)` only for bounded critical sections (uniqueness, quota, lifecycle, permissions, QR, role assignment, retention); keep slow Drive uploads **outside** locks; `SpreadsheetApp.flush()` before release. Multi-row partial failure is recovered by **business-level journal + reconciliation (B2/B2b)**, not a fictitious transaction. The **Firestore adapter upgrades `sequence` to real ACID** — that is the strategic reason for the migration (VC-ADR-019), not a licence to add a distributed-transaction framework to Sheets.

## 5. Layer-interop standards (the common contract every layer honours)

1. **Request envelope:** `{apiVersion,group,action,payload,requestId,sessionToken?}` → **response** `{ok,data,error,requestId}`.
2. **DTO allowlist:** `OperationPayloadValidator.DTO_SCHEMAS` per op; unknown fields rejected.
3. **Error catalog:** `contracts/error-catalog.v1.json` canonical codes (fail-closed).
4. **Pagination:** `contracts/list-pagination.v1.json` — `page`/`pageSize` envelope, server-capped (legacy `limit` array tolerated).
5. **RBAC:** `contracts/api-permissions.v1.json` + `OPERATION_PERMISSIONS` + `ROLE_PERMISSIONS`; 5 roles × 50 protected ops = **250** matrix checks.
6. **Data dictionary:** `schema/database.schema.json` — the **DB-agnostic logical model** (25 entities, canonical columns, primary keys, classification); physical Sheets tabs and Firestore collections both project from it. Logical relationship view: [ER diagram](DATA_MODEL_ER_DIAGRAM_20261122.md); derived physical projections: [Sheets](GAS_DATA_MODEL.md) · [Firestore](FIRESTORE_PHYSICAL_MAPPING_20261122.md).
7. **Synchronized count gates** (must move together when adding an op): `GroupRoutes` ↔ `DTO_SCHEMAS` ↔ `OperationController` count gate ↔ `api-inventory` (56) ↔ `api-permissions` ↔ `ApiInventoryGate` (56) ↔ `validate-usecase-ssot.mjs` (56, 20 UCs) ↔ Worker allowlist ↔ count-based tests.

## 6. Persistence black-box architecture (Sheets + Firestore)

- **Runtime today:** `SheetStore` (one bounded snapshot/read, text-preserving writes, lock/invalidation). System of record **V49 / 0.9.2**.
- **F2 delivered (offline):** [FirestoreStore.js](../backend/gas/src/infrastructure/persistence/firestore/FirestoreStore.js) — table→collection, record→document (doc id = primary key), persisted `_seq` ordering, `sequence`→real transaction. Passes the identical F1 contract via an in-memory fake gateway. **Bundled but not wired** (Container still `createSheetStore`).
- **F3 (next):** composition-root flag selects the adapter; dual-write journal → checksum backfill → cutover → rollback window.
- **F4 (owner infra):** live REST gateway via `UrlFetchApp` + service-account OAuth; GCP project + Firestore DB (Bangkok `asia-southeast3`) + creds in gitignored `.env`; **independent document read-back audit** after each live suite.
- **Verification directive (owner, binding):** every API call must be confirmed against the **actually-persisted data** (Sheets gviz audit / Firestore read-back) — API `OK` ≠ data proof.
- **Human gate (#55):** new-store PDPA + security review — not self-approvable.

## 7. Frontend architecture (mirrors hexagonal, feature-sliced)

Vue 3 + Pinia + Vue Router, feature-sliced: `domain` (pure FE rules) → `application/<area>` (orchestration) → `features/<area>` (UI) → `infrastructure/<area>` (API adapters; `infrastructure/api` = Worker transport ACL). The FE matches the backend v1 envelope/errors/pagination via its API adapter and never asserts authority client-side. Detail: [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md), [component patterns](FRONTEND_COMPONENT_ARCHITECTURE_PATTERNS.md). UI/UX density + WCAG AA directives: [P13 evidence](FRONTEND_UI_DENSITY_P13_EVIDENCE_20261122.md), [contrast/touch evidence](FRONTEND_A11Y_CONTRAST_TOUCH_EVIDENCE_20261122.md).

## 8. World-class references

- **Alistair Cockburn** — *Hexagonal Architecture* (2005): ports & adapters, isolating the application from transport/storage.
- **Robert C. Martin** — *Clean Architecture* (2017) + **SOLID** (esp. Dependency Inversion): the inward dependency rule, composition root.
- **Martin Fowler** — *Patterns of Enterprise Application Architecture* (2002): **Repository**, **Unit of Work**, **DTO**, Identity Map.
- **Eric Evans** — *Domain-Driven Design* (2003): **Anti-Corruption Layer**, bounded contexts, ubiquitous language (the canonical data dictionary).
- **Gamma, Helm, Johnson, Vlissides (GoF)** — *Design Patterns* (1994): **Adapter**, **Strategy**, **Factory**.

## 9. Where do I change X?

See [CODE_MAP §9](CODE_MAP_20261121.md). Short version: add/modify an op → use-case module + **all** synchronized gates (§5.7); change a permission → `OPERATION_PERMISSIONS` + `ROLE_PERMISSIONS` + `api-permissions.v1.json` + RBAC matrix; change persistence behavior → the relevant adapter behind the **store port** (never a use-case); version label → `SystemGroup.backendVersion` (guarded === package.json).

## 10. Honest boundaries / superseded markers

- The [2026-11-17 conformance review](GAS_BACKEND_ARCHITECTURE_CONFORMANCE_20261117.md) is a **historical point-in-time** record (50 operations, pre-store-port, "business-facing ports gap", "no UoW for Sheets"). Its **Sheets concurrency discipline remains binding**; its operation count and "no common port" findings are **superseded** by F1 (8-method port, 56 ops) and B2b (durable journaling). Do not treat it as the current state.
- The store port is table-oriented; **business-facing repository ports per aggregate** are a future refinement, not yet implemented.
- Firestore is **offline-proven only** (F2); live REST/OAuth, provisioning, backfill, cutover (F3/F4) and the #55 human PDPA/security gate are open.
- Architecture conformance ≠ security certification. PDPA/Security/UAT/Release ratification, ADR ratifications and physical-device acceptance remain **human gates** (never self-approved by an assistant).