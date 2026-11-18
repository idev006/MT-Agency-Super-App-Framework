# P6 Vehicle Contact — Frontend Engineering Standard

**Document ID:** P6VC-FE-ENG-001

**Status:** REQUIRED ENGINEERING BASELINE

**Version:** 1.0 — 2026-11-18

**Scope:** Vue 3 SPA, shared components, role pages, Cloudflare frontend gateway integration, CI and deployment

## 1. Purpose and authority

เอกสารนี้เป็น entry point ของมาตรฐาน frontend P6 Vehicle Contact และควบคุม architecture, dependency direction, design patterns, component contracts, state ownership, API boundaries, failure handling, security, testing และ release evidence

ลำดับอำนาจเมื่อเอกสารขัดกัน:

1. Approved business requirement, legal/privacy decision และ backend permission contract
2. เอกสารนี้และ [Frontend Architecture](FRONTEND_ARCHITECTURE.md)
3. [UI/UX Principles](FRONTEND_UI_UX_PRINCIPLES.md) และ [Design System Blueprint](FRONTEND_DESIGN_SYSTEM_BLUEPRINT.md)
4. Feature specification และ role delivery work package
5. Implementation detail

คำว่า **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** และ **MAY** เป็น normative language ภายในโครงการ

## 2. Observed facts and open dependencies

### 2.1 Verified project facts

- Frontend ใช้ Vue 3 Composition API, Pinia, Vue Router, Vite, Tailwind CSS 4 และ DaisyUI 5.8.1
- GitHub Pages ใช้ hash routing และ repository subpath
- Browser path ที่ผ่าน acceptance คือ SPA → Cloudflare Worker `/api/frontend` → GAS `/exec`
- GAS เป็น authority ของ identity, session, role, permission, resource scope และ business rule
- Backend มีห้า role ที่ยืนยันแล้ว: `SYSTEM_ADMIN`, `REGISTRATION_ADMIN`, `STAFF`, `OWNER`, `RETENTION_WORKER`
- ผู้ใช้หนึ่งคนอาจมีหลาย role และ permission override

### 2.2 Unverified or separately approved dependencies

- production ingress, rate limiting และ Cloudflare Access policy
- production identity/password/session storage approval
- legal/PDPA approval สำหรับข้อมูลบุคคลจริง
- final icon library และ authorized organizational visual assets
- physical-device field acceptance และ assistive-technology review

Implementation MUST NOT silently treat an open dependency as approved

## 3. Architecture goals

### Functional goals

- ใช้ shell และ component language เดียวกันทุก role
- เพิ่ม feature page โดยไม่ copy layout หรือ backend transport logic
- รองรับ multi-role permission union
- แสดง loading, empty, forbidden, error, stale และ success อย่างสม่ำเสมอ
- รองรับทุก DaisyUI theme ที่เปิดให้เลือกและ viewport 360–1920px

### Nonfunctional goals

- predictable dependency direction
- testable components and composables
- accessible keyboard/focus behavior
- privacy-minimized UI and evidence
- observable failures without credential or PII leakage
- deterministic production builds and traceable deployments

## 4. Architecture layers and dependency rule

```text
bootstrap / composition root
        ↓
router + layouts
        ↓
pages / feature orchestration
        ↓
feature components + composables
        ↓
application services / repositories
        ↓
API adapter / browser infrastructure
        ↓
Cloudflare gateway → GAS

design tokens → shared UI → feature components → pages
domain policies → application services → pages
```

Dependencies MUST point downward or inward. Pages MAY depend on features, stores and application ports. Infrastructure MUST implement application ports. Domain logic MUST NOT import Vue, Pinia, router, browser storage or HTTP clients.

### 4.1 Required source layout

```text
src/
├─ app/                 # composition root and plugin registration
├─ router/              # routes, route metadata and navigation guards
├─ layouts/             # AppShell and layout-only components
├─ pages/               # routed feature orchestration
├─ features/            # feature-local UI, composables and application logic
├─ components/
│  ├─ ui/               # reusable presentation components
│  ├─ feedback/         # loading, empty, error, forbidden, toast
│  └─ page/             # PageTemplate, PageHeader, context strip
├─ composables/         # cross-feature behavior with explicit contracts
├─ domain/              # framework-independent policies and models
├─ application/         # use-case-facing ports/services
├─ infrastructure/      # GAS client, repositories, browser storage adapters
├─ stores/              # minimal global Pinia state/facades
└─ design/              # tokens and approved visual primitives
```

Migration from the current structure MAY be incremental Each changed file MUST move toward this dependency direction and MUST NOT create a second competing structure

## 5. Component classification

| Type | Responsibility | May access store/router/API? |
|---|---|---|
| UI primitive | Stable accessible presentation based on DaisyUI | No |
| Page building block | PageHeader, context, toolbar, feedback layout | No API; props/events only |
| Feature component | Feature interaction and local presentation | Store only through feature composable; no raw HTTP |
| Page component | Route orchestration, data loading and feature composition | Yes through store/application service |
| Layout | Persistent application chrome and responsive navigation | UI store/session summary only |
| Provider/policy wrapper | Dependency or UI policy boundary | Only the dependency/policy it owns |

Component names MUST describe user/domain responsibility, not visual shape alone when semantics matter

## 6. Mandatory design patterns

Detailed contracts are defined in [Component Architecture Patterns](FRONTEND_COMPONENT_ARCHITECTURE_PATTERNS.md)

- Composition over inheritance
- Slot-based Template Method for page structure
- Container/Presentational separation
- Adapter and Repository for external API/data boundaries
- Composables for reusable behavior
- Strategy/Registry for permission-driven variation
- Policy Wrapper for UI boundaries
- Explicit async state machine
- Pinia Facade for minimal global state
- Dependency Injection only for stable replaceable services

Vue `extends`, application mixins, duplicated role pages and raw `fetch()` inside `.vue` files are prohibited

## 7. State ownership standard

Use the narrowest owner that satisfies the requirement:

| State | Owner | Persistence |
|---|---|---|
| Field value, dialog visibility, selected row | Local component | None |
| Feature filters/results/pagination | Feature composable/store | URL only when shareable and non-sensitive |
| Session summary and permissions | Session Pinia store | Session token in `sessionStorage` only |
| Theme and navigation preference | UI Pinia store | Non-sensitive preference in `localStorage` |
| Identity, permission, business state | GAS | Server datastore |
| API response cache | Feature repository policy | Memory unless explicitly approved |

Global store MUST NOT become a dumping ground for temporary form state Raw password, full API response, error stack and sensitive record MUST NOT be persisted in browser storage

## 8. API and data boundary

`.vue` components MUST call feature composables or application services They MUST NOT construct GAS envelopes, endpoints, authorization tokens or parse transport errors

```text
Page → useFeature() → Application service → Repository port
                                      ↑
                       GAS repository adapter → GasApiClient
```

The API adapter MUST:

- create canonical request envelopes and request IDs
- apply timeouts and abort behavior
- validate canonical response envelopes
- map transport/backend errors into stable client error categories
- preserve backend error code and request ID without exposing raw server detail
- never accept an arbitrary upstream URL from feature code

## 9. Routing and permission boundary

Route metadata SHOULD declare `requiredPermissions` for navigation UX Global guards MAY redirect unauthenticated or visibly forbidden navigation but MUST NOT be described as authorization GAS MUST authorize every protected request

Menus MUST be permission-driven, not role-driven A role label MAY affect dashboard emphasis but MUST NOT grant capability

## 10. Failure handling

Every asynchronous feature MUST use explicit states:

```text
idle → loading → success | empty | forbidden | unauthenticated
                          | recoverable-error | fatal-error | stale
```

- HTTP success MUST NOT be treated as business success without validating the envelope
- Write retry MUST require an idempotency contract or explicit user confirmation
- Session expiry MUST clear local session state and return safely to sign in
- Forbidden responses MUST NOT confirm whether a protected resource exists
- Error UI MUST tell the user what happened, whether data changed and what action is safe next

## 11. Threat model baseline

Frontend controls are not security boundaries Threats considered in every feature review:

- forged role/permission or route navigation
- token/password leakage through storage, logs, URLs or screenshots
- XSS through backend or user-provided text
- unauthorized object access and identifier probing
- mass vehicle/contact enumeration
- stale approval and concurrent decision
- duplicate write after timeout/retry
- malicious or compromised third-party script
- theme/custom CSS that hides focus, error or destructive state

Security acceptance MUST reference the current OWASP ASVS baseline recorded in [Reference Register](FRONTEND_REFERENCE_REGISTER.md) and project-specific backend tests

## 12. Observability and supportability

Frontend MAY record sanitized operational events but MUST NOT log password, session token, full phone number, photo URL, raw personal record or unrestricted payload

User-facing support detail SHOULD include:

- stable error category
- request ID
- operation label in Thai
- timestamp in Asia/Bangkok
- connection route without secrets

Client telemetry schema, retention and destination require separate approval before collection

## 13. Testing standard

### Required for source merge

- unit tests for domain policy and mapping
- component contract tests for props/events/states
- role/permission menu and route tests
- API adapter envelope/error/timeout tests
- theme structural tests for all enabled themes
- responsive tests for required viewport classes
- keyboard/focus and automated accessibility tests
- production build, dependency audit, secret scan and SSOT link validation

### Required for environment release

- deployed HTML and assets HTTP 200
- CORS/health from the deployed origin
- authenticated browser flow with approved development account
- representative responsive/theme screenshots
- failure-path evidence and rollback path

## 14. CI and repository enforcement

CI SHOULD fail when:

- `.vue` imports the low-level API client directly outside an approved adapter
- routed page does not use the page template contract
- production component adds hardcoded non-semantic colors
- protected route omits permission metadata
- new component lacks required loading/error/empty contracts
- local Markdown links or SSOT validation fail
- test/build/audit/secret scan fails

Architecture rules SHOULD be implemented as lint/static tests, not reviewer memory alone

## 15. Alternatives considered

| Alternative | Decision | Reason |
|---|---|---|
| Class/component inheritance | Rejected | Hidden coupling and poor fit with Vue 3 Composition API |
| Mixins | Rejected | Name collisions, unclear ownership and implicit dependencies |
| Separate SPA per role | Rejected | Duplicated shell/logic and multi-role inconsistency |
| Micro-frontends | Deferred/rejected for Phase 1 | Operational complexity exceeds current product scale |
| Global store for all feature state | Rejected | Stale state, coupling and difficult tests |
| Role-only frontend authorization | Rejected | Backend supports permission union/overrides; client is not authoritative |
| Direct browser-to-GAS as primary path | Rejected from observed POC | Worker path passed browser/CORS acceptance and constrains upstream access |

## 16. Exception and change control

Deviation requires an ADR or Decision Log entry containing problem, affected pages, alternative analysis, security/accessibility impact, tests, owner, expiry/review date and migration plan. An exception MUST NOT weaken backend authorization, secret handling or privacy controls.

## 17. Acceptance criteria for the standard

- all frontend governance documents link from this entry point
- architecture and pattern rules map to enforceable tests or checklist gates
- role delivery uses GAS permission authority
- official-source references record access date and adoption scope
- FE-SHARED-01 shell redesign demonstrates the standard before role pages expand
