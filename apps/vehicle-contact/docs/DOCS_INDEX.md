# P6 Vehicle Contact — Docs Index

**Document ID:** P6VC-DOCS-INDEX-001 | **Generated:** 2026-11-23 (Asia/Bangkok)
**Purpose:** จุดเดียวที่บอกว่าเอกสารไหนคือ "ความจริงปัจจุบัน", เอกสารไหนเป็นหลักฐาน ณ วันที่, และเล่มไหนถูกแทนที่แล้ว — ลดความเสี่ยงเอกสารเก่าขัดกับสถานะจริง (handoff acceptance review PR #143)

**กติกาการใช้ (ตาม [PROJECT_HANDOVER](PROJECT_HANDOVER.md) §2):** ลำดับความน่าเชื่อถือ = โค้ดจริงบน `main` + owner decision → `CURRENT_DELIVERY_STATUS.md` → แผนงาน → ADR/ข้อกำหนด → เอกสารหลักฐานตามวันที่. เอกสารหลักฐาน **พิสูจน์เฉพาะวันที่/ขอบเขตที่ระบุ**; ตัวเลขปัจจุบันชนะตัวเลขเก่าเสมอ

> ตารางด้านล่าง **สร้างอัตโนมัติ** จาก H1 ของแต่ละไฟล์ + วันที่ commit ล่าสุด (git) + วันที่ที่ประกาศในเนื้อหา. อย่าแก้ด้วยมือ — สร้างใหม่ด้วย `node scripts/gen-docs-index.mjs` (repo root)

## 1. อ่านก่อน (current-state authority)

| เอกสาร | ใช้ทำอะไร |
|---|---|
| [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md) | สถานะรันไทม์/หลักฐานปัจจุบัน — จุดกลับมาทำงาน (authority ลำดับ 2 ใน PROJECT_HANDOVER §2) |
| [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md) | ลำดับความน่าเชื่อถือ, กฎความปลอดภัย, next actions, prompt มาตรฐาน (§1) |
| [HANDOFF_FIRESTORE_PHASE3_CONTINUATION_20261123.md](HANDOFF_FIRESTORE_PHASE3_CONTINUATION_20261123.md) | handoff ล่าสุด Phase 3 + acceptance review §10 |
| [BACKEND_FIRESTORE_LIVE_CUTOVER_EVIDENCE_20261123.md](BACKEND_FIRESTORE_LIVE_CUTOVER_EVIDENCE_20261123.md) | หลักฐาน cutover: suite 97/97 + dual-store audit §4.3 + rollback window §6.1 |
| [FIRESTORE_CUTOVER_ROLLBACK_RUNBOOK.md](FIRESTORE_CUTOVER_ROLLBACK_RUNBOOK.md) | ขั้นตอน rollback/monitoring |
| [DECISION_LOG.md](DECISION_LOG.md) | VC-ADR ทั้งหมด (019/020/021/022 = Firestore/runtime/PDPA/rollback) |

## 2. เอกสารทั้งหมด (153 ไฟล์)

| เอกสาร | หมวด | อัปเดต (git) | วันที่ในไฟล์ | สถานะ / หมายเหตุ |
|---|---|---|---|---|
| [CLOUD_RUN_SPIKE_AND_GAS_INCIDENT_20261125.md](CLOUD_RUN_SPIKE_AND_GAS_INCIDENT_20261125.md) — Cloud Run spike + GAS outbound incident (2026-11-25) | Evidence | 2026-11-25 | 2026-11-25 |  |
| [DECISION_LOG.md](DECISION_LOG.md) — P6 Vehicle Contact — Decision and approval log | Navigation / current | 2026-11-25 | 2026-11-25 |  |
| [SYSTEM_ADMIN_USECASE_GAP_PLAN_20261125.md](SYSTEM_ADMIN_USECASE_GAP_PLAN_20261125.md) — SYSTEM_ADMIN use cases: coverage check, Vehicle 360, QR history, plan (2026-11-25) | Plan / process | 2026-11-25 | 2026-11-25 |  |
| [traceability-matrix.md](traceability-matrix.md) — P6 Vehicle Contact — Requirements → Use Case → Sequence → API → Tests | Reference | 2026-11-25 | 2026-11-22 |  |
| [UI_AUDIT_SYSTEM_ADMIN_20261125.md](UI_AUDIT_SYSTEM_ADMIN_20261125.md) — UI audit: Initial System Admin (2026-11-25) | Reference | 2026-11-25 | 2026-11-25 |  |
| [BACKEND_FIRESTORE_LIVE_CUTOVER_EVIDENCE_20261123.md](BACKEND_FIRESTORE_LIVE_CUTOVER_EVIDENCE_20261123.md) — Backend Firestore LIVE cutover + integration test evidence (synthetic DEV) | Evidence | 2026-11-24 | 2026-11-24 | SYNTHETIC-DEV CUTOVER Phases 0→2 EXECUTED + verified on live GAS @51; **Phase 3 (Firestore |
| [FRONTEND_REDESIGN_R1_R2_EVIDENCE_20261124.md](FRONTEND_REDESIGN_R1_R2_EVIDENCE_20261124.md) — P6VC — Frontend redesign R1 (sign-in) + R2 (role home) evidence | Evidence | 2026-11-24 | 2026-11-24 |  |
| [FRONTEND_REDESIGN_R3_EVIDENCE_20261124.md](FRONTEND_REDESIGN_R3_EVIDENCE_20261124.md) — P6VC — Frontend redesign R3 (search / QR → vehicle card) evidence | Evidence | 2026-11-24 | 2026-11-24 |  |
| [FRONTEND_REDESIGN_R4_EVIDENCE_20261124.md](FRONTEND_REDESIGN_R4_EVIDENCE_20261124.md) — P6VC — Frontend redesign R4 (stepped registration intake) evidence | Evidence | 2026-11-24 | 2026-11-24 |  |
| [FRONTEND_REDESIGN_R5_EVIDENCE_20261124.md](FRONTEND_REDESIGN_R5_EVIDENCE_20261124.md) — P6VC — Frontend redesign R5 (review queues) evidence | Evidence | 2026-11-24 | 2026-11-24 |  |
| [FRONTEND_REDESIGN_R6_EVIDENCE_20261124.md](FRONTEND_REDESIGN_R6_EVIDENCE_20261124.md) — P6VC — Frontend redesign R6 (P3 findings + frequently used pages) | Evidence | 2026-11-24 | 2026-11-24 |  |
| [FRONTEND_REDESIGN_R7_EVIDENCE_20261124.md](FRONTEND_REDESIGN_R7_EVIDENCE_20261124.md) — P6VC — R7: owner review of the live UI (alignment, tabs, registry, vehicle detail + photos) | Evidence | 2026-11-24 | 2026-11-24 |  |
| [INTEGRATION_E2E_UI_SSOT_EVIDENCE_20261124.md](INTEGRATION_E2E_UI_SSOT_EVIDENCE_20261124.md) — P6VC — Step 4: integration test through the real UI, verified at the SSOT | Evidence | 2026-11-24 | 2026-11-24 |  |
| [PERFORMANCE_PROFILE_V69_20261125.md](PERFORMANCE_PROFILE_V69_20261125.md) — P6VC — Server-side performance profile (V69 / 0.9.19) | Engineering reference | 2026-11-24 | 2026-11-25 |  |
| [TEST_SUITE_SSOT_DESIGN_20261124.md](TEST_SUITE_SSOT_DESIGN_20261124.md) — P6VC — SSOT-verified automated test suite design (backend + API engine) | Standard / architecture | 2026-11-24 | 2026-11-24 |  |
| [BACKEND_DELIVERY_STATUS_20261117.md](BACKEND_DELIVERY_STATUS_20261117.md) — Vehicle Contact — Backend delivery status (2026-11-17) | Engineering reference | 2026-11-23 | 2026-11-17 |  |
| [BACKEND_FIRESTORE_CUTOVER_REHEARSAL_EVIDENCE_20261123.md](BACKEND_FIRESTORE_CUTOVER_REHEARSAL_EVIDENCE_20261123.md) — BACKEND — Firestore integration test + synthetic-DEV cutover rehearsal | Evidence | 2026-11-23 | 2026-11-23 |  |
| [BACKEND_FIRESTORE_DUALWRITE_F3B1_EVIDENCE_20261122.md](BACKEND_FIRESTORE_DUALWRITE_F3B1_EVIDENCE_20261122.md) — F3b-1 — Dual-write wrapper + divergence journal (offline evidence) | Evidence | 2026-11-23 | 2026-11-23 | OFFLINE DONE — code + tests merged to source; **NOT pushed to GAS, NOT enabled live.** Run |
| [BACKEND_FIRESTORE_LIVE_API_SUITE_EVIDENCE_20261122.md](BACKEND_FIRESTORE_LIVE_API_SUITE_EVIDENCE_20261122.md) — BACKEND — Full automated API/use-case pipeline on LIVE Firestore DEV (#69) | Evidence | 2026-11-23 | 2026-11-22 |  |
| [BACKEND_FIRESTORE_LIVE_POC2_POC3_EVIDENCE_20261122.md](BACKEND_FIRESTORE_LIVE_POC2_POC3_EVIDENCE_20261122.md) — BACKEND — Firestore live POC #2/#3 evidence (Node sync bridge → real gateway → live Firestore DEV) | Evidence | 2026-11-23 | 2026-11-22 |  |
| [CODE_MAP_20261121.md](CODE_MAP_20261121.md) — P6 Vehicle Contact — Code Map (current source) | Standard / architecture | 2026-11-23 | 2026-11-23 | SOURCE-MIRRORED MAP of the source merge baseline `main` @ `248a3a6` (PR #122). The publish |
| [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md) — P6 Vehicle Contact — Current Delivery Status / Resume Here | Navigation / current | 2026-11-23 | 2026-11-23 | DEV engineering evidence is strong; **production readiness and all human sign-offs remain  |
| [FIRESTORE_CUTOVER_ROLLBACK_RUNBOOK.md](FIRESTORE_CUTOVER_ROLLBACK_RUNBOOK.md) — Firestore cutover & rollback runbook (F3b-3) | Runbook | 2026-11-23 | 2026-11-23 | PROCEDURE READY — every live phase below is **gated**; none may be self-approved (PM plan  |
| [FIRESTORE_NEW_STORE_PDPA_SECURITY_REVIEW_55_20261123.md](FIRESTORE_NEW_STORE_PDPA_SECURITY_REVIEW_55_20261123.md) — #55 — New-store PDPA & security review: Firestore (decision-ready dossier) | Compliance | 2026-11-23 | 2026-11-23 |  |
| [FRONTEND_FIRESTORE_E2E_EVIDENCE_20261123.md](FRONTEND_FIRESTORE_E2E_EVIDENCE_20261123.md) — FRONTEND — Full E2E of every page/role against LIVE Firestore DEV (#70) | Evidence | 2026-11-23 | 2026-11-23 |  |
| [GAS_API_SPEC.md](GAS_API_SPEC.md) — Vehicle Contact GAS API Contract — Phase 1 bootstrap | Engineering reference | 2026-11-23 | 2026-11-17 | **Status (2026-11-17 code branch):** SOURCE HANDLERS 50/50 WIRED, BUT UNVERIFIED AND NOT D |
| [GAS_DATA_MODEL.md](GAS_DATA_MODEL.md) — Sheets physical projection (DERIVED) — Phase 1 candidate snapshot | Requirements / design | 2026-11-23 | 2026-11-22 | Working technical schema, NOT approved final business/PDPA schema. |
| [GAS_MIGRATION_RUNBOOK.md](GAS_MIGRATION_RUNBOOK.md) — P6 Vehicle Contact — additive GAS migration runbook | Runbook | 2026-11-23 | 2026-11-17 |  |
| [GAS_MODULE_MAPPING.md](GAS_MODULE_MAPPING.md) — P6 Vehicle Contact — Source-Mirrored GAS Module Mapping | Reference | 2026-11-23 | 2026-11-17 | DEPLOYED TO APPS SCRIPT SOURCE / EDITOR AND LIVE BUSINESS FUNCTIONS NOT YET FIELD VERIFIED |
| [GAS_ONE_TIME_ADMIN_RESET_RUNBOOK.md](GAS_ONE_TIME_ADMIN_RESET_RUNBOOK.md) — P6 Vehicle Contact — One-Time Admin Password Reset (Editor Only) | Runbook | 2026-11-23 | 2026-11-23 | PR #42 MERGED (commit `92f880f`), GAS Editor source PUSHED (GitHub Actions run #10, 50 fil |
| [GAS_SECURITY_AND_PRIVACY.md](GAS_SECURITY_AND_PRIVACY.md) — Vehicle Contact — GAS Phase 1 Security & Privacy Release Gate | Compliance | 2026-11-23 | 2026-11-17 | BLOCKED FOR PROTECTED DATA OPERATIONS. |
| [HANDOFF_FIRESTORE_PHASE3_CONTINUATION_20261123.md](HANDOFF_FIRESTORE_PHASE3_CONTINUATION_20261123.md) — Handoff — Firestore Phase 3 continuation (synthetic DEV) | Navigation / current | 2026-11-23 | 2026-11-23 | **Status at handoff:** V52 / `backendVersion` 0.9.3 **DEPLOYED + health-verified** (Firest |
| [IMPLEMENTATION_WORKPACKAGES_PHASE1.md](IMPLEMENTATION_WORKPACKAGES_PHASE1.md) — P6 Vehicle Contact — Engineering Work Packages | Plan / process | 2026-11-23 | 2026-11-17 | **Document ID:** P6VC-WP-001 |
| [PDPA_CONSENT_AND_RIGHTS.md](PDPA_CONSENT_AND_RIGHTS.md) — Consent, Rights and Breach Operational Procedures | Compliance | 2026-11-23 | 2026-11-16 |  |
| [PDPA_DATA_RETENTION_AND_RELEASE_GATE.md](PDPA_DATA_RETENTION_AND_RELEASE_GATE.md) — Retention Schedule and PDPA Release Gate | Compliance | 2026-11-23 | 2026-11-16 |  |
| [PDPA_GOVERNANCE_PACK.md](PDPA_GOVERNANCE_PACK.md) — MT Vehicle Contact — PDPA Governance Pack (Draft) | Standard / architecture | 2026-11-23 | 2026-11-16 |  |
| [PDPA_LAWFUL_BASIS_DECISION.md](PDPA_LAWFUL_BASIS_DECISION.md) — การประเมินฐานกฎหมายและความจำเป็นรายกิจกรรม | Compliance | 2026-11-23 | 2026-11-16 |  |
| [PDPA_PRIVACY_NOTICES.md](PDPA_PRIVACY_NOTICES.md) — ประกาศความเป็นส่วนตัว 2 ฉบับ — Draft for issuance | Compliance | 2026-11-23 | 2026-11-16 |  |
| [PRODUCTION_READINESS_PLAN_20261121.md](PRODUCTION_READINESS_PLAN_20261121.md) — P6 Vehicle Contact — Production Readiness Plan | Plan / process | 2026-11-23 | 2026-11-23 | ACTIVE GATE TRACKER — **NOT PRODUCTION-READY AND NOT RELEASE-APPROVED**. The original 48-h |
| [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md) — P6 Vehicle Contact — Project Handover / Next AI | Navigation / current | 2026-11-23 | 2026-11-23 |  |
| [PROJECT_PROPOSAL_POLICY_DRIVEN.md](PROJECT_PROPOSAL_POLICY_DRIVEN.md) — ข้อเสนอโครงการระบบตรวจสอบและติดต่อผู้รับผิดชอบยานพาหนะ (MT Vehicle Contact) | Proposal / decision input | 2026-11-23 | 2026-11-17 |  |
| [SCRIPT_PROPERTIES.md](SCRIPT_PROPERTIES.md) — P6VC — GAS Script Properties catalog | Reference | 2026-11-23 | **⚠ ไม่ระบุ** |  |
| [SENIOR_THAI_LEGAL_COUNSEL_ROLE.md](SENIOR_THAI_LEGAL_COUNSEL_ROLE.md) — TOR — นิติกรอาวุโสด้านกฎหมายไทย กฎหมายคุ้มครองข้อมูลส่วนบุคคลและกฎหมายดิจิทัล | Standard / architecture | 2026-11-23 | 2026-11-16 |  |
| [TEST_AND_DELIVERY.md](TEST_AND_DELIVERY.md) — Test, Acceptance & Rapid Delivery — MT Vehicle Contact v1.0 | Engineering reference | 2026-11-23 | 2026-11-16 | PROPOSED |
| [TEST_AUTOMATION_INTEGRATION_DESIGN_20261123.md](TEST_AUTOMATION_INTEGRATION_DESIGN_20261123.md) — P6VC Test Automation + Integration Test Design (GAS + Firestore main engine) | Engineering reference | 2026-11-23 | 2026-11-23 | **Doc ID:** P6VC-QA-TEST-DESIGN-001 |
| [WORKFLOW_SOP_POLICY_REVIEW.md](WORKFLOW_SOP_POLICY_REVIEW.md) — P6 Vehicle Contact — Policy / Workflow / SOP Review | Plan / process | 2026-11-23 | 2026-11-16 |  |
| [AGILE_KANBAN.md](AGILE_KANBAN.md) — P6 Vehicle Contact — Agile Kanban Operations & Live Issue Board | Navigation / current | 2026-11-22 | 2026-11-22 | **Created:** 2026-11-17 |
| [API_TEST_SUITE_PHASE1.md](API_TEST_SUITE_PHASE1.md) — P6 Vehicle Contact — API Test Suites (Approved 2026-11-17) | Engineering reference | 2026-11-22 | 2026-11-17 | **Status at this snapshot:** PARTIALLY IMPLEMENTED / LIVE BACKEND INTEGRATION GATED |
| [ARCHITECTURE_SSOT.md](ARCHITECTURE_SSOT.md) — P6 Vehicle Contact — Architecture SSOT (canonical, living) | Standard / architecture | 2026-11-22 | 2026-11-22 | **Document:** P6VC-ARCH-001 |
| [BACKEND_DURABLE_JOURNALING_B2B_EVIDENCE_20261122.md](BACKEND_DURABLE_JOURNALING_B2B_EVIDENCE_20261122.md) — B2b — Durable journaling for `registrationReview` and `assignRoles` | Evidence | 2026-11-22 | 2026-11-22 |  |
| [BACKEND_FIRESTORE_ADAPTER_F2_EVIDENCE_20261122.md](BACKEND_FIRESTORE_ADAPTER_F2_EVIDENCE_20261122.md) — F2 — Firestore persistence adapter behind the store port (offline contract proof) | Evidence | 2026-11-22 | 2026-11-22 |  |
| [BACKEND_FIRESTORE_BACKFILL_F3B2_EVIDENCE_20261122.md](BACKEND_FIRESTORE_BACKFILL_F3B2_EVIDENCE_20261122.md) — F3b-2/F3b-3 — Checksum backfill + independent read-back audit + reverse dual-write + cutover runbook (offline  | Evidence | 2026-11-22 | 2026-11-22 | OFFLINE DONE — **NOT executed live, NOT pushed to GAS.** Runtime stays Sheets V50/0.9.2; n |
| [BACKEND_FIRESTORE_GATEWAY_F3A_EVIDENCE_20261122.md](BACKEND_FIRESTORE_GATEWAY_F3A_EVIDENCE_20261122.md) — F3a — real GAS Firestore REST gateway + backend selection flag (offline proof) | Evidence | 2026-11-22 | 2026-11-22 | **OFFLINE DONE.** 19 new tests pass; full `npm run check` **exit 0** (build **60 `.gs` mod |
| [BACKEND_FIRESTORE_INFRA_F4_EVIDENCE_20261122.md](BACKEND_FIRESTORE_INFRA_F4_EVIDENCE_20261122.md) — F4 (infra slice) — Firestore DEV provisioning + service account + connectivity read-back proof | Evidence | 2026-11-22 | 2026-11-22 |  |
| [BACKEND_FIRESTORE_REST_POC1_EVIDENCE_20261122.md](BACKEND_FIRESTORE_REST_POC1_EVIDENCE_20261122.md) — POC #1 — GAS V8 → Firestore REST + service-account OAuth proof (F3a de-risk) | Evidence | 2026-11-22 | 2026-11-22 | **DONE — OFFLINE 10/10 + LIVE GAS RUN #2 PASS 8/8 (2026-11-22 20:57 ICT).** Run #1 (20:25  |
| [BACKEND_SCOPED_OPS_0_9_0_EVIDENCE_20261121.md](BACKEND_SCOPED_OPS_0_9_0_EVIDENCE_20261121.md) — P6 Vehicle Contact — Backend 0.9.0 scoped operations evidence | Evidence | 2026-11-22 | 2026-11-21 |  |
| [C6_ADMIN_VEHICLE_REGISTRY_EVIDENCE_20261121.md](C6_ADMIN_VEHICLE_REGISTRY_EVIDENCE_20261121.md) — C6 — SYSTEM_ADMIN approved-vehicle registry (`vehicles.list`) | Evidence | 2026-11-22 | 2026-11-22 | SOURCE COMPLETE + TEST GREEN + **DEPLOYED LIVE (GAS Web App Version 48, `backendVersion 0. |
| [DATA_MODEL_ER_DIAGRAM_20261122.md](DATA_MODEL_ER_DIAGRAM_20261122.md) — P6 Vehicle Contact — Logical Data Model ER Diagram (DB-agnostic SSOT) | Requirements / design | 2026-11-22 | 2026-11-22 |  |
| [DEV_CLEAN_RESET_EVIDENCE_20261122.md](DEV_CLEAN_RESET_EVIDENCE_20261122.md) — P6 Vehicle Contact — DEV Clean-Init Reset Evidence | Evidence | 2026-11-22 | 2026-11-22 |  |
| [DOCS_SSOT_REFACTOR_PROPOSAL_20261122.md](DOCS_SSOT_REFACTOR_PROPOSAL_20261122.md) — P6 Vehicle Contact — Docs SSOT Refactor PROPOSAL (hierarchy + de-dup + stale marking) | Proposal / decision input | 2026-11-22 | 2026-11-22 | **PROPOSAL — NOT EXECUTED.** This page presents a plan + tradeoffs for **owner scope confi |
| [E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121.md](E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121.md) — E1 — Indexed datastore migration design & owner decision packet | Reference | 2026-11-22 | 2026-11-22 |  |
| [E3_PRODUCTION_SIGNOFF_DOSSIER_20261121.md](E3_PRODUCTION_SIGNOFF_DOSSIER_20261121.md) — E3 — Production sign-off dossier (prepared for owner review) | Proposal / decision input | 2026-11-22 | 2026-11-22 |  |
| [FIRESTORE_PHYSICAL_MAPPING_20261122.md](FIRESTORE_PHYSICAL_MAPPING_20261122.md) — Firestore physical mapping (DERIVED projection of the logical SSOT) | Reference | 2026-11-22 | 2026-11-22 | **Document:** P6VC-FS-MAP-001 |
| [FIRESTORE_REST_LIVE_POC_INCIDENT_20261122.md](FIRESTORE_REST_LIVE_POC_INCIDENT_20261122.md) — Incident — Firestore REST live POC run #1: three real-API contract bugs (FAIL 5/8) | Evidence | 2026-11-22 | 2026-11-22 | **CLOSED — fixed and live-verified.** Offline suite **10/10**, live-shape probe against Fi |
| [FRONTEND_A11Y_CONTRAST_TOUCH_EVIDENCE_20261122.md](FRONTEND_A11Y_CONTRAST_TOUCH_EVIDENCE_20261122.md) — P6 Vehicle Contact — Semantic Contrast (WCAG AA) + Touch-Target Evidence | Evidence | 2026-11-22 | 2026-11-22 | SOURCE-REVIEW EVIDENCE (partial gate matrix; full sign-off pending) |
| [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md) — P6 Vehicle Contact Frontend Architecture | Standard / architecture | 2026-11-22 | 2026-11-22 | Vue SPA POC, Cloudflare `/api/frontend` and GitHub Pages deployment implemented and verifi |
| [FRONTEND_UI_COMPLIANCE_CHECKLIST.md](FRONTEND_UI_COMPLIANCE_CHECKLIST.md) — P6 Vehicle Contact — Frontend UI Compliance Checklist | Engineering reference | 2026-11-22 | 2026-11-18 | REQUIRED MERGE GATE |
| [FRONTEND_UI_DENSITY_P13_EVIDENCE_20261122.md](FRONTEND_UI_DENSITY_P13_EVIDENCE_20261122.md) — P6 Vehicle Contact — P13 Key-Message & Viewport-First Density Evidence | Evidence | 2026-11-22 | 2026-11-22 | SOURCE-REVIEW EVIDENCE (partial gate matrix; full sign-off pending) |
| [FRONTEND_UI_UX_PRINCIPLES.md](FRONTEND_UI_UX_PRINCIPLES.md) — P6 Vehicle Contact — Frontend UI/UX Principles | Engineering reference | 2026-11-22 | 2026-11-22 | REQUIRED BASELINE |
| [FULL_ROLE_USECASE_IMPLEMENTATION_PLAN_20261121.md](FULL_ROLE_USECASE_IMPLEMENTATION_PLAN_20261121.md) — P6 Vehicle Contact — Full Role × Use-Case Implementation Plan | Standard / architecture | 2026-11-22 | 2026-11-22 | PLAN — not yet implemented. Primary-journey approval E2E (10 registrations) still pending  |
| [GAS_DATA_DICTIONARY.md](GAS_DATA_DICTIONARY.md) — P6 Vehicle Contact — Data Dictionary / Schema SSOT (DB-agnostic logical) | Reference | 2026-11-22 | 2026-11-22 | DRAFT TECHNICAL CONTRACT — NOT FINAL DATA-OWNER/PDPA APPROVAL |
| [GAS_GITHUB_ACTIONS_DEPLOYMENT.md](GAS_GITHUB_ACTIONS_DEPLOYMENT.md) — P6 Vehicle Contact — GitHub Actions → GAS Deploy Runbook | Reference | 2026-11-22 | 2026-11-22 |  |
| [GAS_NUMBERFORMAT_DISPLAY_CORRUPTION_INCIDENT_20261121.md](GAS_NUMBERFORMAT_DISPLAY_CORRUPTION_INCIDENT_20261121.md) — GAS Sheets number-format display corruption — root cause, every-sheet repair & build-wrapper drift | Evidence | 2026-11-22 | 2026-11-22 | RESOLVED — the original format incident was repaired idempotently (25 sheets, `valuesUntou |
| [GAS_STAGING_ACCEPTANCE_RUNBOOK.md](GAS_STAGING_ACCEPTANCE_RUNBOOK.md) — P6 Vehicle Contact — GAS Staging Acceptance Operator Runbook | Runbook | 2026-11-22 | 2026-11-22 |  |
| [GAS_TEST_EVIDENCE.md](GAS_TEST_EVIDENCE.md) — Vehicle Contact GAS — Test Evidence & Deployment Status | Evidence | 2026-11-22 | 2026-11-22 |  |
| [LIVE_API_AUTOMATION.md](LIVE_API_AUTOMATION.md) — P6VC Live API Automation | Engineering reference | 2026-11-22 | 2026-11-22 | canonical test design and executable workflow, 2026-11-21. |
| [LIVE_DEV_E2E_EVIDENCE_20261121.md](LIVE_DEV_E2E_EVIDENCE_20261121.md) — P6 Vehicle Contact — Live DEV E2E evidence (A2 approval 10/10 + A3 full regression) | Evidence | 2026-11-22 | 2026-11-22 |  |
| [OPERATION_JOURNAL_RECOVERY_RUNBOOK_20261121.md](OPERATION_JOURNAL_RECOVERY_RUNBOOK_20261121.md) — P6 Vehicle Contact — Operation journal recovery runbook (D-SEQ-05 / D-SEQ-09) | Runbook | 2026-11-22 | 2026-11-22 |  |
| [OWNER_DECISION_BRIEFING_20261122.md](OWNER_DECISION_BRIEFING_20261122.md) — P6 Vehicle Contact — Owner Decision Briefing (one sitting) | Proposal / decision input | 2026-11-22 | 2026-11-22 |  |
| [PHASE1_GOOGLE_SHEETS_DATA_ARCHITECTURE.md](PHASE1_GOOGLE_SHEETS_DATA_ARCHITECTURE.md) — Vehicle Contact — Phase 1 Google Sheets Data Architecture | Standard / architecture | 2026-11-22 | 2026-11-22 | PHASE-1 ARCHITECTURE DIRECTION APPROVED BY OWNER, IMPLEMENTATION NOT YET VERIFIED |
| [PRIMARY_WORKFLOW_DELIVERY_PLAN.md](PRIMARY_WORKFLOW_DELIVERY_PLAN.md) — P6 Vehicle Contact — Primary Workflow Delivery Plan | Plan / process | 2026-11-22 | 2026-11-22 | ACTIVE DEVELOPMENT PLAN / DEVELOPMENT ENVIRONMENT ONLY |
| [PROJECT_MANAGEMENT_PLAN_20261121.md](PROJECT_MANAGEMENT_PLAN_20261121.md) — P6 Vehicle Contact — Project Management / Delivery Execution Plan | Plan / process | 2026-11-22 | 2026-11-22 | ACTIVE slice/gate SSOT. Resume from CURRENT_DELIVERY_STATUS.md; release gates are detailed |
| [QR_CAMERA_RECOVERY_EVIDENCE_20261122.md](QR_CAMERA_RECOVERY_EVIDENCE_20261122.md) — P6 Vehicle Contact — QR Camera Recovery Evidence | Evidence | 2026-11-22 | 2026-11-22 |  |
| [QR_DEVICE_ACCEPTANCE_PLAN_20261122.md](QR_DEVICE_ACCEPTANCE_PLAN_20261122.md) — P6 Vehicle Contact — QR Physical Device Acceptance Plan | Plan / process | 2026-11-22 | 2026-11-22 |  |
| [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md) — P6 Vehicle Contact — Requirements traceability and reconciliation | Requirements / design | 2026-11-22 | 2026-11-17 | REVIEW REQUIRED — audit of existing material; NOT a new product specification |
| [SHEETS_DATA_AUDIT_EVIDENCE_20261122.md](SHEETS_DATA_AUDIT_EVIDENCE_20261122.md) — P6 Vehicle Contact — Independent Sheets SSOT Data Audit | Evidence | 2026-11-22 | 2026-11-22 |  |
| [SYSTEM_AUDIT_EMPTY_REVIEW_QUEUE_20261121.md](SYSTEM_AUDIT_EMPTY_REVIEW_QUEUE_20261121.md) — System audit — empty registration-review queue (correct-empty, not a bug) | Reference | 2026-11-22 | 2026-11-22 |  |
| [WORLD_CLASS_TEST_SUITE_PLAN_20261122.md](WORLD_CLASS_TEST_SUITE_PLAN_20261122.md) — P6 Vehicle Contact — World-Class Test Suite Master Plan | Plan / process | 2026-11-22 | 2026-11-22 |  |
| [BACKEND_JOURNAL_RECOVERY_EVIDENCE_20261121.md](BACKEND_JOURNAL_RECOVERY_EVIDENCE_20261121.md) — P6 Vehicle Contact — B2 operation-journal reconciliation + recovery evidence | Evidence | 2026-11-21 | 2026-11-21 |  |
| [BACKEND_LOGIN_CONSTANT_WORK_EVIDENCE_20261121.md](BACKEND_LOGIN_CONSTANT_WORK_EVIDENCE_20261121.md) — B4 — Login Constant-Work Negative Path (D-SEQ-11) | Evidence | 2026-11-21 | 2026-11-21 |  |
| [BACKEND_ORG_CYCLE_CHECK_EVIDENCE_20261121.md](BACKEND_ORG_CYCLE_CHECK_EVIDENCE_20261121.md) — B1 — Organization Ancestor Cycle Check (D-SEQ-08) | Evidence | 2026-11-21 | 2026-11-21 |  |
| [C1_CHANGE_REVIEW_SCREEN_EVIDENCE_20261121.md](C1_CHANGE_REVIEW_SCREEN_EVIDENCE_20261121.md) — C1 — REGADMIN Change-Approval Screen (list → delta diff → APPROVE/REJECT) | Evidence | 2026-11-21 | 2026-11-21 | SOURCE COMPLETE + TEST GREEN. **Live verification PENDING** the batched GAS re-push (owner |
| [C2_VEHICLE_DETAIL_SCREEN_EVIDENCE_20261121.md](C2_VEHICLE_DETAIL_SCREEN_EVIDENCE_20261121.md) — C2 — Unified Vehicle Detail Read (contacts / photos / history) | Evidence | 2026-11-21 | 2026-11-21 | SOURCE COMPLETE + TEST GREEN + FE BUILD GREEN. **Live-verifiable now** — `vehicles.detail` |
| [C3_VEHICLE_MAINTENANCE_SCREEN_EVIDENCE_20261121.md](C3_VEHICLE_MAINTENANCE_SCREEN_EVIDENCE_20261121.md) — C3 — Vehicle Maintenance Edit (update / owner link / contact / photo replace / cancel) | Evidence | 2026-11-21 | 2026-11-21 | SOURCE COMPLETE + TEST GREEN + FE BUILD GREEN. **Live-verifiable now** — `vehicles.update` |
| [C4_MY_VEHICLES_SCREEN_EVIDENCE_20261121.md](C4_MY_VEHICLES_SCREEN_EVIDENCE_20261121.md) — C4 — OWNER `my-vehicles` (list → submit change → track) | Evidence | 2026-11-21 | 2026-11-21 | SOURCE COMPLETE + TEST GREEN + FE BUILD GREEN. **Live-verifiable now** — all three ops (`v |
| [E2_WORKER_FAILCLOSED_EVIDENCE_20261121.md](E2_WORKER_FAILCLOSED_EVIDENCE_20261121.md) — E2 — Cross-role authorization regression + Worker fail-closed probes (2026-11-21) | Evidence | 2026-11-21 | 2026-11-21 |  |
| [FRONTEND_WORKER_ALLOWLIST_DRIFT_EVIDENCE_20261121.md](FRONTEND_WORKER_ALLOWLIST_DRIFT_EVIDENCE_20261121.md) — P6 Vehicle Contact — F0 Worker allowlist expansion + permission-contract drift fix | Evidence | 2026-11-21 | 2026-11-21 |  |
| [GAS_CLASP_WEBAPP_MANIFEST_INCIDENT_20261121.md](GAS_CLASP_WEBAPP_MANIFEST_INCIDENT_20261121.md) — GAS clasp redeploy — Web App 404 incident & webapp manifest fix | Evidence | 2026-11-21 | 2026-11-21 | RESOLVED — live Web App **Version 41**, `system.health` `status:ready` / `backendVersion:0 |
| [REFERENCE_BRAND_CATALOG_UX_01_EVIDENCE_20261121.md](REFERENCE_BRAND_CATALOG_UX_01_EVIDENCE_20261121.md) — P6 Vehicle Contact — Brand Catalog and Custom Entry Evidence | Evidence | 2026-11-21 | 2026-11-21 |  |
| [REFERENCE_CATALOG_SEED_PROPOSAL.md](REFERENCE_CATALOG_SEED_PROPOSAL.md) — P6 Vehicle Contact — Reference Catalog Seed Proposal | Proposal / decision input | 2026-11-21 | 2026-11-21 | APPROVED FOR IMPLEMENTATION — NOT APPROVED FOR GAS PUSH OR SEED APPLY |
| [REFERENCE_CATALOG_SEED_V1_EVIDENCE_20261121.md](REFERENCE_CATALOG_SEED_V1_EVIDENCE_20261121.md) — P6 Vehicle Contact — Reference Catalog Seed v1 Evidence | Evidence | 2026-11-21 | 2026-11-21 |  |
| [REFERENCE_COLOR_MODEL_UX_01_EVIDENCE_20261121.md](REFERENCE_COLOR_MODEL_UX_01_EVIDENCE_20261121.md) — P6 Vehicle Contact — Color Defaults and Free-text Model Evidence | Evidence | 2026-11-21 | 2026-11-21 |  |
| [REFERENCE_SEED_COERCION_INCIDENT_20261121.md](REFERENCE_SEED_COERCION_INCIDENT_20261121.md) — P6 Vehicle Contact — Reference Seed Coercion Incident & Recovery Evidence | Evidence | 2026-11-21 | 2026-11-21 |  |
| [SHEETSTORE_COERCION_FIX_AND_SHEETS_BEST_PRACTICES_20261121.md](SHEETSTORE_COERCION_FIX_AND_SHEETS_BEST_PRACTICES_20261121.md) — P6 Vehicle Contact — SheetStore Coercion Fix & Google Sheets Engineering Best Practices | Reference | 2026-11-21 | 2026-11-21 | Fix merged to `main` (`0d3b1f6`, PRs #86 + #87); deployment verification pending owner pub |
| [SYNTHETIC_REGISTRATION_E2E_20261121.md](SYNTHETIC_REGISTRATION_E2E_20261121.md) — P6 Vehicle Contact — Synthetic Registration E2E Evidence (10 submissions) | Reference | 2026-11-21 | 2026-11-21 |  |
| [DEVELOPMENT_ROADMAP_PHASE1.md](DEVELOPMENT_ROADMAP_PHASE1.md) — P6 Vehicle Contact — Phase 1 Development Roadmap & Work Breakdown | Plan / process | 2026-11-20 | 2026-11-20 | **Status: REQUIRED / LEGAL APPLICABILITY AND IMPLEMENTATION NOT YET VERIFIED.** This is a  |
| [FRONTEND_FE_QR_RESOLVE_01_EVIDENCE_20261120.md](FRONTEND_FE_QR_RESOLVE_01_EVIDENCE_20261120.md) — FE-QR-RESOLVE-01 — Authenticated QR Resolve Evidence | Evidence | 2026-11-20 | 2026-11-20 |  |
| [FRONTEND_FE_REFERENCE_CATALOG_01_EVIDENCE_20261120.md](FRONTEND_FE_REFERENCE_CATALOG_01_EVIDENCE_20261120.md) — FE-REFERENCE-CATALOG-01 evidence — 2026-11-20 | Evidence | 2026-11-20 | 2026-11-20 |  |
| [FRONTEND_FE_REGISTRATION_ADMIN_01_EVIDENCE_20261120.md](FRONTEND_FE_REGISTRATION_ADMIN_01_EVIDENCE_20261120.md) — FE-REGISTRATION-ADMIN-01 — Registration Review Evidence | Evidence | 2026-11-20 | 2026-11-20 |  |
| [FRONTEND_FE_REGISTRATION_INTAKE_01_EVIDENCE_20261120.md](FRONTEND_FE_REGISTRATION_INTAKE_01_EVIDENCE_20261120.md) — FE-REGISTRATION-INTAKE-01 — Assisted Vehicle Registration Evidence | Evidence | 2026-11-20 | 2026-11-20 |  |
| [FRONTEND_ROLE_DELIVERY_BLUEPRINT.md](FRONTEND_ROLE_DELIVERY_BLUEPRINT.md) — P6 Vehicle Contact — Role-based Frontend Delivery Blueprint | Standard / architecture | 2026-11-20 | 2026-11-20 | DELIVERY BASELINE — ACTOR COVERAGE UNDER PRIMARY JOURNEY |
| [REFERENCE_CATALOG_BACKEND_01_EVIDENCE_20261120.md](REFERENCE_CATALOG_BACKEND_01_EVIDENCE_20261120.md) — REFERENCE-CATALOG-BACKEND-01 evidence — 2026-11-20 | Evidence | 2026-11-20 | 2026-11-20 |  |
| [BACKEND_ACCEPTANCE_REPORT_20261117.md](BACKEND_ACCEPTANCE_REPORT_20261117.md) — P6 Vehicle Contact — Backend Acceptance Test Report | Engineering reference | 2026-11-19 | 2026-11-17 |  |
| [FRONTEND_FE_SHARED_01_EVIDENCE_20261119.md](FRONTEND_FE_SHARED_01_EVIDENCE_20261119.md) — FE-SHARED-01 — Shared Shell Compliance Evidence | Evidence | 2026-11-19 | 2026-11-19 |  |
| [FRONTEND_FE_STAFF_01_EVIDENCE_20261119.md](FRONTEND_FE_STAFF_01_EVIDENCE_20261119.md) — FE-STAFF-01 — Vehicle Search Compliance Evidence | Evidence | 2026-11-19 | 2026-11-19 |  |
| [FRONTEND_FE_SYSTEM_ADMIN_COMPLETE_EVIDENCE_20261119.md](FRONTEND_FE_SYSTEM_ADMIN_COMPLETE_EVIDENCE_20261119.md) — FE-SYSTEM-ADMIN-COMPLETE — Contract-First Delivery Evidence | Evidence | 2026-11-19 | 2026-11-19 |  |
| [FRONTEND_FE_SYSTEM_ADMIN_NAVIGATION_01_EVIDENCE_20261119.md](FRONTEND_FE_SYSTEM_ADMIN_NAVIGATION_01_EVIDENCE_20261119.md) — FE-SYSTEM-ADMIN-NAVIGATION-01 — Permission Coverage Evidence | Evidence | 2026-11-19 | 2026-11-19 |  |
| [FRONTEND_FE_SYSTEM_ADMIN_PAGINATION_EVIDENCE_20261119.md](FRONTEND_FE_SYSTEM_ADMIN_PAGINATION_EVIDENCE_20261119.md) — SYSTEM_ADMIN pagination and responsive input evidence | Evidence | 2026-11-19 | 2026-11-19 |  |
| [FRONTEND_FE_SYSTEM_ADMIN_USERS_01_EVIDENCE_20261119.md](FRONTEND_FE_SYSTEM_ADMIN_USERS_01_EVIDENCE_20261119.md) — FE-SYSTEM-ADMIN-USERS-01 — User Directory Compliance Evidence | Evidence | 2026-11-19 | 2026-11-19 |  |
| [FRONTEND_RELEASE_INFO_INITIAL_PASSWORD_EVIDENCE_20261119.md](FRONTEND_RELEASE_INFO_INITIAL_PASSWORD_EVIDENCE_20261119.md) — P6 Vehicle Contact — Release Info, Initial Password UX and Synthetic Bootstrap Evidence | Evidence | 2026-11-19 | 2026-11-19 |  |
| [GAS_HTTP_LOGIN_TARGET_RECONCILIATION_20261118.md](GAS_HTTP_LOGIN_TARGET_RECONCILIATION_20261118.md) — P6 Vehicle Contact — Owner-Confirmed Login Test Target Reconciliation | Reference | 2026-11-19 | 2026-11-18 | Target and test account **confirmed from Sheet**; successful real HTTP `auth.login` **NOT  |
| [GAS_LIVE_API_TEST_EVIDENCE.md](GAS_LIVE_API_TEST_EVIDENCE.md) — P6 Vehicle Contact — Live HTTP API Test Evidence | Evidence | 2026-11-19 | 2026-11-17 | PASS — 7/7 **BOOTSTRAP** HTTP API test cases; protected business endpoints intentionally d |
| [ENGINEERING_TEAM_CHARTER.md](ENGINEERING_TEAM_CHARTER.md) — P6 Vehicle Contact — Engineering Team Charter (Role-Based) | Standard / architecture | 2026-11-18 | 2026-11-18 | APPROVED — Role-based operating model; **not** personnel hiring, GitHub collaborator provi |
| [FRONTEND_COMPONENT_ARCHITECTURE_PATTERNS.md](FRONTEND_COMPONENT_ARCHITECTURE_PATTERNS.md) — P6 Vehicle Contact — Component Architecture and Design Patterns | Standard / architecture | 2026-11-18 | 2026-11-18 | REQUIRED PATTERN CATALOG |
| [FRONTEND_DESIGN_SYSTEM_BLUEPRINT.md](FRONTEND_DESIGN_SYSTEM_BLUEPRINT.md) — P6 Vehicle Contact — Frontend Design System Blueprint | Standard / architecture | 2026-11-18 | 2026-11-18 | REQUIRED IMPLEMENTATION BLUEPRINT |
| [FRONTEND_ENGINEERING_STANDARD.md](FRONTEND_ENGINEERING_STANDARD.md) — P6 Vehicle Contact — Frontend Engineering Standard | Standard / architecture | 2026-11-18 | 2026-11-18 | REQUIRED ENGINEERING BASELINE |
| [FRONTEND_POC_EVIDENCE_20261118.md](FRONTEND_POC_EVIDENCE_20261118.md) — Frontend-to-GAS POC Evidence — 2026-11-18 | Evidence | 2026-11-18 | 2026-11-18 |  |
| [FRONTEND_REFERENCE_REGISTER.md](FRONTEND_REFERENCE_REGISTER.md) — P6 Vehicle Contact — Frontend Reference Register | Engineering reference | 2026-11-18 | 2026-11-18 | CONTROLLED REFERENCE REGISTER |
| [GAS_HTTP_LOGIN_TEST_EVIDENCE_20261118.md](GAS_HTTP_LOGIN_TEST_EVIDENCE_20261118.md) — P6 Vehicle Contact — Live HTTP Login Acceptance Evidence (2026-11-18) | Evidence | 2026-11-18 | 2026-11-18 | `LOGIN_HTTP_BLOCKED_ENVIRONMENT_IDENTITY_UNVERIFIED`. Review required by Backend + Securit |
| [GAS_LIVE_OWNER_DEV_REGRESSION_20261118.md](GAS_LIVE_OWNER_DEV_REGRESSION_20261118.md) — P6 Vehicle Contact — Live Owner Development Regression | Reference | 2026-11-18 | 2026-11-18 |  |
| [APPROVED_REQUIREMENTS_BASELINE_R01_R26.md](APPROVED_REQUIREMENTS_BASELINE_R01_R26.md) — P6 Vehicle Contact — Approved Business Requirements Baseline (Interview R01–R26) | Requirements / design | 2026-11-17 | 2026-11-17 |  |
| [BACKEND_SOURCE_COVERAGE_20261117.md](BACKEND_SOURCE_COVERAGE_20261117.md) — P6 Vehicle Contact — 50 API source coverage (not test evidence) | Engineering reference | 2026-11-17 | 2026-11-17 | **SOURCE WRITTEN 50/50; UNVERIFIED; NOT DEPLOYED.** |
| [DOCUMENT_CONSISTENCY_QC_2026-11-17.md](DOCUMENT_CONSISTENCY_QC_2026-11-17.md) — Document Consistency & QC — P6 Vehicle Contact and Framework | Reference | 2026-11-17 | 2026-11-17 | **DOCUMENT CROSS-REFERENCE QC COMPLETED; POLICY/LEGAL/DEVICE ACCEPTANCE OPEN** |
| [EXECUTIVE_BRIEF.md](EXECUTIVE_BRIEF.md) — Executive Policy Brief — MT Vehicle Contact v1.0 | Reference | 2026-11-17 | 2026-10-30 | **Date:** 2026-10-30 |
| [GAS_BACKEND_ARCHITECTURE_CONFORMANCE_20261117.md](GAS_BACKEND_ARCHITECTURE_CONFORMANCE_20261117.md) — P6 Vehicle Contact — GAS Backend Architecture Conformance Review | Standard / architecture | 2026-11-17 | 2026-11-17 |  |
| [GAS_STAGING_BOOTSTRAP.md](GAS_STAGING_BOOTSTRAP.md) — Synthetic staging bootstrap — P6 Vehicle Contact | Reference | 2026-11-17 | 2026-11-17 |  |
| [IMPLEMENTATION_READY_SPEC_PHASE1.md](IMPLEMENTATION_READY_SPEC_PHASE1.md) — P6 Vehicle Contact — Implementation Specification, Phase 1 | Reference | 2026-11-17 | 2026-11-17 | ENGINEERING-READY FOR SYNTHETIC DEVELOPMENT; PRODUCTION GATES OPEN. |
| [IMPLEMENTATION_TEST_MATRIX_PHASE1.md](IMPLEMENTATION_TEST_MATRIX_PHASE1.md) — P6 Vehicle Contact — Implementation Test Matrix | Engineering reference | 2026-11-17 | 2026-11-17 | **Document ID:** P6VC-TEST-IMPL-001 |
| [POC_QR_SCANNER.md](POC_QR_SCANNER.md) — POC — QR Scanner on Android & iOS | Reference | 2026-11-17 | 2026-10-30 | PARTIAL POC PASS — real-device camera access confirmed by project owner for Android and iO |
| [SCHEMA_SYNC_IMPLEMENTATION.md](SCHEMA_SYNC_IMPLEMENTATION.md) — P6 Vehicle Contact — Schema Sync Implementation, Phase 1 | Requirements / design | 2026-11-17 | 2026-11-17 |  |
| [SYSTEM_ANALYST_BASELINE_PHASE1.md](SYSTEM_ANALYST_BASELINE_PHASE1.md) — P6 Vehicle Contact — System Analyst Baseline (Phase 1) | Reference | 2026-11-17 | 2026-11-17 | BASELINED FOR DEVELOPMENT PLANNING; policy/PDPA/security decisions listed as OPEN; not a p |
| [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md) — Technical Design — MT Vehicle Contact v1.0 | Reference | 2026-11-17 | 2026-11-17 | PROPOSED. Technical decisions are candidates until PoC/security review. |
| [VEHICLE_MEDIA_STORAGE_DESIGN.md](VEHICLE_MEDIA_STORAGE_DESIGN.md) — P6 Vehicle Contact — Phase 1 Vehicle Media Storage Design | Reference | 2026-11-17 | 2026-11-17 | PHYSICAL MEDIA ROOT SELECTED AND BASE DIRECTORIES CREATED. Registration upload pipeline, s |
| [EXECUTIVE_APPROVAL_PROPOSAL_V2.md](EXECUTIVE_APPROVAL_PROPOSAL_V2.md) — โครงการพัฒนาระบบตรวจสอบและติดต่อผู้รับผิดชอบยานพาหนะ ภายในพื้นที่ตำรวจภูธรภาค 6 | Proposal / decision input | 2026-11-16 | 2026-10-31 |  |
| [FORMAL_PROJECT_PROPOSAL.md](FORMAL_PROJECT_PROPOSAL.md) — โครงการพัฒนาระบบตรวจสอบและติดต่อผู้รับผิดชอบยานพาหนะภายในพื้นที่ตำรวจภูธรภาค 6 | Proposal / decision input | 2026-11-16 | 2026-10-31 |  |
| [PDPA_REVIEW_CHECKLIST.md](PDPA_REVIEW_CHECKLIST.md) — PDPA Review Checklist — MT Vehicle Contact | Compliance | 2026-11-16 | 2026-10-31 | Preliminary research, pending formal legal review. Date: 2026-10-31. |
| [PDPA_ROPA_REGISTER.md](PDPA_ROPA_REGISTER.md) — ROPA — MT Vehicle Contact (ฉบับพร้อมให้ตรวจรับ) | Compliance | 2026-11-16 | 2026-10-31 |  |
| [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) — Product Requirements Document — MT Vehicle Contact v1.0 | Requirements / design | 2026-11-16 | 2026-10-30 | PROPOSED |
| [QR_STICKER_COST_COMPARISON_2026-10-31.md](QR_STICKER_COST_COMPARISON_2026-10-31.md) — รายงานศึกษาราคาและเปรียบเทียบการผลิตสติกเกอร์ QR Code | Engineering reference | 2026-11-16 | 2026-10-31 |  |
| [SYSTEM_ANALYSIS_V2.md](SYSTEM_ANALYSIS_V2.md) — P6 Vehicle Contact — System Analysis & Design v2.0 | Reference | 2026-11-16 | 2026-10-31 |  |
| [TEAM_UPSKILL_RESEARCH_2026-10-31.md](TEAM_UPSKILL_RESEARCH_2026-10-31.md) — MT Vehicle Contact — Team Upskill / Reskill Research | Engineering reference | 2026-11-16 | 2026-10-31 | **Research date:** 31 ตุลาคม 2569 |
| [WORKFLOW_AND_MEDIA_PIPELINE.md](WORKFLOW_AND_MEDIA_PIPELINE.md) — MT Vehicle Contact v1.0 — Workflow & Photo Pipeline | Plan / process | 2026-11-16 | 2026-10-30 | PROPOSED / Implementation-ready design draft |
| [TUNEUP_FIRESTORE_READS_20261125.md](TUNEUP_FIRESTORE_READS_20261125.md) — Tune-up: Firestore reads and unnecessary parts (2026-11-25) | Reference | — | 2026-11-25 |  |

## 3. กติกาความสด (freshness rules)

- ทุกเอกสารควรมี **วันที่** (Last verified / Date / snapshot date) — `⚠ ไม่ระบุ` ในตารางคือกลุ่มที่ต้องเติมเมื่อแก้ครั้งถัดไป
- เอกสารที่ถูกแทนที่ให้ติดป้าย **SUPERSEDED BY …** ที่หัวไฟล์ ไม่ลบ (เก็บประวัติตาม §2.5)
- ตัวเลขที่ขึ้นกับเวลา (เช่น 97/97, 2,464 docs, V52) ให้ quote พร้อมวันที่/แหล่ง; ตัวเลขปัจจุบันอยู่ใน `CURRENT_DELIVERY_STATUS.md` เท่านั้น
- Prompt สำหรับ AI ถัดไปมี **ชุดเดียว** ที่ [PROJECT_HANDOVER](PROJECT_HANDOVER.md) §1; handoff doc อ้างอิง ไม่ทำสำเนา
