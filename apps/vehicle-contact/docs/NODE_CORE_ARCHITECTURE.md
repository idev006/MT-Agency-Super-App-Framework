# Node core architecture (VC-ADR-046)

Owner (2026-11-27): proposed FE `[UI, view, controller, stub]` ⇄ BE `[stub, facade, business logic, data access, database]` and asked
for the most suitable form, studied from reliable sources. This file is the target structure of `backend/core` and the rules CI
will enforce. The migration steps are in [NODE_CORE_MIGRATION_PLAN.md](NODE_CORE_MIGRATION_PLAN.md).

## 1. Choice: multi-tier, Clean Architecture inside each tier, contract-first between tiers

| Source | What we take from it |
|---|---|
| Microsoft Azure Architecture Center, *N-tier architecture style* | **Layers are logical, tiers are physical**; several layers may share one tier. Each layer calls only layers below it. → the owner's FE/BE split = tiers; the boxes inside = layers. |
| Robert C. Martin, *The Clean Architecture* (2012) | **Dependency Rule:** source dependencies point **inwards** only; inner circles (policies) know nothing of outer ones (mechanisms). → business logic never imports HTTP, Firestore or Drive code. |
| Alistair Cockburn, *Hexagonal Architecture / Ports and Adapters* (2005) | The core defines **ports**; technology sits in **adapters** plugged into them — driving (HTTP, scheduler) and driven (Firestore, photo bridge). → swap the GAS-shaped REST store for the Firestore Node SDK without touching use cases. |
| Martin Fowler, *Strangler Fig Application*; Azure / AWS *Strangler fig pattern* | Grow the new system around the old one and move functions one by one (transform → coexist → eliminate) instead of a big-bang rewrite. → `p6vc-core` front door + routing table + legacy fallback. |
| Google Cloud, *Cloud Run maximum concurrent requests* | Default 80 requests per instance; set 1 **only** when the code cannot handle parallel requests; one instance gives **no isolation** between concurrent requests. → the core must be async and keep **no per-request state in module globals**. |
| Simon Brown, *C4 model* | Describe the system at four zoom levels: context, containers, components, code. → the views below. |

The owner's proposal maps onto this one-to-one; the two refinements are (a) business logic split into **application** (use-case
order: permission, transaction, audit) and **domain** (pure rules, no I/O — testable alone, reusable by the web app), and
(b) data access behind a **port** defined by the core, so dependencies point inwards rather than strictly downwards.

## 2. C4 level 1–2 — context and containers
```mermaid
flowchart LR
  officer([Police officer / admin]) --> spa
  registrant([Vehicle owner registering]) --> spa
  spa["Web app (Vue SPA)<br/>GitHub Pages"] -- "JSON /api/frontend" --> core
  tools["Live suite, uptime check,<br/>admin scripts"] -- "JSON /" --> core
  core["p6vc-core (Node 22, Cloud Run)<br/>front door + ported use cases"] -- "not-yet-ported ops" --> legacy["p6vc-api (legacy engine)<br/>removed in phase 9"]
  core --> fs[(Firestore)]
  legacy --> fs
  core -- "signed upload/read/trash" --> bridge["GAS photo bridge"] --> drive[(Google Drive)]
  sched["Cloud Scheduler"] --> core
```

## 3. C4 level 3 — layers inside each container
```
WEB APP (frontend/src)                         CORE (backend/core/src)
 UI          components/, pages/                http/         driving adapter: server, /api/frontend gateway, /   (= BE stub)
 View        views/, layouts/, router/          facade/       64 operations: route, DTO, permission, envelope     (= facade)
 Controller  features/ (composables), stores/   application/  use cases, one folder per operation group           (= business logic: flow)
 Application application/ (FE use cases)        domain/       pure rules (moved from backend/gas/src/domain, ph.9)(= business logic: rules)
 Domain      domain/ (FE rules)                 ports/        Store, MediaStore, Clock, Ids, Hash — interfaces only
 Stub        infrastructure/api + repositories  adapters/     driven: firestore-store, media-bridge-client, legacy-client (= data access)
                   ⇅  contracts/ (api-inventory, DTO, permissions, trusted endpoints) — one source for both tiers
```

## 4. Rules (CI-checked from phase 2)
1. **Dependency Rule** (import graph test, same technique as `scripts/gen-system-maps.mjs`):
   `domain` imports nothing outside `domain`; `application` imports only `domain` and `ports`; `facade` imports `application`,
   `domain`, contracts; only `adapters` and `http` may import Node built-ins for I/O, `fetch`, or `@google-cloud/*`;
   `http` composes everything (composition root). A wrong arrow fails CI.
2. **Async all the way:** ports return promises; no sync shim (`sync-fetch.mjs` is legacy only).
3. **Concurrency-safe:** no per-request data in module-level variables; process caches only for read-mostly data with a TTL
   (log policy 60 s, reference data) and keyed by value, never by request.
4. **Cross-cutting concerns as decorators on ports** (Log Manager on the Store port, print state), not inside use cases.
5. **Contract-first:** the API list, DTO fields and permissions come from `contracts/`; the web-app stub is generated from them
   after the backend move (phase 9+), replacing hand-written repositories.
6. **One operation group per folder** in `application/` (officer path, auth, registration, vehicles+QR, changes, admin) — files
   stay small without a line cap.

## 5. Sources
- Microsoft Azure Architecture Center — N-tier architecture style: https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/n-tier
- Robert C. Martin — The Clean Architecture (2012): https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
- Alistair Cockburn — Hexagonal Architecture: https://alistaircockburn.com/Articles/Hexagonal-Architecture
- Microsoft — Strangler Fig pattern: https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig
- AWS Prescriptive Guidance — Strangler fig pattern: https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/strangler-fig.html
- Google Cloud — Cloud Run maximum concurrent requests: https://docs.cloud.google.com/run/docs/about-concurrency
- Simon Brown — The C4 model: https://c4model.com/
