# P6 Vehicle Contact — Project Handover / Chat Continuation

**Document ID:** P6VC-HANDOVER-001  
**Prepared:** 2026-11-17; **last reconciled:** 2026-11-20 (Asia/Bangkok)
**GitHub baseline:** `main` @ `7449309a96bb5717f04a922f11f6e699343aee99`
**Purpose:** Restore project continuity when the original ChatGPT conversation cannot be opened. This is a **handover/index and evidence snapshot**, **not a replacement** for individual canonical design, requirements, decisions, live Issues or code. Refresh current commit/Issues/CI before making further changes.

> Start with [Current Delivery Status / Resume Here](CURRENT_DELIVERY_STATUS.md). It is the compact continuation SSOT for current versions, active work, blockers and exact next actions. The remaining handover preserves historical context.

## 1. Project identity, purpose and active phase

- **Repository SSOT:** https://github.com/idev006/MT-Agency-Super-App-Framework
- **Application:** `apps/vehicle-contact/` — P6 Vehicle Contact, App 001.
- **Purpose:** Register a vehicle and its reachable responsible contact, issue an opaque QR, resolve via authorized QR scan or manual plate/province search, show permitted vehicle/contact details and permit a deliberate tap-to-call.
- **Current phase:** Phase 1. Visitor card/pass exchange and entry/exit lifecycle are **OFF** pending separate authorization. Parking entitlement functionality and vehicle-photo minimum have unresolved policy questions; do not silently resolve from older draft documents.
- **Important:** QR references contain no name, telephone number or other personal information. Knowing an identifier never grants access to contact data.

## 2. Directory responsibilities and source precedence

```text
blueprint/MASTER_WEB_APP_BLUEPRINT.md           All-app frontend/multi-layer standards
blueprint/MASTER_GAS_BACKEND_API_BLUEPRINT.md   All-app GAS backend standards
blueprint/platform/                             Platform identity/SSO policy (separate)
blueprint/decisions/                            Cross-app ADRs
apps/vehicle-contact/README.md                  App entry point (check for historical/stale text)
apps/vehicle-contact/docs/                      Vehicle-only SA, PRD, PDPA, evidence, ADR
apps/vehicle-contact/schema/database.schema.json Canonical Sheets logical schema
apps/vehicle-contact/backend/gas/src/           Canonical GAS JavaScript ES modules
apps/vehicle-contact/backend/gas/scripts/       GAS build and smoke test source
apps/vehicle-contact/backend/gas/tests/         Offline synthetic tests
apps/vehicle-contact/poc/qr-scanner/index.html  Standalone HTML/JS camera POC
portal/apps.json                                Portal application registry
.github/workflows/                              Build/validation/source push/smoke CI
```

Rules: code in GitHub is canonical; deployed GAS .gs files and `_site/` are generated artifacts. Do not manually maintain a second GAS source in the Apps Script Editor or duplicate QR scanner sources. Compatibility Markdown pointers are not duplicate authority. Per-app decisions stay under app docs; global patterns stay in `blueprint/`. For any conflict, record source, status, approver and ADR before changing requirements.

## 3. Phase-1 technical decisions vs open gates

**Selected engineering direction:** Vue 3 + Vue Router + Pinia + Tailwind CSS + DaisyUI + Vite frontend, app-specific API adapter; Google Apps Script Backend API with layered ports/adapters and generated multi-file .gs scripts; one private Google Spreadsheet as logical app datastore, six candidate tabs (one worksheet = one logical table). Google Drive selected for private media root.

**Authentication direction:** Phase 1 Username/Password instead of waiting for MT-I-AM. This is **not** proof of a secure identity provider, credential storage, server session or direct-GAS-URL protection. Do not activate protected personal-data APIs until independent security/authorization tests pass. Older Supabase-first/React passages are historical drafts; resolve discrepancies using current approved blueprints and app decisions, not by bulk deleting documents.

**Schema rule:** `schema/database.schema.json` is authoritative; modifications observed in Sheets are proposals for review, never automatic upstream GitHub updates or silent migrations.

## 4. Confirmed progress and evidence scope

### Current delivery snapshot — 2026-11-20

| Area | Gate | Current evidence / boundary |
|---|---|---|
| Shared frontend shell | PASS | PRs #44–#46; Vue 3, Pinia, Router, responsive AppShell/PageTemplate/OperationalContextStrip, corporate/dark and axe evidence |
| STAFF vehicle search | PASS — source/integration | PR #47; permission-driven navigation, fail-closed adapter, refresh persistence and read-only search state coverage. Operational human UAT remains open. |
| SYSTEM_ADMIN use cases | PASS — source/integration | PRs #48–#54; user, organization, campaign, QR, settings, retention, audit, pagination and responsive date/time input coverage |
| Selected admin full human profile | PASS — development | PR #55 and live acceptance run 44574709121; exact server roles `SYSTEM_ADMIN` + `REGISTRATION_ADMIN`. This does not create an unrestricted super-role. |
| GAS source/development Web App | PASS — development | Run 44573790557 created source Version 20 from `3cfcf0e`; owner reported Web App publication. Public health recheck returned ready / API v1 / backend 0.4.0. |
| Production/security/PDPA release | BLOCKED | Named approvals, direct-ingress security proof, real-data authorization, UAT and release sign-off remain open. |

### Historical evidence snapshot — 2026-11-17

| Area | Result | Evidence | What it does NOT prove |
| --- | --- | --- | --- |
| Source tree and architecture docs | PRESENT in GitHub | App README, blueprints, source tree | Business/production sign-off |
| Spreadsheet structure | Six tabs with headers reported verified via connected Drive | `docs/GAS_TEST_EVIDENCE.md` | Live editor-to-Sheets verification of deployed functions |
| GAS CI bootstrap contract/build | PASS | [Run 44022203757](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44022203757) | Live GAS behavior |
| First authenticated GAS source push | PASS; source version 3 | [Run 44033187307](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44033187307) | Published Web App or completed auth |
| Source-mirrored GAS modules | 14 .gs modules + manifest pushed; GAS source Version 5 created | [Run 44035053861](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44035053861), `docs/GAS_MODULE_MAPPING.md` | That /exec points at Version 5 |
| Live GAS HTTPS smoke | **7/7 PASS**, real GET/POST with synthetic requests | [Run 44036525176](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44036525176), `docs/GAS_LIVE_API_TEST_EVIDENCE.md` | Working vehicles/contacts/QR CRUD; authenticated access; real Sheet reads/writes |
| Additional API/domain tests | **10/10 PASS** (synthetic Node tests); build yields **17 generated .gs modules + manifest** | [Run 44037490677](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44037490677), `docs/API_TEST_SUITE_PHASE1.md`, roadmap | Push/deploy of the newer 17-module build; operational QR issuance, uploads, session/RBAC |
| QR camera prototype | Standalone HTML/JS v7 source; camera access Android/iOS user-reported | `poc/qr-scanner/index.html`, `docs/POC_QR_SCANNER.md` | Independently evidenced decoding/front-rear/device matrix |
| CI/Pages | Earlier GitHub Actions billing lock was later reported resolved; Pages documentation indicates subsequent passing runs | `docs/DOCUMENT_CONSISTENCY_QC_2026-11-17.md`, `portal/DEPLOYMENT_STATUS.md` | New commit deployments or production readiness |

**Critical distinction:** Apps Script `clasp push` + `clasp create-version` are source/version operations, **not** a versioned Web App deployment. Version 20 source push and the owner-reported Web App publication are now recorded separately. A successful public health endpoint proves routing and reported release metadata, not production authorization or protected-operation acceptance.

## 5. Operational APIs and security gates

The live smoke test confirmed GET/POST `system.health`, invalid-version rejection, unknown-group rejection, and fail-closed responses for `vehicles.lookup`, `contacts.read` and `qr.resolve`. The protected groups were intentionally disabled. GAS ContentService may answer HTTP 200 with `ok:false` logical errors in the JSON response; do not mistake HTTP status for authorization.

**Blockers for any real personal data:**
1. Named owner/data steward and final scope/business photo/parking/visitor policy decisions.
2. Approved Username/Password provider, password reset/MFA decisions, safe session lifecycle.
3. Non-bypassable GAS ingress and per-action/resource authorization proved with adversarial direct-/exec tests.
4. Authorized GAS Script Property `VEHICLE_SHEET_ID` and non-destructive real Sheet schema verification.
5. Sheets persistence contract and integration with synthetic records; locking/versioning, logging and rollback.
6. Private Drive media access checks; explicit photo-minimum decision.
7. PDPA controller/DPO, lawful basis, notices, retention and field/UAT/device evidence.

## 6. Delivery order (reconcile live Kanban first)

**Read first:**
- [Roadmap](DEVELOPMENT_ROADMAP_PHASE1.md) and [Issue-backed Kanban](AGILE_KANBAN.md)
- [System analyst baseline](SYSTEM_ANALYST_BASELINE_PHASE1.md), [Requirements traceability](REQUIREMENTS_TRACEABILITY.md), [Decision Log](DECISION_LOG.md)
- [Phase-1 Sheets architecture](PHASE1_GOOGLE_SHEETS_DATA_ARCHITECTURE.md), [Canonical schema](../schema/database.schema.json)
- [GAS API specification](GAS_API_SPEC.md), [API test suite](API_TEST_SUITE_PHASE1.md)
- [GAS testing status](GAS_TEST_EVIDENCE.md), [Live smoke evidence](GAS_LIVE_API_TEST_EVIDENCE.md)
- [Module mapping](GAS_MODULE_MAPPING.md), [GAS deployment runbook](GAS_GITHUB_ACTIONS_DEPLOYMENT.md)
- [QR POC evidence](POC_QR_SCANNER.md), [Privacy reviews](PDPA_REVIEW_CHECKLIST.md)
- [All-app GAS Blueprint](../../../blueprint/MASTER_GAS_BACKEND_API_BLUEPRINT.md), [All-app Web Blueprint](../../../blueprint/MASTER_WEB_APP_BLUEPRINT.md)

**Immediate safe continuation:**
1. Inspect live `main`, GitHub Issues `VC-W*`, latest checks and actual GAS version/deployment configuration; distinguish documented snapshots from live status.
2. Verify Script Editor module list and `VEHICLE_SHEET_ID` via authorized settings, run editor-only `verifyVehicleSchemaFromEditor()` / `inspectVehicleSchemaDriftFromEditor()` read-only and preserve sanitized output; never paste secrets into chat.
3. Expand fake Sheets repository tests and Vue mock shell with synthetic data while security decisions remain blocked.
4. Produce/review an explicit Phase-1 auth + non-bypassable GAS ingress ADR and test plan before opening protected business operations.
5. After appropriate approvals, test staging vehicle/contact/QR integration, media and Android/iOS behavior, recording exact run SHA, deployment ID, test inputs without PII, expected/actual and reviewer.

**Workflow constraints:** GitHub Actions GAS deployment is manual-only with maintainer confirmation. No unattended push, live database mutation, public exposure of confidential vehicle/contact fields or implicit production release.

## 7. Reporting contract for the replacement chat

When continuing work, report a table or concise structured summary with: `Work ID`, canonical file/Issue, DONE-EVIDENCED / IN-PROGRESS / REVIEW / BLOCKED / TODO / DEFERRED, exact commit+CI evidence, test layer (unit/contract/live smoke/Security/E2E), blocker, next owner/action. Never convert docs/CI results to claims of business feature completion. Update Issues and the handover only after verifying the changes.

## 8. Ready-to-paste first message in a new chat

> รับช่วงโครงการ **P6 Vehicle Contact** จาก GitHub SSOT `idev006/MT-Agency-Super-App-Framework` โดยเริ่มจาก `apps/vehicle-contact/docs/CURRENT_DELIVERY_STATUS.md` แล้วตรวจ `main`, GitHub Issues และหลักฐานของ slice ที่จะทำ ไม่สร้างแผนแข่งขันกับ SSOT และไม่เปลี่ยนข้อกำหนดธุรกิจโดยพลการ รายงาน DONE-EVIDENCED / IN-PROGRESS / REVIEW / BLOCKED / TODO แยก source, deployment, live acceptance และ production approval ให้ชัด ปัจจุบัน baseline ที่ reconcile แล้วคือ `7449309`, GAS source Version 22, Backend API `0.5.0`, Frontend `0.6.0`; security/PDPA/UAT/release approval ยังเป็น gate แยกต่างหาก

**Historical-chat note:** The earlier conversation was reportedly titled `MT-พัฒนาระบบตรวจสอบสิทธิ์จอด`; the exact chat/message ID and original chat's complete history were not independently recovered. This handover is grounded in versioned GitHub evidence, not a verbatim transcript of that chat.
