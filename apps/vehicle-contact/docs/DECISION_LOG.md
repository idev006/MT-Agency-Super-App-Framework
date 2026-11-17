# P6 Vehicle Contact — Decision and approval log

**Purpose:** Project-only decisions, distinct from platform-wide decisions in `blueprint/decisions/`.

| ID | Date | Subject | Status | Evidence / implication |
| --- | --- | --- | --- | --- |
| VC-ADR-001 | 2026-11-16 | Keep this application's docs in `apps/vehicle-contact/docs/`, POC code in `poc/qr-scanner/` | **STRUCTURE ACCEPTED** | Project-owner instruction, Git history; no production approval |
| VC-ADR-002 | 2026-11-17 | Required vehicle photo minimum (1) vs optional 0–5 | **OPEN — requires business sponsor decision** | `REQUIREMENTS_TRACEABILITY.md` VC-T05 |
| VC-ADR-003 | 2026-11-17 | Visitor card/pass exchange and entry/exit activation by phase | **OPEN — policy sign-off required** | `SYSTEM_ANALYSIS_V2.md` phase-1 clarification; VC-T06 |
| VC-ADR-004 | 2026-11-17 | Parking rights vs contact-only lookup scope | **OPEN — scope clarification required** | VC-T07 |
| VC-ADR-006 | 2026-11-17 | Old React draft vs approved Vue 3 master app frontend | **RESOLVED FOR DOCUMENT PRECEDENCE ONLY** | `../../../blueprint/MASTER_WEB_APP_BLUEPRINT.md`; old text remains archival, no source migration implied |
| VC-ADR-007 | 2026-11-17 | Visitor retention schedule and up-to-120-day planning boundary | **OPEN — DPO/controller decision** | `PDPA_ROPA_REGISTER.md`, `PDPA_DATA_RETENTION_AND_RELEASE_GATE.md`; no final retention rule |
| VC-ADR-008 | 2026-11-17 | CI generated Pages deployed from canonical source | **CI VERIFIED ONLY** | GitHub Actions run `43988536740`, attempt 2 success; functional test remains open |
| VC-ADR-005 | 2026-11-17 | Exact scanner POC acceptance for iOS/Android | **OPEN — physical testing required** | `POC_QR_SCANNER.md` and VC-T03 |

No unresolved item should be marked approved by an automated commit. Record approver, decision date, rationale, impact on documents/code/tests, and link to evidence upon actual approval.
