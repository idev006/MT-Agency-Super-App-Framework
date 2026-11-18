# P6 Vehicle Contact — Decision and approval log

**Purpose:** Project-only decisions, distinct from platform-wide decisions in `blueprint/decisions/`.

| ID | Date | Subject | Status | Evidence / implication |
| --- | --- | --- | --- | --- |
| VC-ADR-013 | 2026-11-18 | UI/UX principles and design-system compliance are mandatory before role-by-role frontend delivery | **APPROVED — FRONTEND DELIVERY BASELINE** | Project Owner direction; [UI/UX Principles](FRONTEND_UI_UX_PRINCIPLES.md), [Design System Blueprint](FRONTEND_DESIGN_SYSTEM_BLUEPRINT.md), [UI Compliance Checklist](FRONTEND_UI_COMPLIANCE_CHECKLIST.md), and [Role Delivery Blueprint](FRONTEND_ROLE_DELIVERY_BLUEPRINT.md). This approval governs frontend design and merge evidence; it does not approve production PII processing or bypass backend permissions. |
| VC-ADR-012 | 2026-11-18 | Eight-role engineering operating team for P6 Vehicle Contact | **APPROVED — ROLE MODEL ONLY** | Project Owner approved Product Owner/BA, Lead Architect, Backend, Security/IAM, Database, QA, Frontend, and DevOps responsibilities; [Engineering Team Charter](ENGINEERING_TEAM_CHARTER.md). AI-assisted roles are not staffed independent employees or permission grants; real human security, PDPA and production sign-offs remain required. |
| VC-ADR-011 | 2026-11-17 | Phase-1 vehicle media location is project-root child Google Drive `uploads/` folder, with `vehicles/`, `staging/`, `quarantine/` base folders | **STORAGE LOCATION SELECTED / BASE FOLDERS CREATED; MEDIA RELEASE BLOCKED** | Owner-provided folder link, verified Drive parent ID and physical folder creation; [Media Storage Design](VEHICLE_MEDIA_STORAGE_DESIGN.md); access/retention/photo minimum still OPEN |
| VC-ADR-009 | 2026-11-17 | Phase 1 primary datastore is Google Sheets; one tab per logical table, accessed only through GAS repository adapter | **ARCHITECTURE DIRECTION APPROVED; NOT IMPLEMENTED** | Owner direction; [Phase 1 data architecture](PHASE1_GOOGLE_SHEETS_DATA_ARCHITECTURE.md). Supabase primary datastore descriptions in historical draft superseded for Phase 1; column schema remains proposed |
| VC-ADR-010 | 2026-11-17 | MT-I-AM deferred; Phase 1 uses Username/Password sign-in, subject to secure server-side verification and non-bypassable GAS API | **ARCHITECTURE DIRECTION APPROVED; SECURITY IMPLEMENTATION OPEN** | [Phase 1 data architecture](PHASE1_GOOGLE_SHEETS_DATA_ARCHITECTURE.md). No plaintext passwords in Sheets; identity/session provider still to be selected |
| VC-ADR-001 | 2026-11-16 | Keep this application's docs in `apps/vehicle-contact/docs/`, POC code in `poc/qr-scanner/` | **STRUCTURE ACCEPTED** | Project-owner instruction, Git history; no production approval |
| VC-ADR-002 | 2026-11-17 | Required vehicle photo minimum (1) vs optional 0–5 | **OPEN — requires business sponsor decision** | `REQUIREMENTS_TRACEABILITY.md` VC-T05 |
| VC-ADR-003 | 2026-11-17 | Visitor card/pass exchange and entry/exit activation by phase | **OPEN — policy sign-off required** | `SYSTEM_ANALYSIS_V2.md` phase-1 clarification; VC-T06 |
| VC-ADR-004 | 2026-11-17 | Parking rights vs contact-only lookup scope | **OPEN — scope clarification required** | VC-T07 |
| VC-ADR-006 | 2026-11-17 | Old React draft vs approved Vue 3 master app frontend | **RESOLVED FOR DOCUMENT PRECEDENCE ONLY** | `../../../blueprint/MASTER_WEB_APP_BLUEPRINT.md`; old text remains archival, no source migration implied |
| VC-ADR-007 | 2026-11-17 | Visitor retention schedule and up-to-120-day planning boundary | **OPEN — DPO/controller decision** | `PDPA_ROPA_REGISTER.md`, `PDPA_DATA_RETENTION_AND_RELEASE_GATE.md`; no final retention rule |
| VC-ADR-008 | 2026-11-17 | CI generated Pages deployed from canonical source | **CI VERIFIED ONLY** | GitHub Actions run `43988536740`, attempt 2 success; functional test remains open |
| VC-ADR-005 | 2026-11-17 | Exact scanner POC acceptance for iOS/Android | **OPEN — physical testing required** | `POC_QR_SCANNER.md` and VC-T03 |

No unresolved item should be marked approved by an automated commit. Record approver, decision date, rationale, impact on documents/code/tests, and link to evidence upon actual approval.
