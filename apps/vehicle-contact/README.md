# MT Vehicle Contact — App 001

**App ID:** `vehicle-contact`  
**Version:** 1.0.0-draft | **Status:** PROPOSED, awaiting stakeholder sign-off  
**Parent SSOT:** [MT Agency Super App Master Blueprint](../../docs/MASTER_BLUEPRINT.md)  
**Date:** 2026-10-30 | **Priority:** urgent policy delivery

## Mission
เมื่อพบรถในสถานที่ราชการ ผู้บังคับบัญชาหรือเจ้าหน้าที่ที่ได้รับสิทธิ์ต้องทราบว่า **ใครเป็นผู้รับผิดชอบรถคันนี้ และจะโทรติดต่อได้อย่างไร** อย่างรวดเร็ว ผ่านมือถือ Android/iOS

**MVP core flow:** register vehicle → issue QR → scan QR (or manual plate search) → show matched vehicle/person → tap to call.

## Documents
- [PDPA_ROPA_REGISTER.md](PDPA_ROPA_REGISTER.md) — PDPA operational draft; pending DPO/legal approval
- [PDPA_LAWFUL_BASIS_DECISION.md](PDPA_LAWFUL_BASIS_DECISION.md) — PDPA operational draft; pending DPO/legal approval
- [PDPA_PRIVACY_NOTICES.md](PDPA_PRIVACY_NOTICES.md) — PDPA operational draft; pending DPO/legal approval
- [PDPA_CONSENT_AND_RIGHTS.md](PDPA_CONSENT_AND_RIGHTS.md) — PDPA operational draft; pending DPO/legal approval
- [PDPA_DATA_RETENTION_AND_RELEASE_GATE.md](PDPA_DATA_RETENTION_AND_RELEASE_GATE.md) — PDPA operational draft; pending DPO/legal approval
- [PDPA_GOVERNANCE_PACK.md](PDPA_GOVERNANCE_PACK.md) — Draft ROPA, legal-basis assessment, staff/visitor privacy notices, consent decision, and privacy gate
- [FORMAL_PROJECT_PROPOSAL.md](FORMAL_PROJECT_PROPOSAL.md) — ร่างเสนอโครงการฉบับทางการ ตามแนวทาง สศช. พร้อมบันทึก QC
- [PROJECT_PROPOSAL_POLICY_DRIVEN.md](PROJECT_PROPOSAL_POLICY_DRIVEN.md) — ข้อเสนอโครงการเชิงนโยบาย Workflow ทางเข้า–ออก, Stakeholders, และ QC (ร่างเพื่อพิจารณา)
- [POC_QR_SCANNER.md](POC_QR_SCANNER.md) — Android/iOS camera POC evidence, remaining QR decoding gates
- [EXECUTIVE_BRIEF.md](EXECUTIVE_BRIEF.md) — policy outcomes, executive narrative and pilot KPIs
- [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) — problem, users, functional rules, screens, scope
- [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md) — data model, security, API, integration
- [TEST_AND_DELIVERY.md](TEST_AND_DELIVERY.md) — tests, readiness and delivery gates
- [WORKFLOW_AND_MEDIA_PIPELINE.md](WORKFLOW_AND_MEDIA_PIPELINE.md) — 5-angle vehicle images, registration/scan workflows, secure upload pipeline

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
