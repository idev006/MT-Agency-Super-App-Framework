# P6 Vehicle Contact — Phase 1 Development Roadmap & Work Breakdown

**Document ID:** P6VC-PLAN-001  
**Version:** 1.0.0 | **Baseline date:** 2026-11-17  
**Plan status:** ACTIVE PLANNING / NOT A COMMITTED RELEASE DATE  
**Agile work tracking:** [Issue-backed Kanban with live lane filters](AGILE_KANBAN.md) — 28 GitHub Issues VC-W01–VC-W28 created 2026-11-17; label/status links are live; milestone table below remains a baseline snapshot  
**Scope:** Phase 1 only; visitor/pass exchange **OFF**  
**SA baseline:** [P6VC-SA-001](SYSTEM_ANALYST_BASELINE_PHASE1.md)  
**Technical foundations:** [Phase-1 Sheets Architecture](PHASE1_GOOGLE_SHEETS_DATA_ARCHITECTURE.md), [GAS Data Model](GAS_DATA_MODEL.md), [GAS API Contract](GAS_API_SPEC.md), [GAS Test Evidence](GAS_TEST_EVIDENCE.md) and [Decision Log](DECISION_LOG.md)

## 1. Delivery strategy

Deliver **security first**, then a vertical slice using **synthetic data**: authorized login → scan/search → vehicle details → safe contact action. In parallel, finalize schema, contact stewardship, SOP and PDPA. Each work item needs owner, evidence, dependencies, acceptance test and commit/CI link. **No real contact data and no production GAS exposure** before security/privacy/release gates.

**Architecture frozen for Phase 1:** Vue 3 frontend using central Web App Blueprint; app-owned GAS API Groups and ES module source build; one private Google Spreadsheet where each tab is a logical table; Username/Password now; MT-I-AM deferred and isolated behind a replaceable auth port. Do not force generic shared code between apps.

## 2. Evidence-based starting position (do not inflate progress)

| Capability | Observed status as of baseline | Evidence / qualification |
|---|---|---|
| Project docs / SA | Existing PRD, SA v2, traceability; new SA baseline | Documents are drafts with approvals open |
| Google Sheets phase-1 datastore | **CREATED STRUCTURE** (6 tabs and header rows) | Source decision and previous connector verification; business schema still provisional |
| GAS source and code pattern | **CODE PRESENT** | `apps/vehicle-contact/backend/gas/`, ES Modules + namespace bundle |
| GAS build/contract CI | **PASS, limited** | [GitHub Actions run 44022203757](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44022203757); not a live GAS deployment/security test |
| Scanner POC | **POC EXISTS** | Android/iOS camera access user-reported; actual decode/switch matrix not fully evidenced |
| AuthN/AuthZ/secure GAS ingress | **BLOCKED / NOT IMPLEMENTED** | Identity/session provider and direct-URL bypass defense outstanding |
| Vehicle/contact/QR CRUD, real UI, live GAS | **NOT IMPLEMENTED / NOT VERIFIED** | Only `system.health` safe bootstrap is routed |
| PDPA approvals and field/UAT | **OPEN** | Operational/legal decisions pending |

## 2C. GitHub Actions → GAS manual source deploy (2026-11-17)
- New [manual gated deployment workflow](../../../.github/workflows/deploy-vehicle-gas.yml) targeting the owner-provided Apps Script ID; source build/tests required, manual `PUSH_VEHICLE_GAS` confirmation on main, `clasp push --force` and immutable source version creation.
- [Deployment setup / safe overwrite runbook](GAS_GITHUB_ACTIONS_DEPLOYMENT.md).
- **Tracking:** [VC-W29](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/29), separate from auth issue VC-W04. **Status: WORKFLOW SOURCE CONFIGURED; NOT AUTHENTICATED/NOT DEPLOYED.** OAuth secret `P6VC_CLASPRC_JSON`, verifying target script contents/backups and first authorized run are pending. No Web App `/exec` publication or production security approval.

## 2A. Controlled Schema Sync — M2 scope (2026-11-17)

**SSOT authority:** [Canonical database schema](../schema/database.schema.json) is the only authoritative dictionary. [Human-readable Data Dictionary](GAS_DATA_DICTIONARY.md) and [implementation record](SCHEMA_SYNC_IMPLEMENTATION.md) are documentation projections.

**New work items / separate feature gate:**

| ID | Milestone | Task | Initial status | Exit evidence |
|---|---|---|---|---|
| VC-W23 | M2 | Canonical JSON dictionary for six Sheets; schema reference in GAS runtime bundle | CODE ADDED / CI REVIEW | JSON matches live headers; fake-Sheets and bundle tests green |
| VC-W24 | M2 | Detect added/missing/renamed/reordered/duplicate columns and extra/missing tabs | CODE ADDED / CI REVIEW | Read-only drift report with negative tests |
| VC-W25 | M2 | Propose change without type guesses, GitHub writes or automatic migration | CODE ADDED / CI REVIEW | Review-required proposal, no writes |
| VC-W26 | M2 | Approved GitHub PR proposal automation and notification | TODO | Least-privilege token, protected PR policy and audit verified |
| VC-W27 | M2 | Controlled additive migration/rollback and migration journal | BLOCKED — owner approval/security | Backup, approval, staged migration and recovery verified |
| VC-W28 | M2 | Optional authorized onChange trigger + scheduled reconciliation | TODO | Real GAS trigger ownership, quota, notifications and drift reconciliation tested |

**Non-negotiable:** user edits in Google Sheets are candidate proposals, NOT SSOT updates. Protected business API operations remain off until security gates pass. No background sync or trigger is claimed to exist by this documentation.

## 2B. Drive media root verified and base folders created (2026-11-17)
- Selected and inspected the owner's [uploads folder](https://drive.google.com/drive/folders/1H_gIVF04LfLlgDRvOApcrY835Rd4LGEW) under the existing project root.
- Created base folders `vehicles/`, `staging/`, `quarantine/`; no vehicle folders or files yet. Details in [Media Storage Design](VEHICLE_MEDIA_STORAGE_DESIGN.md).
- VC-W10 photo-storage subtask **FOLDER STRUCTURE DONE / ACCESS & MEDIA PIPELINE BLOCKED**. Next: audit effective Drive permissions and design backend-only uploads, per-vehicle versioning, thumbnail processing, privacy/retention and fake-Drive integration tests.
- The business decision 5 photo slots versus mandatory five photos remains OPEN. Creation of folders is not approval for real images or production PII.

## 3. Milestone sequence (relative, not scheduled dates)

| Milestone | Outcome / exit condition | Depends on |
|---|---|---|
| M0 — Baseline & ownership | SA/PRD scope, responsible owners, outstanding approvals registered | None |
| M1 — Security proof | Chosen phase-1 credential/session provider; non-bypassable GAS integration demonstrated; negative tests | M0 |
| M2 — Data integrity | Signed data dictionary; safe staged Sheet adapter and tests | M0; may run in parallel with M1 using fake/synthetic data |
| M3 — Core Backend | API group actions and domain use cases, secure CRUD/QR/revocation/audits | M1 + M2 |
| M4 — Frontend vertical slice | Vue app, authenticated flows, scan/search/contact; synthetic E2E | M1 + M3 |
| M5 — Pilot readiness | Physical device tests, performance/recovery, privacy/owner approvals, runbook | M4 plus DPO/operational decisions |
| M6 — Controlled pilot/release | Approval with dated evidence and rollback | M5 |

**Critical path:** D-01 (safe phase-1 login/session and GAS endpoint boundary) → M1 → protected API enablement. If blocked, continue isolated synthetic UI and repository tests but never release PII APIs.

## 4. Trackable work backlog

Status vocabulary: `DONE-EVIDENCED`, `IN-PROGRESS`, `TODO`, `BLOCKED`, `REVIEW`. A task enters DONE-EVIDENCED only with the exact artifact + test evidence; do not infer completion from a task written in this document.

| ID | Milestone | Work item / deliverable | Dependency | Initial status | Exit criterion / evidence |
|---|---|---|---|---|---|
| VC-W01 | M0 | Publish SA Phase-1 baseline and roadmap links | none | DONE-EVIDENCED | These files committed; traceable GitHub links |
| VC-W02 | M0 | Assign business owner, data steward, app maintainer, security/DPO reviewer | sponsor | BLOCKED | Owner/approver names recorded |
| VC-W03 | M0 | Resolve photo minimum; define contact read roles and record scope; confirm current no-pass SOP | sponsor | BLOCKED | Signed ADR/Decision Log and updated acceptance |
| VC-W04 | M1 | Decide Username/Password identity store/provider; hashing, enrollment, reset, MFA decision, session expiry/revocation | VC-W02 | BLOCKED | Security ADR; threat model; auth test matrix |
| VC-W05 | M1 | Design/test trusted frontend→GAS integration, no owner-privileged bypass, CORS/OAuth behavior | VC-W04 | BLOCKED | Direct GAS URL negative test; no protected operation callable outside boundary |
| VC-W06 | M1 | Specify per-group/action/resource RBAC and safe audit/error policies | VC-W03, VC-W04 | BLOCKED | Permission matrix and unauthorized tests |
| VC-W07 | M2 | Approve six-tab data dictionary: types, required, ID, FK, unique/version and lifecycle | VC-W02, VC-W03 | REVIEW | Data Dictionary, schema version, approved migrations |
| VC-W08 | M2 | Build Sheets repository contract tests with fake Apps Script APIs | VC-W07 | TODO | Unit tests for duplicate, miss, conflict and normalization |
| VC-W09 | M2 | Implement Sheets adapters with bounded read/batch write, formula safety, lock/version, reconciliation | VC-W07 | TODO | Integration tests using synthetic staging spreadsheet |
| VC-W10 | M2 | Determine photo private store, metadata slots, upload/privacy validation | VC-W03 | BLOCKED | Media ADR and private upload/download tests |
| VC-W11 | M3 | Vehicles API group: register/update/lookup/search and DTO/use cases | VC-W05, VC-W06, VC-W09 | BLOCKED | Contract + permission + data-integrity tests |
| VC-W12 | M3 | Contacts API group: verify/edit/display with contact.read guard | VC-W05, VC-W06, VC-W09 | BLOCKED | No unauthorized phone disclosures |
| VC-W13 | M3 | QR API group: issue/resolve/revoke and human-readable print/deep-link | VC-W05, VC-W06, VC-W09 | BLOCKED | High entropy, digest storage, revoke/rotate tests |
| VC-W14 | M3 | Audit and support controls, safe diagnostics and backup/restore | VC-W06, VC-W09 | BLOCKED | Negative log leak + restore evidence |
| VC-W15 | M4 | Vue app shell, routes and protected UI layout | M0; mock-only until M1 | TODO | Build and mobile responsive smoke |
| VC-W16 | M4 | Login screen/client auth adapter and session lifecycle | VC-W04, VC-W05 | BLOCKED | Sign-in/out/expiry/denied route integration |
| VC-W17 | M4 | Scanner, manual plate search, vehicle detail/contact and edit/QR operator screens | VC-W11–VC-W13, VC-W15, VC-W16 | BLOCKED | Android/iOS E2E with permitted contact |
| VC-W18 | M4 | Consolidate existing QR-camera POC into Vue UI; clean tracks, front/rear and fallback | VC-W15 | TODO | Physical Android/iOS/LINE evidence matrix |
| VC-W19 | M5 | Security/privacy evaluation: unauthorized/direct URL, credentials, account abuse, audit, PDPA legal/retention | VC-W02–VC-W18 | BLOCKED | Approved security/privacy gate and negative test report |
| VC-W20 | M5 | Functional UAT + field SOP, data correctness, QR print, latency/quota/load, disaster fallback | VC-W17–VC-W19 | BLOCKED | Signed acceptance and measured metrics |
| VC-W21 | M6 | Controlled deployment/runbook, CI/versions, rollback, operator onboarding | VC-W19, VC-W20 | BLOCKED | Owner approval, deployment IDs, runbook and rollback test |
| VC-W22 | Future | Visitor/pass/entry-exit module design only | policy future approval | ON-HOLD | APIs and data collection remain OFF for Phase 1 |

**Initial status is a planning snapshot, not automation-synchronized Kanban.** GitHub Issues/Project Board may be created from these IDs in a separate tracked operation; do not imply existing tickets or owners are already assigned.

## 5. Release and quality gates

- **G0 Requirements:** scope, user/role ownership, decisions D-01–D-07 and traceability reviewed; unresolved requirements identified without silent implementation.
- **G1 Security architecture:** independent review of Username/Password identity/session boundary; no plaintext secrets; protected API direct-URL bypass and abuse cases FAIL CLOSED.
- **G2 Data correctness:** signed schema, stable IDs, conflict/duplicate tests, safe logging and restore tests; synthetic data only.
- **G3 Code quality:** import-boundary checks, unit/contract tests, GAS bundle and clasp packaging; API permission tests; CI green for target commit.
- **G4 Staging integration:** real GAS runtime only under controlled access, Vue→auth→API→Sheet with sanitized test data, Android/iOS cases and production-like limits.
- **G5 Privacy/operations:** lawful basis, ROPA/notices, retention/deletion, roles, SOP, incident response and authorized field UAT.
- **G6 Pilot approval:** named owner signs dated acceptance, deployment/rollback and monitoring; no automatic promotion based on build success.

**Go/no-go rule:** any missing G1 security or G5 privacy gate is a **NO-GO for personal contact data**. Public QR must never reveal phone/name without authorization.

## 6. Immediate next executable sprint — bounded engineering tasks

Recommended first engineering batch, which does **not** require real PII or a production GAS endpoint:

1. **VC-W07 draft:** produce a formal Data Dictionary covering the six candidate worksheets; map existing headers, types and validation; mark disputed fields clearly.
2. **VC-W08:** create fake Sheets adapter tests for mapping, missing records, duplicate active plate/province, conflict/version and unsupported schema.
3. **VC-W15:** scaffold Vue application shell with mocked API and no secrets; implement safe login/loading/error screen states only.
4. **VC-W04/W05 research:** write ADR candidate alternatives for secure phase-1 login and non-bypassable GAS integration, including an explicit technical proof-of-concept before selection.
5. **VC-W18:** physically verify QR-camera decode and camera switching, keep screenshot/device evidence sanitized.

Run these in parallel where dependencies permit. **Do not** implement public login against a plaintext-password Sheet, deploy privileged public GAS, or turn on phone lookup to “get the demo working”.

## 7. Tracking, ownership and reporting protocol

- **SSOT:** code, specs and release evidence in GitHub under this app; spreadsheet data in the owner's private [Drive project root](https://drive.google.com/drive/folders/1bqnA4Ih_mki0xmHwp8A7r14UYuw8m22G). GAS runtime is deployment artifact, **not** canonical source.
- **Work item fields:** ID, title, role owner, priority, milestone, dependency, GitHub issue/PR, commit SHA, environment, status, test evidence URL, blockers, last verified (UTC+7), approval link.
- **Definition of Ready:** owner, inputs/requirements, security/privacy class, API+data contract, testable acceptance and outstanding decisions known.
- **Definition of Done:** code/docs reviewed; static + unit + integration evidence appropriate to scope; security negative tests; API compatibility; rollback plan where needed; exact commit, environment and status recorded. For business decisions: named human approver and approval date.
- **Progress reporting:** distinct DONE-EVIDENCED vs IN-PROGRESS vs BLOCKED vs NOT STARTED; never count docs/CI as live backend/Pilot. Prioritize critical path and raise conflicting source requirements instead of choosing one silently.

## 8. Risks and mitigations

| Risk | Impact | Control |
|---|---|---|
| GAS URL bypasses API gateway | Critical PII exposure | Proof of non-bypassable ingress or redesign topology |
| Username/Password DIY insecure | Credential/session compromise | Vetted auth provider, hardened hashing, rate limit, server-side revocation |
| Sheet race/partial writes | Wrong vehicle-contact and audit | Lock/version, bounded transactions, recovery/reconciliation |
| Wrong/obsolete phone | Failure to contact responsible party | Named steward, verification and correction SOP |
| QR cloned/revoked | Wrong vehicle association | Opaque token, digest/revocation and human comparison |
| Photos/PII overshared | Privacy breach | Private media, minimal DTO, permission-specific access and retention |
| GAS quotas/cross-origin behavior | Unreliable app in field | Target-device integration, quota/load and fallback |
| Business rule conflicts | Rework/unapproved processing | Decision Log approval and clear phase flags |

## 9. Traceability references

- [SA baseline](SYSTEM_ANALYST_BASELINE_PHASE1.md)
- [Requirements Traceability](REQUIREMENTS_TRACEABILITY.md)
- [Decision Log](DECISION_LOG.md)
- [Product Requirements](PRODUCT_REQUIREMENTS.md)
- [System Analysis v2 / Phase 1 addendum](SYSTEM_ANALYSIS_V2.md)
- [Workflow SOP Phase 1 correction](WORKFLOW_SOP_POLICY_REVIEW.md)
- [GAS Test Evidence](GAS_TEST_EVIDENCE.md)

**Interpretation:** This is a specific, evidence-gated development plan; implementing the tasks does not authorize deploying personal contact information or activating future visitor-pass features.
