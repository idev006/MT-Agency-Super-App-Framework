# P6 Vehicle Contact — Requirements traceability and reconciliation

**Date:** 2026-11-17  
**Status:** REVIEW REQUIRED — audit of existing material; NOT a new product specification  
**Authority:** Existing approved instructions and app-specific decision records; do not silently choose between conflicting drafts.

| ID | Requirement / control | Existing authority / source | Related design or evidence | Current audit result | Next action |
| --- | --- | --- | --- | --- | --- |
| VC-T01 | Find a reachable registered responsible contact for each vehicle | `SYSTEM_ANALYSIS_V2.md`, `PRODUCT_REQUIREMENTS.md` | `TECHNICAL_DESIGN.md`; no integrated production backend | DOCUMENTED / NOT IMPLEMENTED | Verify roles and contact source |
| VC-T02 | QR contains non-PII opaque identifier, contact lookup is authorized | `PRODUCT_REQUIREMENTS.md`, `TECHNICAL_DESIGN.md` | `POC_QR_SCANNER.md` only covers camera | DOCUMENTED / NOT END-TO-END TESTED | Backend and permission negative tests |
| VC-T03 | Android/iOS QR scanning and camera selection | `PRODUCT_REQUIREMENTS.md`, `POC_QR_SCANNER.md` | `../poc/qr-scanner/index.html` v7 | CAMERA ACCESS USER-REPORTED; DECODE AND SWITCH UNVERIFIED | Real device evidence matrix |
| VC-T04 | QR absent: manual plate/contact lookup | `SYSTEM_ANALYSIS_V2.md`, `PRODUCT_REQUIREMENTS.md` | `TEST_AND_DELIVERY.md` | PLANNED / NOT IMPLEMENTED | Secure app integration |
| VC-T05 | Photo minimum vs optional photos | Prior planning discussed minimum 1; `PRODUCT_REQUIREMENTS.md` and app README currently say 0–5 optional | `WORKFLOW_AND_MEDIA_PIPELINE.md` | **POLICY CONFLICT — OPEN** | Project sponsor to confirm minimum; no change to live rule without approval |
| VC-T06 | Regular QR compliance; visitor/pass exchange | `SYSTEM_ANALYSIS_V2.md` states phase-1 pass-exchange OFF; later phases require separate approval | `WORKFLOW_SOP_POLICY_REVIEW.md` | **PHASE GATE — OPEN** | Confirm currently approved phase and SOP before activation |
| VC-T07 | Parking access/zone entitlements | `PRODUCT_REQUIREMENTS.md` excludes v1; operating policy may require sticker/guard checks | `SYSTEM_ANALYSIS_V2.md` | **SCOPE RECONCILIATION — OPEN** | Separate physical policy from digital access-control functionality |
| VC-T08 | Contact personal data, role permissions, audit, retention | PDPA set within `docs/`; master security standards in `../../../blueprint/` | `PDPA_REVIEW_CHECKLIST.md`, `TEST_AND_DELIVERY.md` | DRAFT / LEGAL AND DPO REVIEW OPEN | Obtain documented lawful basis, access and retention decisions |
| VC-T09 | Reproducible scanner publishing from one source | `../poc/qr-scanner/index.html`, `../../../blueprint/decisions/ADR-002-SSOT-BOUNDARIES.md` | `../../../.github/workflows/deploy-pages-ssot.yml` | SOURCE VERIFIED / DEPLOY FAILED IN PRIOR RUN | Verify Pages settings and Actions run |

## Decision control
- **Approved**: explicit approval and evidence link, approver, date and scoped change.
- **Proposed**: engineering/design draft; not equivalent to command authorization.
- **Blocked**: unresolved authority, incompatible requirements or missing evidence.
- Any change to VC-T05–VC-T08 must be recorded here and in an app-specific ADR/decision log before specification edits or feature activation.

## Evidence template
For each test record: test ID, UTC+7 date/time, build SHA, OS/device/browser version, HTTPS URL, camera selected/requested/actual, permission status, QR decode result (sanitized), cleanup outcome, expected vs actual, operator, pass/fail and attachment location. No phone number, plate or person data in public test captures.
