# P6 Vehicle Contact — System Analyst Baseline (Phase 1)

**Document ID:** P6VC-SA-001  
**Version:** 1.0.0 | **Date:** 2026-11-17  
**Status:** BASELINED FOR DEVELOPMENT PLANNING; policy/PDPA/security decisions listed as OPEN; not a production or legal approval  
**Scope:** App-specific analysis under `apps/vehicle-contact/`. Applies alongside the repository [Master Web App Blueprint](../../../blueprint/MASTER_WEB_APP_BLUEPRINT.md) and [Master GAS Backend API Blueprint](../../../blueprint/MASTER_GAS_BACKEND_API_BLUEPRINT.md).  
**Implementation plan:** [Development Roadmap](DEVELOPMENT_ROADMAP_PHASE1.md)  

## 1. Problem, purpose and measurable outcome

**Problem:** Staff and security personnel may find an unfamiliar or obstructing parked vehicle without knowing the **registered responsible contact**, causing slow manual coordination. The system must help an **authorized** operator identify a registered vehicle and contact its responsible person quickly. The registered responsible person is **not necessarily its legally verified owner**.

**North star:** “ทุกคันตรวจสอบได้ ทุกคนอุ่นใจ” — a policy aspiration, not a claim that every vehicle is already registered. Scanning a QR or searching a plate can find information **only for existing, authorized records**; unknown vehicles require a human SOP and must not cause fabricated contacts.

**Pilot hypotheses/targets, not measured results:** p95 scan-to-detail ≤ 2 seconds under specified authenticated/network conditions; ≤ 3 user actions from native QR scan to call when already signed in; 100% sensitive contact responses gated by server-verified permission; Android/iOS scanner and fallback tested physically. Measure baseline manual contact time, record accuracy and registered-vehicle coverage.

## 2. Scope and phase boundary

**Phase 1 includes (planned, not yet implemented):**
- Regular vehicle registration with an approved responsible contact; review/edit/verify data.
- Random non-PII QR token issuance, print, rotation/revocation; QR grants no authorization by itself.
- QR scan/deep link and Thai plate + province search; handling missing, ambiguous or revoked records.
- Authorized vehicle details, permitted phone display and user-initiated tap-to-call; audit of relevant access/changes.
- Phase-1 **username/password** authentication and server-side session, restricted user permissions; MT-I-AM is deferred.
- Mobile-first Vue Frontend, app-specific GAS Backend API Groups and a **private Google Spreadsheet** as Phase-1 datastore.

**Phase 1 excludes/keeps disabled:** visitor/pass card exchange, pass return and visit entry/exit lifecycle, automatic parking entitlement/zone or barrier controls, QR-based parking rights, LINE alerts, government registry integrations, OCR/AI, automatic vehicle-moved verification, public contact lookup. Future visitor module can be designed/tested with synthetic data but MUST remain disabled in Phase 1 on both UI and API.

**Source conflicts retained OPEN:** Photo minimum (at least one vs 0–5 optional), permanent/guest QR eligibility, detailed sticker categories and scope, final phone visibility, contact ownership and privacy retention. Historical flows that mention pass exchange are **not current Phase-1 operating instructions**.

## 3. Stakeholder and actor analysis

| Actor (not itself an RBAC permission) | Business responsibility |
|---|---|
| Policy sponsor / premises authority | Approves operating rules, scope, exceptions and pilot |
| Project owner / data steward | Owns registry quality, lifecycle and source of contact records |
| Regular user / driver | Supplies accurate vehicle/contact information, reports changes |
| Unit coordinator / registration operator | Verifies registrations, corrects stale data, follows compliance |
| QR issuer | Issues/prints/revokes/replaces credentials under delegated authority |
| Gate guard / roaming guard | Scans/searches and coordinates contact according to approved SOP |
| App admin / IT | Manages app accounts, approved role grants, environment and incidents |
| DPO / legal reviewer | Reviews lawful basis, notices, access, retention, deletion and audit |

An individual may hold multiple roles. **Draft RBAC** (not yet approved): VIEWER may search permitted vehicles; OPERATOR may register/update according to scope; QR_ISSUER may issue/revoke; APP_ADMIN manages app-limited accounts and grants; access to phone requires a separate `vehicle.contact.read` permission. Never equate frontend visibility with server authorization. Policy sponsor approves final matrix and resource scopes.

## 4. Use cases and acceptance baseline

| ID | Business use case | Primary actor | Minimum success / negative acceptance |
|---|---|---|---|
| VC-UC01 | Register vehicle | Operator/registered user | Valid plate/province, responsible contact and status; duplicate active registration handled; audit |
| VC-UC02 | Verify/update vehicle/contact | Operator/coordinator | Authorized changes only; old/stale contacts removed from current result, change recorded |
| VC-UC03 | Issue/print QR | QR issuer | Unpredictable opaque token; no phone/name/plate in QR payload; one active target |
| VC-UC04 | Revoke/replace QR | QR issuer | Old QR does not disclose contact; rotation audited |
| VC-UC05 | Resolve QR | Guard/viewer | Exact registered record for authorized actor; invalid/expired/revoked safe failure |
| VC-UC06 | Search plate+province | Guard/viewer | Normalization; bounded matching; disambiguation; no unintended phone enumeration |
| VC-UC07 | View contact and tap-to-call | Authorized guard/viewer | Separate contact permission and resource policy; phone shown minimally; no auto-dial |
| VC-UC08 | Handle missing QR/no record | Guard | Manual coordination path; system does not invent contact |
| VC-UC09 | Sign in/out and enforce roles | All protected users | Secure username/password; session expiry/revocation; per-action and per-record authorization |
| VC-UC10 | Audit security-relevant actions | Authorized operator/admin | Append minimal, access-restricted audit without exposing credentials/PII |
| VC-UC11 | Resolve outage or incorrect contact | Guard/coordinator | Clear fallback, authorized correction and reconciliation |
| VC-UC12 | Visitor pass and visit lifecycle | Future-phase actors | **DISABLED in Phase 1**; no live visitor/pass APIs or data collection |

Every use case must have normal, invalid-input, no-record, unauthorized, concurrency and dependency-failure test cases, as applicable.

## 5. Business process and exception flow

**A. Registration:** submit → validate identity/permissions and input → check duplicate/active vehicle → verify responsible contact → approve per operating rule → save with audit → issue QR when authorized → print/test/apply sticker.

**B. Vehicle needs contact:** guard encounters vehicle → scan QR **or** search plate+province → backend authenticates and authorizes action/resource → resolve active record → reveal only permitted vehicle/contact fields → user taps call → append privacy-safe audit. Wrong/no data, revoked QR, inaccessible user or unavailable network go to a human escalation SOP; do not bypass security.

**C. Maintenance:** authorized correction / QR replacement → version check, lock or conflict resolution → persist and audit → subsequent lookup returns current record.

**D. Visitor/pass:** explicitly future-phase; independent approval and feature flag required.

## 6. Functional and nonfunctional requirements

**Functional:** registration and correction; QR issuance/rotation/revocation; scanning and plate search; contact display and tap-to-call; restricted users and permissions; data quality, lifecycle and audit; safe errors and human fallback.

**Nonfunctional:** HTTPS and protected API ingress, no public PII/QR tokens, password protection and server-side sessions, action + resource authorization, quota/timeout and concurrency testing, data integrity/backup/restore, data retention and PDPA, Android/iOS/LINE fallback testing, performance measurement, accessibility and incident/runbook readiness. No claims of exactly-once Sheet transactions, native HTTP REST methods or native GAS CORS support.

## 7. Logical data model and design constraints

**Phase-1 technology decision:** one private Google Spreadsheet is a logical database; each worksheet/tab is a logical table. Existing **six candidate tabs**: `vc_vehicles`, `vc_vehicle_contacts`, `vc_qr_tokens`, `vc_vehicle_photos`, `vc_lookup_audit`, `vc_change_audit`.

- `vc_vehicles(vehicle_id)` is the durable vehicle entity; do not use Sheet row numbers as IDs.
- Contacts, QR and photo metadata reference `vehicle_id` (logical 1:N where applicable).
- `vc_vehicle_photos` contains **metadata and protected storage reference**, not binary images. Photo minimum and storage provider remain OPEN.
- Audit records reference an authorized actor and target; minimize/redact sensitive fields and approve retention.
- SQL-like PK/FK/unique keys are **application-enforced**, not built-in Sheets constraints; versioned writes and `LockService` can reduce conflicts but do not provide ACID guarantees.
- Account/session/role storage provider is **undecided**; do **not** add plaintext passwords or assume Sheets is an approved session store.
- Full column types, constraints, physical lookup strategy and migrations are pending Data Dictionary review. See [GAS Data Model](GAS_DATA_MODEL.md) and [Phase-1 Data Architecture](PHASE1_GOOGLE_SHEETS_DATA_ARCHITECTURE.md).

## 8. Implementation architecture and API group ownership

```text
Vue Frontend (GitHub Pages or approved HTTPS origin)
  -> frontend API adapter
  -> verified Username/Password auth + non-bypassable trusted API boundary
  -> GAS doGet/doPost runtime bridge (if secured ingress proven)
  -> Versioned API Layer / groups: vehicles, contacts, qr, audit, system
  -> Application Use Cases -> Domain Ports
  <- Sheets Repository Adapter / Storage Adapter
  -> private Google Spreadsheet / approved private photo storage
```

Master GAS code pattern: ES Modules, DI, Composition Root, private runtime bundle namespace `P6VC`, and only approved GAS global functions. Every action needs explicit permission and resource-scoping. GAS endpoint **must not be publicly callable with owner privilege via a bypass path**; a browser-side secret, client-supplied role or gateway in front of an unprotected GAS URL is not sufficient. If a non-bypassable GAS integration is infeasible, revise backend execution topology by ADR **before enabling PII APIs**; GAS can remain a restricted internal integration.

**Current source:** GAS bootstrap routes `system.health` only; protected operations disabled. Build/contract tests verified in GitHub CI; no real GAS deployment or end-to-end AuthN/AuthZ verified.

## 9. Screen inventory (proposed)

- Login/session and safe QR return route.
- Scan/Search home; rear/front camera picker with permissions and manual search.
- Vehicle detail/contact (masked or withheld without permission), explicit phone action.
- Registration/edit workflow with status and validation.
- QR issuance/revocation/print (restricted).
- App administration and restricted audit screen (role-based, minimal data).

## 10. Open decisions and acceptance gates

| Decision | Owner / approval | Blocking implication |
|---|---|---|
| D-01 Auth provider, credential/session store and GAS bypass-resistant trust boundary | Architect + security/app owner | **Blocks all protected endpoints** |
| D-02 Approved RBAC action/resource matrix, phone visibility, registration approver | Policy sponsor/data owner | Blocks real contact disclosure |
| D-03 Full Sheet schema, normalization, uniqueness, versioning | Data steward + tech lead | Blocks real CRUD |
| D-04 Photo count and private media store | Business sponsor + privacy/security | Blocks photo acceptance/production |
| D-05 Lawful basis/notice, retention, deletion, DPO/legal review | Legal/DPO/data controller | Blocks production personal data |
| D-06 Security scope for production/pilot, domain, staging identities | Project owner / security | Blocks production release |
| D-07 Visitor/pass activation | Policy sponsor | **OFF for all Phase-1 releases** |

**Delivery gates:** requirements approval → security architecture proof → synthetic-data staging integration → negative authorization + concurrency tests → mobile field/UAT → PDPA approval → documented pilot release. Do not treat CI PASS, a populated Sheet, a draft SOP or QR camera POC as production acceptance.

## 11. Traceability and source precedence

This document is a **development-ready analysis draft**, not an amendment to unresolved policy decisions. Requirements originate from [Product Requirements](PRODUCT_REQUIREMENTS.md), [System Analysis v2](SYSTEM_ANALYSIS_V2.md), [Workflow and SOP correction](WORKFLOW_SOP_POLICY_REVIEW.md) and [Requirements Traceability](REQUIREMENTS_TRACEABILITY.md); **latest Phase-1 decisions** are recorded in [Decision Log](DECISION_LOG.md), [Google Sheets Phase-1 Architecture](PHASE1_GOOGLE_SHEETS_DATA_ARCHITECTURE.md) and [GAS API Spec](GAS_API_SPEC.md). Historical React/Supabase-primary drafts do not override the later owner-selected Vue/GAS/Sheets direction. Where older documents differ on photo quantity/visitor scope/permissions, retain the disputed status until approved.

**Next artifact:** a detailed [Development Roadmap and Backlog](DEVELOPMENT_ROADMAP_PHASE1.md). This SA baseline is proposed for review/sign-off, not an assertion that all listed screens, services or controls exist.
