# Document Consistency & QC — P6 Vehicle Contact and Framework

**Audit date:** 2026-11-17 (Asia/Bangkok)  
**Repository:** `idev006/MT-Agency-Super-App-Framework` (`main`)  
**Status:** **DOCUMENT CROSS-REFERENCE QC COMPLETED; POLICY/LEGAL/DEVICE ACCEPTANCE OPEN**  
**Scope:** Reviewed canonical `blueprint/`, `apps/vehicle-contact/docs/`, `apps/vehicle-contact/README.md`, portal and SSOT enforcement. This is a documentation audit, not operational sign-off.

## 1. Precedence and single source of truth
1. Universal Web App stack, multi-layer architecture and API adapters: `blueprint/MASTER_WEB_APP_BLUEPRINT.md` and linked standards.
2. Platform identity and authorization model: `blueprint/platform/` (older **PROPOSED** drafts; their React choice does **not** override the approved Vue 3 web baseline).
3. Vehicle Contact's policy proposals, PRD, design, PDPA and field tests: `apps/vehicle-contact/docs/`.
4. Standalone QR camera POC HTML source: `apps/vehicle-contact/poc/qr-scanner/index.html` only.
5. App directory: `portal/apps.json`; generated `_site/` is disposable.
6. Compatibility Markdown pointers in `docs/` and at `apps/vehicle-contact/*.md` are NOT canonical documents and should remain until a reference migration audit is completed.

## 2. Findings and remediation
| ID | Severity | Finding | Action / evidence | Status |
|---|---|---|---|---|
| DOC-01 | High | Previous React frontend drafts contradict approved Vue 3 universal frontend standard | Added explicit precedence banner to `blueprint/platform/MASTER_BLUEPRINT.md` and status note to Vehicle Contact `TECHNICAL_DESIGN.md`; retained historical content | CLOSED for documentation precedence; backend decisions remain proposed |
| DOC-02 | High | Phase-1 visitor pass/card activities appear in early proposals but newer 2026-11-03 addenda defer activation | Preserved original proposals; clarified current documented phase and approval gate in `REQUIREMENTS_TRACEABILITY.md` | OPEN pending command approval of operating policy |
| DOC-03 | High | Minimum 1 vehicle photo discussed vs 0–5 optional in current PRD and media workflow | `REQUIREMENTS_TRACEABILITY.md` VC-T05 and `DECISION_LOG.md` VC-ADR-002 | BLOCKED: policy authority required |
| DOC-04 | High | Data retention for visitor/contact/QR/audit requires legal basis, DPO and data controller; 120-day planning upper bound is not an approved schedule | `DECISION_LOG.md` VC-ADR-007; original PDPA drafts retained, not automatically approved | BLOCKED: legal/DPO/controller sign-off |
| DOC-05 | Medium | Older references link to moved or nonexistent paths | Corrected broken internal Markdown references in `EXECUTIVE_BRIEF.md`, `TECHNICAL_DESIGN.md`, `PROJECT_PROPOSAL_POLICY_DRIVEN.md`, and `blueprint/platform/MASTER_BLUEPRINT.md` | REMEDIATED; CI confirmation required |
| DOC-06 | Medium | QR camera POC described as Vue in a draft although current v7 source is standalone HTML/JS | Updated `POC_QR_SCANNER.md`, without altering scanner code | CLOSED for documentation description |
| DOC-07 | Medium | CI/deployment status previously marked BLOCKED despite later successful re-run | `portal/DEPLOYMENT_STATUS.md` updated with verified run `43988536740` attempt 2 success (2026-11-17) | CLOSED for prior CI run; new-commit regression pending |
| DOC-08 | Medium | Broken local Markdown links did not fail build | `scripts/validate-ssot.mjs` now treats broken local links as build failures | CODE COMMITTED; verify latest Actions green |
| DOC-09 | High | QR decoding, camera-switch lifecycle and secure lookup across actual Android/iOS devices not independently tested | `POC_QR_SCANNER.md`, `TEST_AND_DELIVERY.md` | OPEN: physical devices + end-to-end tests |
| DOC-10 | Medium | Vehicle QR sticker colors/sizes, access roles, required visitor handling and parking permissions depend on proposed policy | Original proposal drafts retained; `DECISION_LOG.md` and traceability entries identify approval gaps | OPEN pending owner decision |
| DOC-11 | Medium | Compatibility pointer files may look like duplicate full documents to reviewers | Pointer files intentionally kept, canonical location established | ACCEPTED TEMPORARY DEBT; remove only after inbound-link review |

## 3. Required policy decisions — do not silently resolve
1. Minimum number of vehicle photos required for activation (the technical draft says 0; earlier requirement discussed at least 1).
2. Exact Phase-1 gate treatment for visitors without QR, vs future pass exchange/visitor lifecycle module; ensure operations, posters, UI flags and data collection agree.
3. Parking entitlement vs responsibility/contact lookup: distinguish physical rules from features that the system implements.
4. Roles that may read names/phones, who certifies the primary contact, QR issuance/delegation and access logs.
5. Final ROPA/lawful basis/notices, per-category retention and erasure (especially visitor data), controller/DPO approvals.
6. Device/browser test matrix and QR decoding acceptance.

## 4. Quality gates
- **QC-DOC-01 — structure/SSOT:** canonical source and no QR source duplicate → checked; CI script in place.
- **QC-DOC-02 — links:** static references updated; new link check enforced in CI; latest-run result required.
- **QC-DOC-03 — precedence:** Vue standard clarified; React proposals retained as historical drafts.
- **QC-DOC-04 — policy:** **NOT PASS**; open approval decisions above.
- **QC-DOC-05 — legal:** **NOT PASS**; DPO/controller approval and specific lawful-basis assessment pending.
- **QC-DOC-06 — physical devices and secure integration:** **NOT PASS**; actual Android/iOS decoder/permission/switch and RLS tests still pending.
- **QC-DOC-07 — production release:** **NOT PASS**; green CI does not certify real-device performance, privacy, or access-control behavior.

## 5. Review handoff
- Policy review: `REQUIREMENTS_TRACEABILITY.md` + `DECISION_LOG.md`.
- Technical review: `../../../blueprint/MASTER_WEB_APP_BLUEPRINT.md` + `TECHNICAL_DESIGN.md`.
- Device test: `POC_QR_SCANNER.md`.
- Privacy review: `PDPA_GOVERNANCE_PACK.md`, `PDPA_ROPA_REGISTER.md`, `PDPA_DATA_RETENTION_AND_RELEASE_GATE.md`.
- CI history: `../../../portal/DEPLOYMENT_STATUS.md`.

**No destructive directory cleanup or policy change was made in this QC pass.**
