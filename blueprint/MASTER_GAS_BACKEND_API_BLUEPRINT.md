# MT Master GAS Backend API Blueprint — Architecture & Design Patterns

**Document ID:** MT-GAS-MBP-001  
**Version:** 1.2.1  
**Effective baseline:** 2026-11-17  
**Decision status:** **MANDATORY architecture direction as instructed by the repository owner; NOT a production/security/legal release approval**  
**Scope:** Every new or materially modified Google Apps Script (GAS) backend/API within `apps/<app-id>/backend/gas/` of this repository.

> **Architectural rule:** One central GAS Backend Master Blueprint; many independent app-specific GAS backends. Each implementation MUST comply with this document. A project-specific alternative requires a reviewed Architecture Decision Record (ADR), documented justification, tests and explicit approval. No project-specific document may silently override a central rule.

## 1. Purpose and relationship to other blueprints

- [MT Web Application Master Blueprint](MASTER_WEB_APP_BLUEPRINT.md) governs browser/client-side web apps and their independent API adapters.
- This document governs GAS backend architecture, server-side behavior, GAS platform constraints, security boundaries, persistence adapters and deployment.
- [Platform/Identity Blueprint](platform/MASTER_BLUEPRINT.md) covers proposed shared identity/SSO/authorization governance; its draft status does not grant a GAS service permission to trust client-supplied roles.
- [API Integration Standard](standards/API_INTEGRATION_STANDARD.md), [Security Standard](standards/SECURITY_STANDARD.md) and [Testing & Deployment Standard](standards/TESTING_AND_DEPLOYMENT.md) continue to apply.
- `apps/<app-id>/docs/` contains app-specific API specifications, privacy/legal approvals, schema, test evidence, data retention, and service ownership. App code lives under its app root, **never** in `blueprint/`.
- Source files committed to GitHub are canonical. Runtime deployments, generated bundles, secrets and credentials are not canonical source.

**Applicability rule:** Apps that do not use GAS are not required to create a GAS backend. If an app uses GAS as an API/backend, all provisions marked MUST apply unless an approved ADR states a narrower, secure and tested alternative. Existing standalone prototypes must be labeled POC and given an explicit migration/compliance plan before being treated as production.

## 2. Architecture principles (MUST)

1. **Single Responsibility:** GAS entry point only bridges the runtime; the mandatory API Layer exposes contracts and routes clients to use cases; application coordinates; domain owns business rules; infrastructure communicates with storage and external systems.
2. **Dependency Inversion / Ports & Adapters:** Domain has no dependency on `SpreadsheetApp`, `DriveApp`, `UrlFetchApp`, `PropertiesService`, `ContentService`, or transport-specific event objects. Infrastructure implements ports owned by Domain/Application.
3. **API Provider Independence:** Replace an infrastructure adapter without rewriting domain use cases when the declared port contract remains valid.
4. **Per-app isolation:** Each app owns its GAS service, data-access adapters, configuration, tests and release cycle. Shared libraries are approved, versioned and app-neutral; no hidden cross-app database or runtime coupling.
5. **Security first:** Every public ingress is untrusted. Default deny; validate identity, caller, scope and action at a trusted enforcement boundary. Publishing an Apps Script URL does not make it an authenticated API.
6. **Explicit errors & contracts:** Validate request shape/size and normalize data; stable operation/version, DTO schema, success/failure codes and correlation ID; never leak stack traces, secrets or private data.
7. **Evidence-gated delivery:** Static checks do not substitute for integration, permissions, quota/concurrency, deployment and field tests.

## 3. Mandatory API Layer and layered architecture

Every GAS Backend that serves clients **MUST implement a dedicated API Layer**, separate from the GAS runtime entry points, application use cases, domain and infrastructure. This layer is a logical and testable module, **not a claim that Apps Script supports a full HTTP server**.

```text
Web / Mobile / Other Authorized Client
     |  client-owned API adapter
     v
Trusted Gateway / BFF where security, OAuth, CORS or HTTP semantics require it
     |
     v
GAS Runtime Entry Points: doGet(e) / doPost(e)
     |
     v
API Layer: Versioned Router → Request Parser/Validation
           → Auth Context & Authorization Enforcement
           → API Controller → Response Mapper / Error Envelope
     |
     v
Application Layer: Use Cases / Orchestration
     |
     v
Domain Layer: Entities / Policies / Repository & Storage Ports
     ^
     | implementations (dependency inversion)
Infrastructure: SQL/NoSQL/Sheets/Drive/HTTP Adapters
     |
     v
Authorized Database / Storage / External Service
```

**Diagram shows request flow, not source dependency direction.** Domain and Application must not import GAS APIs, HTTP request objects, API controllers or infrastructure implementations. The Composition Root wires use cases to port implementations.

### Required API Layer responsibilities

1. **Stable public contract:** document allowed operations, client types, `apiVersion`, payload and response DTOs, pagination and deprecation in the app's `GAS_API_SPEC.md`.
2. **Routing and controller dispatch:** explicit allowlist of `(apiVersion, operation)` to an API controller; no `eval`, dynamic global-function lookup, or arbitrary provider query execution.
3. **Request boundary validation:** parse allowed content type, enforce supported version, bounded input size, schemas, required fields and normalized request identifiers.
4. **Authentication and authorization boundary:** accept only identity/context proven at a trusted boundary. Ensure every operation has a verified permission and resource-scope policy. A gateway is not sufficient if clients can bypass it to a privileged GAS URL.
5. **Controller → use case mapping:** each controller invokes an application use case through an injected interface, not through `SpreadsheetApp`, `UrlFetchApp`, storage SDKs or business logic inside `doPost`.
6. **Response mapping:** map domain/application result into explicit documented DTO and sanitized error envelope; do not disclose private internals, credentials, stack traces or privileged identifiers.
7. **Observability:** correlation IDs, safe outcome/latency logging, error categories and idempotency handling for retryable mutations, following approved privacy policy.
8. **Contract tests:** unknown operation/version, malformed/oversized payload, permission-denied and direct-GAS endpoint bypass, DTO compatibility and safe failure responses.

For internal-only GAS automations with **no client-facing API**, an approved ADR may replace public routing with a typed internal service interface while retaining separation and security requirements.

### Layer responsibilities

| Layer | MUST own | MUST NOT own |
|---|---|---|
| GAS Runtime Entry Points | Only `doGet/doPost` / approved invocation bridge to the API Layer; minimal event conversion | Routing rules, business logic, storage operations, security assumptions |
| **API Layer** | Versioned routes, DTO validation/mapping, API controllers, verified security context and policy enforcement, consistent responses | Business rules, direct data-store/provider access, client-supplied trust assumptions |
| Application | Use-case orchestration, business transaction coordination, idempotency policy | GAS globals or HTTP transport semantics |
| Domain | Business rules, entities, value objects, repository/storage ports | API DTOs, Google services, provider credentials or adapters |
| Infrastructure | Implement ports via database/Sheets/Drive/outbound-HTTP adapters, persistence mapping and bounded retries | Granting permissions or modifying domain invariants |
| Composition Root | Bind API controllers, use cases, ports and adapters per environment | Committed production secrets |

**MUST NOT:** Call `SpreadsheetApp`, `DriveApp`, `UrlFetchApp` or database providers from API controllers, entry points, application or domain modules. Only the infrastructure adapter performs the provider interaction. Security enforcement must occur at a trusted boundary, with explicit direct-endpoint threat testing.

## 4. Required design patterns

**Review authority:** [Evidence-based GAS Design Pattern Review and decision matrix](architecture/GAS_DESIGN_PATTERN_REVIEW_2026-11-17.md) classifies which patterns are required, conditional, or optional. The table is a repository engineering standard, not a statement that Google requires those patterns.


**Required for every real backend**
- **Ports & Adapters / Dependency Inversion:** domain/application-owned contracts with infrastructure implementations.
- **Repository Pattern (required when persistence exists):** persistence operations such as `findById`, `findByKey`, `save` and `listPage` separated from **any** database/storage provider, wire protocol and schema. For an API-only service without persistence, use its domain/application-owned outbound service port and adapter; never create a dummy repository.
- **Application Service / Use Case:** each exposed operation delegates to an explicit use case.
- **DTO + Mapper:** transport request/response models are independent of sheet column indexes and domain entities.
- **Composition Root / DI:** construct dependencies at the edge of the runtime, allowing test doubles.
- **Error Taxonomy:** predictable validation, authentication, authorization, not-found, conflict, dependency, quota and internal errors.
- **API Route/Controller and security policy (for client-serving GAS):** versioned allowlist, DTO validation and protected operation checks, separately testable from GAS entrypoints.

**Conditional patterns**
- **Strategy:** when the same port has multiple real implementations (Sheets, REST, database).
- **Factory:** for choosing adapters by approved environment/config.
- **Anti-corruption Layer:** when third-party API schemas are unstable or materially different.
- **Cache-aside:** only for non-sensitive/appropriately scoped data with TTL and invalidation; no implicit authorization cache.
- **Idempotency:** mandatory for retryable mutations; enforce through server-side deduplication/key ownership and expiry.
- **Unit of Work:** only if the selected datastore provides demonstrable transaction semantics; for nontransactional Sheets or multiple stores use documented bounded locks, compensation and reconciliation rather than implying atomicity.
- **Outbox/queue-like workflow:** only if a durable, testable store and recovery mechanism exist; GAS triggers alone do not guarantee exactly-once delivery.

Avoid design-pattern proliferation without a concrete use case.

## 5. Mandatory per-app source organization

```text
apps/<app-id>/
  README.md
  docs/
    GAS_API_SPEC.md                 # app contract, operations and DTOs
    GAS_DATA_MODEL.md               # chosen database/storage, schema, constraints, migration
    GAS_SECURITY_AND_PRIVACY.md     # trust model, scopes, lawful basis, retention
    GAS_TEST_EVIDENCE.md            # dated test results and deployment references
  src/
    presentation/
    application/
    domain/
    infrastructure/
      adapters/gas/                # Vue-side GAS adapter (if browser uses GAS)
  backend/
    gas/
      src/
        entrypoints/               # WebApp.gs, GAS runtime bridge only
        api/                       # mandatory client-serving API Layer
          routes/                 # versioned operation allowlist
          controllers/            # use case invocation, no business logic
          dto/                    # request/response validation & mapping
          security/               # verified auth context and authorization
          responses/              # safe success/error envelopes
        application/
          use-cases/
        domain/
          entities/
          ports/
          policies/
        infrastructure/
          persistence/           # provider-specific repository adapters
            sheets/
            sql-api/
            nosql-api/
          storage/               # Drive/object storage adapters
          external-api/
          auth/
          logging/
        composition/
      tests/
      appsscript.json
      package.json                  # if JS toolchain/build is used
      .clasp.json.example           # never include live credentials
```

**Packaging constraint:** Apps Script runtime does not provide a conventional Node/Express process or arbitrary native module loader. When using ES modules or TypeScript, compile/bundle to a GAS-compatible artifact before `clasp push`. Directory structure in Git is logical source architecture; generated deployment output must preserve function availability, including global `doGet`/`doPost`. Never assume source directory paths map to callable URL routes.

**POC exception:** Existing HTML-only QR scanner under `apps/vehicle-contact/poc/` is a client camera POC, not a GAS service. Do not create an empty GAS backend just to satisfy this document.

## 6. API Layer contract: bounded GAS transport

### Ingress limitations and routing
- Official GAS Web Apps expose `doGet(e)` and `doPost(e)` returning `HtmlOutput` or `TextOutput`; **do not claim native PATCH/PUT/DELETE handlers or arbitrary status/header control**.
- Client operations MUST pass through the dedicated **API Layer**. If routing multiple actions through POST, use an explicit **allowlisted operation name** with API version, not eval/dynamic function invocation; enforce action-specific authentication/authorization.
- GET MUST be read-only; sensitive GET URLs and query parameters must not contain tokens, phone numbers or other personal data.
- If real HTTP status codes, custom authentication headers, standard CORS preflight, high-volume REST semantics or direct OAuth token verification are essential, use a **trusted gateway/BFF** or choose a more suitable backend. Do not fake HTTP semantics in ways clients might mistake for secure behavior.
- Browser access to a GAS Web App across origins requires verified integration behavior; do not assume JSON POST works from all browsers or WebViews. Test redirect, CORS, cookies and identity in target clients.

### Recommended logical JSON envelope
Request (via approved secured transport):
```json
{
  "apiVersion": "v1",
  "operation": "vehicle.lookup",
  "requestId": "generated-opaque-id",
  "payload": { "plate": "TEST-PLATE", "province": "TEST-PROVINCE" }
}
```

Response (logical envelope; not a guarantee of HTTP status code):
```json
{
  "ok": true,
  "requestId": "generated-opaque-id",
  "data": { "found": false },
  "error": null
}
```

Error:
```json
{
  "ok": false,
  "requestId": "generated-opaque-id",
  "data": null,
  "error": { "code": "FORBIDDEN", "message": "Access denied" }
}
```

Use operation names and response schemas published in the app's `GAS_API_SPEC.md`. Protect sensitive fields and avoid using raw error messages in responses. Do not treat `ok:false` as a substitute for correct access control at ingress.

### Versioning and evolution
- Declare `apiVersion`; treat breaking field/behavior changes as contract changes.
- Typed DTO validation, maximum request size, pagination/page-size upper bounds, input normalization and output allowlists are mandatory.
- Publish deprecation/migration window per app and maintain contract tests between frontend GAS adapter, gateway and GAS service.

## 7. Security and trust-boundary requirements

**Exposure classes (must record in app security document):**
- **Private internal automation** invoked only by trusted scripts: may use least-privileged GAS runtime identity without a public Web App endpoint.
- **Restricted Workspace Web App**: may rely on Google-controlled access only if execution identity and user identity are actually verified in target domain; `Session.getActiveUser()` availability is not guaranteed in every execution mode.
- **Public-facing / cross-origin / personal-data API**: MUST have a tested trusted caller authentication and server-side authorization design. **Default requirement:** approved API Gateway/BFF enforces identity, permissions and scope and provides a protected downstream integration; a publicly callable GAS execution surface that can mutate or disclose confidential data without independently verified protection is prohibited.

Security invariants:
1. Document the Web App `access` and `executeAs` settings separately for dev, staging and production. Running as owner grants that owner's service permissions, not the client's authority; never assume request identity.
2. No static API keys, shared secrets, service-account material, OAuth refresh tokens or clasp credentials in Git, browser bundles, QR codes or URLs. All operational secrets stored in approved secret facilities with rotation/revocation.
3. No `executeAs: owner` endpoint publicly processing privileged Sheet or Drive reads/writes purely on client assertions.
4. Enforce least-privilege scopes and resource-level policies, input whitelists, anti-enumeration controls and audit logs before handling real personal data.
5. Validate any incoming identity claims server-side, preferably by a gateway using supported token libraries; do not treat unverified JWT text, email or caller-supplied role as proof.
6. Separate internal and public API operations; never expose anonymous bulk lookup, unrestricted export or sensitive logs.
7. Authenticate inbound integrations and constrain outbound `UrlFetchApp` hosts, payloads and timeouts; protect against SSRF-like arbitrary URL routing and data exfiltration.
8. Document data controller/owner, lawful basis, privacy notice, access roles, retention and deletion before production personal data. This blueprint grants no PDPA approval.
9. Log request IDs, operation, execution time and safe outcome only. Redact phone/PII, QR references, tokens, credentials, HTTP authorization, raw queries and stack traces. Restrict log viewers and retention.
10. Maintain safe behavior when quotas, gateways, Sheets or downstream APIs fail: **fail closed** for authorization and private data.

**Gateway caveat:** A gateway that alone checks the browser while a publicly accessible GAS URL still has owner-level privileges is **not sufficient**. The GAS endpoint's direct-access threat must be blocked by platform access controls or an independently verifiable service-to-service mechanism; otherwise use a backend that supports the required security posture. Security reviewer must document and test bypass attempts.

## 8. Database-agnostic persistence & storage architecture (MANDATORY)

**Core rule:** Google Apps Script is an API/application runtime, **not a prescribed database**. Every GAS backend MAY use **any appropriate, supported and authorized database or storage service**, including Google Sheets, PostgreSQL/Supabase, MySQL, SQL Server, Firestore, MongoDB-compatible services, Google Drive, Cloud Storage, or an existing authorized REST/GraphQL data service. Provider selection is an **application-specific architecture decision**, not a global default.

**Verified provider capability note (Google JDBC guide):** GAS JDBC supports configured connections to PostgreSQL and supported MySQL, SQL Server, Oracle and Cloud SQL databases, subject to deployment networking, supported drivers and authentication. This does not mean all arbitrary drivers or direct network protocols work.

**GAS connectivity caveat:** 'Any database' means **any provider reachable through an approved, technically supported integration**. GAS Web Apps do not provide arbitrary network sockets or a Node.js database runtime. Where Apps Script's documented JDBC service supports a target (and required connectivity, networking, credentials and quota controls are met), a JDBC adapter may be viable; otherwise use an authenticated HTTPS API, server-side gateway, or platform SDK actually supported in Apps Script. **Do not assume direct PostgreSQL/TCP, arbitrary npm drivers or unrestricted VPC access works.** Verify reachability, firewall/IP allowlisting, TLS, data residency, provider terms and quotas before selecting the adapter.

### 8.1 Required storage port contracts

- Domain/Application define the **provider-agnostic port** (e.g. `VehicleRepository`, `FileStoragePort`). Contracts specify domain-oriented operations, invariants, pagination, conflict/version semantics and errors, not Sheet row indexes, SQL queries, Drive paths or SDK objects.
- Infrastructure implements the selected adapter: `SheetsVehicleRepository`, `RestSqlVehicleRepository`, `FirestoreVehicleRepository`, `DriveFileStorageAdapter`, etc.
- Composition root selects the adapter using approved deployment config. Avoid user-controlled provider selection and hidden runtime switching.
- A single app MAY combine multiple stores (e.g. Sheets for configuration, PostgreSQL for transactions, Drive for files) with **explicit data ownership and consistency boundaries**. Do not duplicate authoritative records silently; cross-store writes require compensation/reconciliation plans.
- Validate DTO mapping, authorized scopes, connection failure, conflict, retry/idempotency and schema migration separately for **each adapter**. Domain/application tests MUST use fake/mock ports and MUST NOT require a live database.

### 8.2 Per-app data-store decision and controls

Document in `apps/<app-id>/docs/GAS_DATA_MODEL.md`:
1. Provider and purpose of each store; data classification, controller, source of truth and ownership.
2. Schema/collection/table/tab, identifiers, validation constraints, indexes or key strategy, migration and backup/restore.
3. AuthN/AuthZ and least-privilege credentials; secret storage and rotation; encryption in transit/at rest as applicable.
4. Expected throughput/volume, quota, concurrency limits, latency budget, availability and recovery.
5. Transaction guarantees, conflict handling, retention/deletion, audit and consistency across multiple stores.
6. Connectivity from GAS (HTTP API/gateway, supported JDBC or other tested adapter), regional compliance, and deployment/test evidence.

Choose by functional need, security posture, scale, cost and operational support; **Google Sheets is one option, not the mandatory or default backend**.

### 8.3 Google Sheets adapter-specific requirements (only if selected)

- Treat Sheets as a **tabular store**, not an ACID relational database. Record per-app scalability/data classification decision before use.
- Per tab: explicit column schema, stable headers, types, required fields, unique-key rules, status fields, version or updated timestamp, and migration path in `GAS_DATA_MODEL.md`. Never hard-code sheet columns in use cases.
- Centralize `SpreadsheetApp` usage in `infrastructure/persistence/sheets/`; define one adapter per bounded data concern.
- Prefer bounded range reads, batched `getValues/setValues` and column-index mapping initialized from schema. Avoid unbounded `getDataRange()` and per-cell loops.
- Validate writes before adapter calls; escape/sanitize untrusted strings that could be interpreted as spreadsheet formulas.
- For conflicting writes, choose a documented concurrency strategy (e.g. `LockService.getScriptLock()` plus version check and bounded wait). `getDocumentLock()` may be `null` in standalone/web-app contexts; select scope intentionally. `SpreadsheetApp.flush()` before releasing locks when required.
- A lock does **not** create a cross-sheet transaction or exactly-once delivery. Design partial failure, conflicts and reconciliation.
- Enforce paging/read caps, verified backup/restore, per-store access permissions, and test dataset separation.

### 8.4 SQL, NoSQL, REST, and object storage adapter-specific requirements

- **SQL providers:** enforce parameterized queries at the trusted database/API boundary, schema migrations, least-privilege database users, bounded pagination, transaction-aware conflict handling, and explicit connection pooling/limits in the actual server layer; GAS itself need not hold a direct DB connection.
- **NoSQL providers:** document document/key structure, query/index limits, consistency model, security rules and transactional boundaries; never trust only UI filtering.
- **HTTPS database gateways / REST / GraphQL:** use `UrlFetchApp` or a supported library in infrastructure; authenticate both caller and downstream, allowlist hosts, use safe DTO mapping and never embed privileged API keys in browser code.
- **Object/file storage:** use approved Drive or HTTPS storage adapters with scoped access, MIME/size checks, time-limited download access and retention rules. Do not assume file storage replaces a transactional record database.
- For **every provider**, prove that GAS can connect safely in the chosen execution mode, with representative integration, concurrency, error, unauthorized-access and recovery tests **before production**.

## 9. External API adapters and integration standards

- Encapsulate `UrlFetchApp` in infrastructure adapters: approved base URL and hostname allowlist, auth injection from approved secret store, bounded timeouts, error sanitization, and provider DTO mapping.
- Use explicit network and retry policy; retry only safe/idempotent operations with exponential backoff and bounded attempts. Avoid retry storms that exhaust GAS quota or create duplicate writes.
- Keep provider-specific exceptions out of domain. Map to stable dependency errors (e.g. `DEPENDENCY_TIMEOUT`, `DEPENDENCY_UNAVAILABLE`).
- Separate and document any Google Sheets API / Drive API advanced service scopes and approvals; GAS OAuth scope must be least privileged for the target operation.
- Background tasks, triggers and asynchronous batches must have checkpointing, backoff, de-duplication and an operator replay/recovery process. Triggers are not a reliable unlimited queue.

## 10. GAS quotas, performance, concurrency and resilience

- The Apps Script execution runtime is currently limited to **6 minutes per execution** (official quota page; must recheck before release). Quotas vary by account type and may change.
- Budget calls to the **selected** database, storage and external HTTP providers; batch work where supported and avoid repeated service initialization.
- Define app-specific limits for requests, rows, payload, pagination, response size, concurrency and processing deadline. Publish measured performance SLOs as targets, not achieved facts.
- Use short-lived cache only where safe and scope-correct. Never cache private user data globally without explicit access segmentation and invalidation.
- Define circuit-breaker-like graceful failure at the caller/gateway where feasible; do not promise durable background execution from a single request.
- Add correlation ID, latency and error counters with redaction. Record quota-exhaustion tests and expected recovery strategy.

## 11. CI/CD: GitHub as canonical source; clasp as deployment transport

1. Each GAS backend has a dedicated GAS Script ID and environment mapping, **not** a shared mutable production script by default.
2. Dev, staging, production MUST be isolated by deployment targets (prefer distinct Apps Script projects and separate test databases/storage). No production datastore or personal data used by automated tests.
3. GitHub contains version-controlled `.gs` / `.js` / `.ts` source and manifest; generated bundle only as disposable CI artifact; OAuth/clasp credentials in protected secrets, not committed.
4. Pull Request gate: directory + import-boundary check, lint/typecheck, unit tests, API contract tests, security/static scan, configuration validation, schema migration review.
5. Merge to approved development branch may run `clasp push` to a **dev** script after build, with scoped credentials. This updates script source, not necessarily a production Web App deployment.
6. Release workflow: snapshot/version → controlled update of existing deployment → smoke tests → approval and documented rollback. Promote the same validated artifact/version semantics as far as platform tooling supports.
7. Production deployment requires manual approval and protected GitHub environment. Never auto-push every commit to production GAS.
8. Record commit SHA, Script ID (private configuration as appropriate), Apps Script version, deployment ID, date/time, approver, test evidence and rollback procedure. Be careful not to log tokens or private deployment secrets.
9. In case of source drift from manual edits in Apps Script Editor, flag drift and reconcile back to GitHub through review; don't treat remote hotfixes as authoritative.
10. Pin clasp/toolchain dependencies, review actions, restrict `GITHUB_TOKEN` permissions and apply branch protection where available.

**Command distinction:** `clasp push` sends working code to a Script project; `clasp version` creates an immutable version; `clasp deploy` / `clasp redeploy` manages a versioned deployment. Use the CLI syntax supported by the pinned clasp release and validate against the official docs.

## 12. Mandatory tests and acceptance gates

| Gate | Minimum evidence | Release policy |
|---|---|---|
| GAS-G01 Structure | Mandatory `src/api/{routes,controllers,dto,security,responses}` for client-serving GAS, entrypoint/application/domain/infrastructure/composition layers, manifest; no app docs under `blueprint/` | Fail PR if missing for declared GAS backend |
| GAS-G02 Dependency | Domain/Application do not import GAS services, adapters implement ports | Fail PR |
| GAS-G03 API Layer & Contract | Versioned router/controller mappings, valid/invalid requests, unknown operation, version, paging, error envelope, DTO mapping, security-policy negative tests | Fail PR |
| GAS-G04 AuthZ | Anonymous, invalid identity, wrong app role/scope, direct-GAS URL bypass, data enumeration | Block release until independently tested |
| GAS-G05 Persistence & Storage | Selected provider's schema, migrations, access policy, conflicts, idempotency, transactions/consistency, backups, adapter contracts, rollback/reconciliation; Sheets-specific locks/batching only if using Sheets | Fail staging |
| GAS-G06 External API | Timeouts, bounded retry, errors, no secret leakage | Fail staging |
| GAS-G07 Quotas/performance | Representative row count, concurrency and expiration/recovery | Fail release if untested for production load |
| GAS-G08 Privacy | Data classification, lawful basis, access, ROPA/notices/retention approval when applicable | Block real personal data until approved |
| GAS-G09 CI/CD | Git SHA → built artifact → clasp push → version/deployment → rollback trace | Block production until evidence |
| GAS-G10 Acceptance | Owner approval, staging smoke tests, operations runbook, incident handling | Production release gate |

**QC language:** Architectural document existence ≠ implemented service. Build success ≠ authorization/security verification. Owner-reported tests ≠ independent certification. Every result records tested environment, date, commit, evidence, reviewer, outcome and outstanding risks.

## 13. Allowed deviations, governance and implementation order

**Deviation request:** App ID, blueprint clause, business reason, alternative design, security impact, test plan, migration/rollback, responsible owner, explicit architect + security approver, date, expiry/review. Store the app ADR in `apps/<app-id>/docs/`; cross-app changes go to `blueprint/decisions/`. Silence or lack of test does not equal approval.

**Implementation sequence:**
1. Record app needs and data classification.
2. Declare API operations/contracts and backend choice.
3. Select trust boundary, auth mechanism and deployment execution identity.
4. Implement domain ports + use cases + GAS adapters + mapping.
5. Implement deterministic packaging, dependency tests and mock **selected persistence/storage ports** tests.
6. Run staged integration, negative security, quota/concurrency and operational tests.
7. Deploy via controlled version, record acceptance evidence.
8. Register published app in central Portal **only** under accurate prototype/staging/production label.

**No backwards policy change:** This blueprint does not silently change Vehicle Contact policy, prescribe **any** database product for every app, enforce a particular IAM product, or authorize personal-data deployment.

## 14. Official platform references (verification source)

- [GAS Backend Design Pattern Review](architecture/GAS_DESIGN_PATTERN_REVIEW_2026-11-17.md) — documented findings, policy classifications and test gates.
- [Google Apps Script Best Practices](https://developers.google.com/apps-script/guides/support/best-practices) — batching, minimizing service calls and caching.
- [Google Apps Script JDBC](https://developers.google.com/apps-script/guides/jdbc) — supported database and network conditions.
- [AWS Hexagonal Architecture](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/hexagonal-architecture.html) — port/adapter testability and tradeoffs.

- [Google Apps Script Web Apps](https://developers.google.com/apps-script/guides/web) — `doGet`, `doPost`, events, execution/access model.
- [Google Apps Script Quotas](https://developers.google.com/apps-script/guides/services/quotas) — time and service limits (subject to change).
- [Google Apps Script clasp](https://developers.google.com/apps-script/guides/clasp) — source sync and versioned deployments.
- [Apps Script Web App manifest](https://developers.google.com/apps-script/manifest/web-app-api-executable) — access and executeAs.
- [LockService](https://developers.google.com/apps-script/reference/lock/lock-service) — concurrent access control.

**End of normative blueprint MT-GAS-MBP-001 (v1.2.1).**
