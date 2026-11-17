# GAS Backend API — Evidence-based Design Pattern Review

**Review ID:** MT-GAS-REV-001  
**Date:** 2026-11-17  
**Reviewed baseline:** [MT Master GAS Backend API Blueprint v1.2.0](../MASTER_GAS_BACKEND_API_BLUEPRINT.md)  
**Review status:** **ARCHITECTURAL REVIEW COMPLETED / IMPLEMENTATION NOT TESTED**  
**Owner/approval:** Repo owner supplied mandatory-architecture direction; this technical review does not approve production deployment or security posture.

## 1. Scope and sources

Review of the **existing** mandatory GAS Backend API Blueprint against:
- [Google Apps Script Web Apps](https://developers.google.com/apps-script/guides/web) — supported ingress `doGet(e)`/`doPost(e)`, `HtmlOutput`/`TextOutput`, and event parameters.
- [Google Apps Script Best Practices](https://developers.google.com/apps-script/guides/support/best-practices) — service-call minimization, batch operations, caching.
- [Google Apps Script JDBC](https://developers.google.com/apps-script/guides/jdbc) — supported external database connection patterns and networking.
- [Google Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas) and [LockService](https://developers.google.com/apps-script/reference/lock/lock-service) — execution/concurrency constraints.
- [AWS Hexagonal Architecture Pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/hexagonal-architecture.html) and [AWS Hexagonal Best Practices](https://docs.aws.amazon.com/prescriptive-guidance/latest/hexagonal-architectures/best-practices.html) — ports, adapters, isolation, testability and abstraction overhead.

**Evidence categories:** "Platform fact" means directly documented by Google; "Pattern recommendation" means architectural judgment informed by AWS, not a Google requirement; "Project governance" means a mandatory rule imposed by this repository's owner.

## 2. Findings and corrective recommendations

| ID | Priority | Observation in v1.2.0 | Decision / corrective action | Evidence |
|---|---|---|---|---|
| DP-01 | HIGH | API Layer is mandatory but responsibilities could imply that it always verifies identity safely on GAS alone | Preserve API Layer; require tested trusted identity enforcement, direct-endpoint bypass defense and documented `executeAs`/access settings; a BFF alone does not seal an openly callable owner-privileged GAS URL | Google Web Apps |
| DP-02 | HIGH | Existing baseline sometimes describes all repositories as mandatory for all implementations | Repository abstraction mandatory **when persistence is used**; for pure integration services use an application/domain-owned provider port with an adapter. No empty persistence/repository module | AWS hexagonal guidance |
| DP-03 | HIGH | Folder checks only: no dependency import/contract/security enforcement | Label them **structure checks only**; PR and release must separately prove boundary rules, DTO/contract tests and direct-GAS access denial | Local `scripts/validate-ssot.mjs` inspection |
| DP-04 | HIGH | GAS Data-store portability could be mistaken for arbitrary direct driver connectivity | Specify verified supported JDBC or authenticated HTTPS/gateway per provider. Google JDBC guide documents PostgreSQL, MySQL, Microsoft SQL Server, Oracle and Cloud SQL, subject to configuration | Google JDBC |
| DP-05 | MEDIUM | Potential excessive use of patterns for small apps | Mandatory small core: boundary separation, route/controller, use case, domain port, adapter, composition root, DTO and error policy. Strategy, Factory, cache, CQRS, outbox and saga conditional | AWS hexagonal tradeoffs |
| DP-06 | MEDIUM | Versioned API envelope is logical, not native HTTP framework behavior | Explicitly note `doGet/doPost` capabilities; test redirect, headers, CORS, client WebViews, and avoid assuming PATCH/PUT/DELETE or controllable status/header support | Google Web Apps |
| DP-07 | MEDIUM | Cross-store atomicity not available simply by adding a pattern | Unit of Work only where underlying adapter truly supports transactions; for Sheets use bounded locks and explicit compensation/reconciliation | Google LockService |
| DP-08 | MEDIUM | Unbounded or chatty Sheets/HTTP calls may hit GAS limits | Batch bounded reads/writes, measure service calls, quota budgeting, checkpoint large jobs with recovery | Google Best Practices / Quotas |
| DP-09 | MEDIUM | Source structure can be mistaken for GAS deployment structure | Source may be modular but GAS execution requires compatible bundling and global entrypoints; CI artifact must be exercised separately from Git directory names | GAS Web Apps / clasp |
| DP-10 | MEDIUM | API security and datastore security can become implicit | Every client operation requires explicit authorization at trusted boundary; every provider adapter requires scoped credentials, failure tests and secret handling | Google Web Apps + repo Security Standard |

## 3. Reviewed pattern decision matrix

| Pattern | Policy | Why / trigger | Minimum test |
|---|---|---|---|
| Hexagonal / Ports & Adapters | **REQUIRED architecture** | Isolation and provider-agnostic domain | Domain-use-case tests with fake adapters |
| Thin `doGet/doPost` entrypoint | **REQUIRED for GAS Web Apps** | Separate GAS runtime from API contracts | Entry invokes API dispatch only |
| API Router + Controller | **REQUIRED for client-serving GAS** | Versioned allowlisted operations | Unknown operation/version rejected |
| Request/Response DTO + Mapper | **REQUIRED for client-serving GAS** | Prevent schema/PII leakage | Valid/invalid payload + output allowlist |
| Application Service / Use Case | **REQUIRED** | Testable orchestration | Fake port scenario test |
| Dependency Inversion + Composition Root | **REQUIRED** | No provider imports in domain | Dependency boundary check |
| Repository | **CONDITIONAL REQUIRED if persistence exists** | Storage-independent data access | Swap fake/real adapter contract |
| Outbound API Adapter | **CONDITIONAL REQUIRED if external API used** | Encapsulate UrlFetch/JDBC/HTTP | Timeout/error/auth tests |
| AuthN/AuthZ policy enforcement | **REQUIRED for protected operations** | Privilege boundaries | Denied scope + direct endpoint bypass |
| Strategy / Factory | **OPTIONAL / justify** | Alternative implementations or configuration | Selected strategy test |
| Cache-aside | **OPTIONAL / justify** | Measured repeated reads and safe TTL | Isolation + invalidation tests |
| Idempotency | **REQUIRED for retryable mutations** | Duplicate prevention | Repeated request, single effect |
| Unit of Work | **CONDITIONAL** | True transactional datastore / bounded consistent operations | Atomicity or compensation test |
| CQRS / Saga / Outbox | **OPTIONAL / advanced** | Proven scale/multi-step distributed consistency requirement | Durable recovery/duplicate tests |
| Gateway / BFF | **SECURITY-CONDITIONAL** | Real HTTP semantics, client auth/CORS, sensitive endpoints | Bypass and token/permission tests |

A **mandatory** pattern is a project architecture rule, not a claim that Google officially prescribes the pattern.

## 4. Reference request flow and dependency rules

```text
Client
  -> (Trusted Gateway / BFF if needed)
  -> GAS Runtime Adapter doPost(e)/doGet(e)
  -> API Router / Controller / Validation / Auth Context
  -> Application Use Case
  -> Domain Port (store or provider contract)
  <- Infrastructure Adapter implements port
  -> Sheets / SQL/JDBC / HTTPS DB API / Drive / External Service
```

**Dependency direction:** API depends on use cases and DTOs; application depends on domain contracts; infrastructure depends on the ports it implements; domain depends on neither API nor infrastructure. The diagram's request arrows are **not** source import arrows.

## 5. Practical examples

- **Google Sheets data store:** `VehicleRepository` port -> `SheetsVehicleRepository` adapter using `SpreadsheetApp`. Requires row schema, batched calls, concurrent-write policy, formula-injection defense.
- **SQL database:** same `VehicleRepository` port -> `JdbcVehicleRepository` only where Google JDBC supports and connectivity is verified, or `HttpVehicleRepository` via authenticated API. SQL syntax and credentials remain outside domain.
- **Pure external notification API with no database:** `SendNotificationPort` -> `HttpNotificationAdapter`; **no empty Repository required**.
- **Multiple stores:** each bounded data owner and adapter named explicitly; document cross-store consistency and any compensating actions.

## 6. Adoption and evidence gates

1. A new client-serving GAS app MUST record `GAS_API_SPEC.md`, `GAS_DATA_MODEL.md` or an explicit no-persistence rationale, `GAS_SECURITY_AND_PRIVACY.md`, and `GAS_TEST_EVIDENCE.md`.
2. Architecture review MUST inspect real source dependencies, not only folder names.
3. PR checks SHOULD add lint/type/import-boundary checks, unit tests and API contract tests once a GAS backend is present. Existing CI currently checks folder structure only; **do not claim complete design-pattern enforcement**.
4. Staging tests MUST verify Google deployment execution identity, direct-route bypass, real client CORS/redirect behavior, authorized datastore access, failure modes, concurrency and quotas.
5. Production release requires independent security/privacy approvals and an evidence-based roll-forward/rollback plan.

## 7. Recommendations accepted for next blueprint revision

- Clarify Repository as conditional on persistence and external service Port/Adapter mandatory when an integration exists.
- Clarify JDBC includes supported PostgreSQL connections; forbid blanket statements that all direct DB connections are impossible.
- Explicitly record this matrix as the source of mandatory-versus-conditional pattern classification.
- Keep GAS API ingress constraints and security boundary prominent.
- Keep compatibility with approved app separation: `apps/<app-id>/backend/gas/` only; no shared app-specific logic in `blueprint/`.
- CI currently enforces structure rather than contracts; add deeper gates as executable code appears.

**Review verdict:** **Architecture direction suitable with clarifications; no proof of implementation correctness or production safety.**
