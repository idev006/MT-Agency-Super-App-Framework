# P6 Vehicle Contact — App 001

**App ID:** `vehicle-contact`  
**Version:** 1.0.0-draft | **Status:** PROPOSED, awaiting stakeholder sign-off  
**Parent SSOT:** [MT Agency Super App Master Blueprint](../../blueprint/MASTER_WEB_APP_BLUEPRINT.md)  
**Date:** 2026-10-30 | **Priority:** urgent policy delivery

> **Resume after an inaccessible chat:** [PROJECT_HANDOVER.md](docs/PROJECT_HANDOVER.md) — evidence-based source map, actual API test scope, deploy versions, open security gates and ready-to-paste continuation instruction. Verify live Issues/CI before acting.\n\n## Mission
เมื่อพบรถในสถานที่ราชการ ผู้บังคับบัญชาหรือเจ้าหน้าที่ที่ได้รับสิทธิ์ต้องทราบว่า **ใครเป็นผู้รับผิดชอบรถคันนี้ และจะโทรติดต่อได้อย่างไร** อย่างรวดเร็ว ผ่านมือถือ Android/iOS

**MVP core flow:** register vehicle → issue QR → scan QR (or manual plate search) → show matched vehicle/person → tap to call.

## Use Case / Sequence Diagram SSOT (Phase 1)
- [20 Source-Reviewed Use Cases and Mermaid Sequence Diagrams](docs/use-cases/README.md) map all **50 declared API v1 operations** to one owner, actor, main/error flows, storage side effects and test identifiers.
- [Requirements-to-API-to-Test Traceability Matrix](docs/traceability-matrix.md) records known contract and code discrepancies requiring decisions; [MT UML Design Standard](../../blueprint/standards/USE_CASE_SEQUENCE_STANDARD.md) governs FE/BE design reviews.
- **Design only:** Real GAS Editor acceptance and authenticated staging HTTP remain unverified. Treat earlier draft architecture and stale counts below as historical where superseded by these canonical Phase-1 documents.

## Phase 1 technology direction (2026-11-17)
**Approved architecture direction:** Vehicle Contact Phase 1 uses Google Sheets as the primary datastore: **one worksheet/tab = one logical table** within an application spreadsheet. The app-specific GAS Backend API accesses these tables via domain ports and Sheets repository adapters. Frontend communicates through its GAS API adapter and a verified, non-bypassable security boundary. **Username/Password Phase 1 authentication** replaces reliance on the unfinished MT-I-AM; production credential/session design and direct GAS endpoint protection are still open security gates. Earlier Supabase-centric design paragraphs are historical draft alternatives, not the Phase 1 choice. See [Phase 1 Google Sheets Data Architecture](docs/PHASE1_GOOGLE_SHEETS_DATA_ARCHITECTURE.md).

## Live GAS HTTP API test
- [7/7 real GET/POST API tests PASS](docs/GAS_LIVE_API_TEST_EVIDENCE.md) via [GitHub Actions](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44036525176), using synthetic requests only. Protected groups remain disabled and untested for production security.

## GitHub source-mirrored GAS modules (2026-11-17)
- [Exact GitHub source → 14 Apps Script file mapping](docs/GAS_MODULE_MAPPING.md). [Verified GitHub Actions run 44035053861](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44035053861) pushed 15 files and created GAS version 5; Web App publication and live runtime tests remain open.
- GAS project file list is flat; path segments appear in filenames with `# P6 Vehicle Contact — App 001

**App ID:** `vehicle-contact`  
**Version:** 1.0.0-draft | **Status:** PROPOSED, awaiting stakeholder sign-off  
**Parent SSOT:** [MT Agency Super App Master Blueprint](../../blueprint/MASTER_WEB_APP_BLUEPRINT.md)  
**Date:** 2026-10-30 | **Priority:** urgent policy delivery

## Mission
เมื่อพบรถในสถานที่ราชการ ผู้บังคับบัญชาหรือเจ้าหน้าที่ที่ได้รับสิทธิ์ต้องทราบว่า **ใครเป็นผู้รับผิดชอบรถคันนี้ และจะโทรติดต่อได้อย่างไร** อย่างรวดเร็ว ผ่านมือถือ Android/iOS

**MVP core flow:** register vehicle → issue QR → scan QR (or manual plate search) → show matched vehicle/person → tap to call.

## Phase 1 technology direction (2026-11-17)
**Approved architecture direction:** Vehicle Contact Phase 1 uses Google Sheets as the primary datastore: **one worksheet/tab = one logical table** within an application spreadsheet. The app-specific GAS Backend API accesses these tables via domain ports and Sheets repository adapters. Frontend communicates through its GAS API adapter and a verified, non-bypassable security boundary. **Username/Password Phase 1 authentication** replaces reliance on the unfinished MT-I-AM; production credential/session design and direct GAS endpoint protection are still open security gates. Earlier Supabase-centric design paragraphs are historical draft alternatives, not the Phase 1 choice. See [Phase 1 Google Sheets Data Architecture](docs/PHASE1_GOOGLE_SHEETS_DATA_ARCHITECTURE.md).

. Build + tests enforce <=800 lines per file.

## GAS deployment automation
- [Manually dispatched GitHub Actions → GAS deployment](../../.github/workflows/deploy-vehicle-gas.yml) targets the user-supplied Script ID. [Setup and security runbook](docs/GAS_GITHUB_ACTIONS_DEPLOYMENT.md). **Workflow configured, not yet authenticated/executed; no Web App deployment.**

## Live Agile Kanban tracking
- [Agile Kanban — live GitHub Issues lanes](docs/AGILE_KANBAN.md) and [repository Issues](https://github.com/idev006/MT-Agency-Super-App-Framework/issues): **29 work items VC-W01–VC-W29 created**, 4 completed with evidence and closed; remaining items tracked via `status:*`, `area:*`, `priority:*` labels.
- This is an **issue-backed Kanban** with live filtered GitHub lists; **no native GitHub Projects board has been created**. Owner/review assignments and target dates are pending actual team decisions.

## Development management — Phase 1 (2026-11-17)
- [System Analyst Baseline](docs/SYSTEM_ANALYST_BASELINE_PHASE1.md) — problem, actors, business processes, requirements, use cases, architecture, data model and open decisions; planning baseline, **not policy/PDPA release approval**.
- [Development Roadmap & Backlog](docs/DEVELOPMENT_ROADMAP_PHASE1.md) — M0–M6 milestones, VC-W01–VC-W22 work items, dependencies, acceptance evidence, security-first critical path and Phase-1 no-pass boundaries.
- **Next safe work:** data dictionary / fake Sheets repository tests / Vue mock shell / secure-auth ADR. Protected PII APIs stay disabled until direct-GAS bypass protection, username/password session and permissions are proven.

## Canonical Data Dictionary & Controlled Schema Sync (Phase 1)
- [Canonical database.schema.json](schema/database.schema.json) is the **single authoritative schema** for the six candidate Sheets tables, not a second dictionary in Google Sheets.
- [Data Dictionary workflow](docs/GAS_DATA_DICTIONARY.md) and [Schema Sync implementation](docs/SCHEMA_SYNC_IMPLEMENTATION.md) define **detect-and-propose only**. Changes made in Google Sheets can be identified as a review-required proposal; they do not auto-update GitHub or alter columns.
- Admin-only GAS editor functions inspect existing Sheets headers after GAS deployment; these operations are **not** public API routes. Migration and scheduled triggers are deferred.

## Phase 1 vehicle photo storage
The selected media root is Google Drive [uploads](https://drive.google.com/drive/folders/1H_gIVF04LfLlgDRvOApcrY835Rd4LGEW), a child of the private project folder. Under it, `vehicles/`, `staging/`, and `quarantine/` were created; per-vehicle photo folders are **on-demand design only**, not operational yet. See [Media Storage Design](docs/VEHICLE_MEDIA_STORAGE_DESIGN.md). Folder/share security and the five-photo minimum are not approved for production.

## Documents
- [DOCUMENT_CONSISTENCY_QC_2026-11-17.md](docs/DOCUMENT_CONSISTENCY_QC_2026-11-17.md) — รายงานตรวจความสอดคล้องเอกสาร ประเด็นแก้ไข และรายการรออนุมัติ (QC 17 พ.ย. 2569)
- [REQUIREMENTS_TRACEABILITY.md](docs/REQUIREMENTS_TRACEABILITY.md) — ตรวจการเชื่อมโยงข้อกำหนด/เอกสาร/โค้ด/หลักฐาน และรายการที่ขัดแย้งรออนุมัติ
- [DECISION_LOG.md](docs/DECISION_LOG.md) — บันทึกการตัดสินใจเฉพาะโครงการและสถานะอนุมัติ
- [QR_STICKER_COST_COMPARISON_2026-10-31.md](docs/QR_STICKER_COST_COMPARISON_2026-10-31.md) — ราคาสำรวจและเปรียบเทียบ Solution A4+เคลือบ กับจ้างพิมพ์ UV/กันน้ำ 1 ปี
- [EXECUTIVE_APPROVAL_PROPOSAL_V2.md](docs/EXECUTIVE_APPROVAL_PROPOSAL_V2.md) — เอกสารเสนอผู้บังคับบัญชาฉบับปรับปรุง 2.0 (ร่างอนุมัติหลักการ)
- [SYSTEM_ANALYSIS_V2.md](docs/SYSTEM_ANALYSIS_V2.md) — Actors / Use Cases / Workflows / Data Model / Security / QC Gates
- [TEAM_UPSKILL_RESEARCH_2026-10-31.md](docs/TEAM_UPSKILL_RESEARCH_2026-10-31.md) — แหล่งเรียนรู้ทางการและแผน QC ของทีมตามบทบาท
- [SENIOR_THAI_LEGAL_COUNSEL_ROLE.md](docs/SENIOR_THAI_LEGAL_COUNSEL_ROLE.md) — บทบาทนิติกรอาวุโส กฎหมายไทย/PDPA/ดิจิทัล และ Legal QC Gates
- [PDPA_ROPA_REGISTER.md](docs/PDPA_ROPA_REGISTER.md) — PDPA operational draft; pending DPO/legal approval
- [PDPA_LAWFUL_BASIS_DECISION.md](docs/PDPA_LAWFUL_BASIS_DECISION.md) — PDPA operational draft; pending DPO/legal approval
- [PDPA_PRIVACY_NOTICES.md](docs/PDPA_PRIVACY_NOTICES.md) — PDPA operational draft; pending DPO/legal approval
- [PDPA_CONSENT_AND_RIGHTS.md](docs/PDPA_CONSENT_AND_RIGHTS.md) — PDPA operational draft; pending DPO/legal approval
- [PDPA_DATA_RETENTION_AND_RELEASE_GATE.md](docs/PDPA_DATA_RETENTION_AND_RELEASE_GATE.md) — PDPA operational draft; pending DPO/legal approval
- [PDPA_GOVERNANCE_PACK.md](docs/PDPA_GOVERNANCE_PACK.md) — Draft ROPA, legal-basis assessment, staff/visitor privacy notices, consent decision, and privacy gate
- [FORMAL_PROJECT_PROPOSAL.md](docs/FORMAL_PROJECT_PROPOSAL.md) — ร่างเสนอโครงการฉบับทางการ ตามแนวทาง สศช. พร้อมบันทึก QC
- [PROJECT_PROPOSAL_POLICY_DRIVEN.md](docs/PROJECT_PROPOSAL_POLICY_DRIVEN.md) — ข้อเสนอโครงการเชิงนโยบาย Workflow ทางเข้า–ออก, Stakeholders, และ QC (ร่างเพื่อพิจารณา)
- [POC_QR_SCANNER.md](docs/POC_QR_SCANNER.md) — Android/iOS camera POC evidence, remaining QR decoding gates
- [EXECUTIVE_BRIEF.md](docs/EXECUTIVE_BRIEF.md) — policy outcomes, executive narrative and pilot KPIs
- [PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md) — problem, users, functional rules, screens, scope
- [TECHNICAL_DESIGN.md](docs/TECHNICAL_DESIGN.md) — data model, security, API, integration
- [TEST_AND_DELIVERY.md](docs/TEST_AND_DELIVERY.md) — tests, readiness and delivery gates
- [WORKFLOW_AND_MEDIA_PIPELINE.md](docs/WORKFLOW_AND_MEDIA_PIPELINE.md) — 5-angle vehicle images, registration/scan workflows, secure upload pipeline

## Scope freeze — v1
**IN:** vehicle registration, responsible contact, optional 0–5 labeled vehicle photos, printable opaque QR, mobile scanner with front/rear camera, authorized vehicle lookup, tap-to-call, manual search, basic management and audit.

**Fast-rollout rule:** photos improve physical comparison but are **not mandatory** to activate a valid contact record or issue QR in v1.

**OUT:** parking rights, zone authorization, automatic LINE messages, relocation workflow/status, dashboard, AI plate recognition, barrier/CCTV integration.

## Guiding design choices
- The **registered responsible contact** is not necessarily the legal owner. Do not claim verified ownership without authoritative evidence.
- QR contains opaque unpredictable reference only, not personal information or a phone number.
- Anonymous visitors to the QR URL receive login/safe landing only; personal data requires authenticated app permission.
- Supabase (proposed) is authoritative for identity, vehicle/contact data and authorization. GAS/Sheets may support controlled import/export, not decide access.
- One-login promise applies to internal Super App modules sharing a valid session; account linking/LINE flows require PoC.
- Prefer speed of use over feature accumulation, not over security.

## Decisions awaiting confirmation
Production contact display policy, responsible data owner, permitted personnel directory source, initial registration/import workflow, QR-decoding and camera-switching on real iOS/Android/LINE environments (Android and iOS camera access confirmed by owner on 2026-10-30), app owner and deployment permissions.

## Next action
Review requirements with policy sponsor → lock v1 scope → validate security, user onboarding and contact accuracy → implement in staging with synthetic test data.


## Document architecture
Project-only requirements, proposals, privacy documents and tests are in [docs/](docs/). All web apps follow the [Master Web App Blueprint](../../blueprint/MASTER_WEB_APP_BLUEPRINT.md). QR Scanner POC canonical source is in [poc/qr-scanner/](poc/qr-scanner/README.md). GitHub Pages deployment builds ephemeral files from it through [the central portal pipeline](../../portal/README.md); no copies live in `docs/`.
