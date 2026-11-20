# P6 Vehicle Contact — Phase 1 Development Roadmap & Work Breakdown

> For current runtime versions, active work, blockers and exact continuation steps, start with [Current Delivery Status / Resume Here](CURRENT_DELIVERY_STATUS.md). This roadmap retains the longer milestone and governance context.

**Document ID:** P6VC-PLAN-001  
**Version:** 1.2.0 | **Baseline date:** 2026-11-17 | **Last reconciled:** 2026-11-20
**Plan status:** ACTIVE PLANNING / NOT A COMMITTED RELEASE DATE  
**Agile work tracking:** [Issue-backed Kanban with live lane filters](AGILE_KANBAN.md) — 31 GitHub Issues VC-W01–VC-W31 plus two P6VC engineering gates tracked as of 2026-11-20; live labels supersede historical milestone snapshots
**Scope:** Phase 1 only; visitor/pass exchange **OFF**  
**SA baseline:** [P6VC-SA-001](SYSTEM_ANALYST_BASELINE_PHASE1.md)  
**Technical foundations:** [Phase-1 Sheets Architecture](PHASE1_GOOGLE_SHEETS_DATA_ARCHITECTURE.md), [GAS Data Model](GAS_DATA_MODEL.md), [GAS API Contract](GAS_API_SPEC.md), [GAS Test Evidence](GAS_TEST_EVIDENCE.md) and [Decision Log](DECISION_LOG.md)
**Primary delivery axis:** [Registration-to-verification workflow](PRIMARY_WORKFLOW_DELIVERY_PLAN.md)

## 1. Delivery strategy

Deliver **security first**, then complete the primary workflow using **synthetic data**: campaign → intake with five photos → review → vehicle/contact/QR creation → QR scan or plate search → permitted details/history. Actor and administration use cases are supporting capabilities under this journey, not competing delivery tracks. In parallel, finalize schema, contact stewardship, SOP and PDPA. Each work item needs owner, evidence, dependencies, acceptance test and commit/CI link. **No real contact data and no production GAS exposure** before security/privacy/release gates.

**Architecture frozen for Phase 1:** Vue 3 frontend using central Web App Blueprint; app-owned GAS API Groups and ES module source build; one private Google Spreadsheet where each tab is a logical table; Username/Password now; MT-I-AM deferred and isolated behind a replaceable auth port. Do not force generic shared code between apps.

## 2. Evidence-based current position (do not inflate progress)

| Capability | Reconciled status 2026-11-20 | Evidence / qualification |
|---|---|---|
| Project docs / SA | Existing PRD, SA v2, traceability; new SA baseline | Documents are drafts with approvals open |
| Google Sheets phase-1 datastore | **CREATED STRUCTURE** (6 tabs and header rows) | Source decision and previous connector verification; business schema still provisional |
| GAS source and code pattern | **CODE PRESENT** | `apps/vehicle-contact/backend/gas/`, ES Modules + namespace bundle |
| GAS build/contract CI | **PASS** | PR #55 checks and manual deployment [run 44573790557](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44573790557) built/tested commit `3cfcf0e` before push |
| Scanner POC | **POC EXISTS** | Android/iOS camera access user-reported; actual decode/switch matrix not fully evidenced |
| AuthN/AuthZ/RBAC | **IMPLEMENTED / RELEASE REVIEW BLOCKED** | Username/password sessions, server permissions, revocation and 5 roles × 44 protected-operation tests exist; named security/policy approval and non-bypassable ingress proof remain open |
| STAFF read-only vehicle search | **PASS — SOURCE/INTEGRATION** | PR #47 and FE-STAFF-01 evidence; live operational UAT remains open |
| Registration intake and review | **PASS — DEVELOPMENT DEPLOYMENT; REFERENCE DATA BLOCKED** | PRs #57–#60 and #65; Backend 0.5.0, compatible Worker and Frontend 0.6.0 are live; approved list data, guarded Sheet migration and controlled mutating browser E2E remain open |
| Primary registration-to-verification journey | **IN-PROGRESS** | Intake/review/search slices exist; QR Worker/browser/device path and full deployed synthetic journey remain open |
| SYSTEM_ADMIN administration | **PASS — SOURCE/INTEGRATION** | PRs #48–#54 cover users, organizations, campaigns, QR, settings, retention, audit, pagination and responsive inputs |
| GAS development deployment | **PASS — DEVELOPMENT** | Source Version 22 from `cf2e777`; owner-reported Web App publication; independent public health on 2026-11-20 returned ready / API v1 / backend 0.5.0 |
| PDPA approvals and field/UAT | **OPEN** | Operational/legal decisions pending |

## 2H. Frontend and development deployment reconciliation (2026-11-20)

- PRs [#44](https://github.com/idev006/MT-Agency-Super-App-Framework/pull/44)–[#60](https://github.com/idev006/MT-Agency-Super-App-Framework/pull/60) are merged; registration intake/review and their deployment evidence are included through `main` commit `4affa12ebde9dfbec998a0bbcd39c038746f23ac`.
- Shared shell, STAFF search and SYSTEM_ADMIN administration have unit/contract/build evidence plus responsive corporate/dark and axe browser evidence under `docs/FRONTEND_*_EVIDENCE_20261119.md`.
- Manual GAS run 44573790557 pushed the tested artifact and created source Version 20. Web App publication was a separate owner action and is recorded as owner-reported, while the public health response was independently rechecked read-only.
- Live acceptance run 44574709121 verified the selected development administrator has exactly `SYSTEM_ADMIN` + `REGISTRATION_ADMIN`. Frontend navigation remains permission-driven and GAS remains authorization authority.
- `VC-W15` and `VC-W16` meet their scoped acceptance and move to DONE-EVIDENCED. `VC-W17` moves to IN-PROGRESS because STAFF search is delivered but scanner/remaining actor workflows are incomplete.
- Production authorization, real-person data, security/PDPA approval, field UAT and controlled release remain BLOCKED. Development deployment evidence does not satisfy those gates.

## 2C. GitHub Actions → GAS manual source deploy (2026-11-17)
- New [manual gated deployment workflow](../../../.github/workflows/deploy-vehicle-gas.yml) targeting the owner-provided Apps Script ID; source build/tests required, manual `PUSH_VEHICLE_GAS` confirmation on main, `clasp push --force` and immutable source version creation.
- [Deployment setup / safe overwrite runbook](GAS_GITHUB_ACTIONS_DEPLOYMENT.md).
- **Tracking:** [VC-W29](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/29), separate from auth issue VC-W04. **Status: FIRST CLASP PUSH + VERSION VERIFIED** — [GitHub Actions run 44033187307](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44033187307) pushed two files to owner-supplied Script ID from commit `75c26b39`; created GAS version 3. **Editor-level Sheet verification and Web App publication NOT VERIFIED**. OAuth secret `P6VC_CLASPRC_JSON`, verifying target script contents/backups and first authorized run are pending. No Web App `/exec` publication or production security approval.

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

## 2D. Multi-file GAS packaging proof — source deploy evidenced (2026-11-17)

- [Multi-file build script](../backend/gas/scripts/build.mjs) generates five namespaced `Package$Module.gs` files + `appsscript.json` instead of one monolithic `Code.gs`; build and CI reject compiled files over 800 lines.
- [Successful run 44034261629](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44034261629) pushed 6 files to the owner-supplied Script ID and created **GAS Version 4** (source commit `2083899e`). CI covers both file load orders, API route deny, and schema drift.
- Temporary narrowly scoped request-trigger was removed immediately afterward: ongoing deployment policy remains **manual-only**, `PUSH_VEHICLE_GAS` confirmation.
- This is an **engineering packaging experiment**, not the final optimized per-domain runtime module architecture: generated files are independent IIFEs with some duplicated code. No claims of live login, Sheets editor verification, Web App deployment or production release.
- Evidence and constraints: [GAS Test Evidence](GAS_TEST_EVIDENCE.md).

## 2E. Source-module mirrored GAS files — Version 5 proof (2026-11-17)

- Owner-requested source-to-GAS module mapping implemented: [GAS_MODULE_MAPPING.md](GAS_MODULE_MAPPING.md), [builder](../backend/gas/scripts/build.mjs).
- [GitHub Actions run 44035053861](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44035053861) **PASS**: 14 `.gs` files + manifest pushed to existing Script ID; **GAS Version 5 created**. Each generated module <=800 lines; tests validate runtime order independence and API fail-closed.
- Manual-only Workflow restored after one-shot test. Actual GAS Editor + Sheet schema verification remains required before closing runtime acceptance.

## 2F. Real /exec API smoke — 7/7 pass (2026-11-17)

- External GitHub Actions [run 44036525176](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44036525176) verified actual HTTP GET and POST `system.health`, bad API version, unknown group, and denied protected vehicle/contact/QR actions.
- [Live API evidence](GAS_LIVE_API_TEST_EVIDENCE.md) records exact expected outcomes; **not** security acceptance for enabled protected business APIs.
- Next gates: editor schema verification against real Sheets, deployment-version inspection, and secure staging integration.

## 2G. Owner-approved five-part API test development (2026-11-17)

- **Approval:** perform Schema Integration, Authentication/Authorization, Vehicle Registration, Media and QR API tests in sequence.
- **Source and detailed acceptance:** [API_TEST_SUITE_PHASE1.md](API_TEST_SUITE_PHASE1.md); [Kanban VC-W31](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/31).
- **Verified CI:** [run 44037490677](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44037490677), **10/10 Node test cases PASS** plus existing contract tests; the build produces **17 .gs modules + manifest** under the 800-line cap.
- **Actual delivered testable policies:** draft registration field checks, five media slot rules, and injected trusted-crypto QR token/digest generation; fake Sheets header read validation and API fail-closed security probes. This is **mock/synthetic unit coverage only**, not live registration, Drive upload, QR persistence, or end-to-end authorization.
- **Outstanding go/no-go:** authorized GAS Editor-to-Sheets schema integration, approved Username/Password provider and non-bypassable GAS ingress, secured CRUD adapter, Drive privacy/access controls, then real staged API E2E with synthetic records.
- **Deployment note:** CI tests do not automatically push new code; existing GAS Version 5 remains the last verified source-push version.

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


## 5. Execution refinement — 2026-11-17 (proposed; no release gate bypass)

**Decision:** Retain the existing **M0–M6** milestones and work IDs. Do not renumber or create a competing project plan. Labels `area:m0`…`area:m6` are the existing milestone mapping; native GitHub milestone objects have not been created or verified. The issue-backed Kanban is operational, while a native Projects board is not evidenced.

### Parallel tracks and exit gates

| Track | Existing issues | Immediate action | Exit / guardrail |
|---|---|---|---|
| Governance critical path | VC-W02, W03, W04–W06 | Obtain named owner/approver, approve photo/contact policy, select identity/session and demonstrate direct `/exec` denial | **Blocked** until actual decisions and negative security tests; no PII API enabled |
| Data synthetic-only | VC-W07, W08, W09, W26–W28 | Review canonical six-tab dictionary; extend Fake Sheets tests for duplicate/optimistic version, missing record and rollback-safe errors | VC-W08's dependency on VC-W07 is **not waived**; draft tests can be developed for review but no real Sheets writes/migrations |
| Frontend synthetic-only | VC-W15, W18 | Vue 3 mock shell, responsive routes, scanner POC integration behind a mock adapter | No privileged `/exec` calls, no live contacts, no claim of authenticated E2E |
| Runtime evidence | VC-W29, W30, W31 | Reconcile GAS source push/version, inspect actual deployed `/exec` version and editor-to-Sheets read-only evidence | Version 5 is last evidenced push; 17-module CI is **not** proof of a later push; bootstrap 7/7 is not protected API acceptance |
| Protected vertical slice and pilot | VC-W10–W14, W16–W21 | Only after M1 security and M2 data gates, then staged synthetic E2E, UAT and approved pilot | No production release before owner, security and PDPA sign-off |

### Milestone acceptance protocol

1. **M0:** named business/data/security owners, explicit decision log and scope approval; document-only completion does not close ownership gaps.
2. **M1:** auth/session provider, RBAC, direct GAS URL bypass threat test, deny-by-default proof and reviewer approval.
3. **M2:** approved dictionary, synthetic repository integrity tests, schema drift handling; live Sheet adapter only with controlled test data and approved access.
4. **M3:** authorized vehicle/contact/QR use cases with persistence, audit, revocation and negative tests; no raw QR token in Sheets.
5. **M4:** Vue 3 vertical slice on approved adapter, route guards, accessibility, device camera and safe contact-action tests.
6. **M5:** staging security, PDPA, UAT, rollback and operations runbook with dated reviewer evidence.
7. **M6:** controlled pilot go/no-go signed by owner; real rollout separately authorized.

### Board operating constraints

- WIP target: **at most 2 synthetic engineering tasks** concurrently, plus 1 governance/security decision item; adjust only when team capacity is known.
- Require a linked branch/PR, tests, commit SHA and reviewer before moving to DONE-EVIDENCED; GitHub Actions CI alone does not prove GAS Web App deployment.
- Use existing Issues for acceptance evidence and `AGILE_KANBAN.md` for board operations; do not duplicate a project management document.
- Native milestone numbers cannot be safely assigned until the exact objects exist and their IDs are verified. The connected integration does not expose native milestone or Projects board creation; do not fabricate completion.


## 6. Mandatory Thai cyber law, traffic-data and privacy compliance gate (2026-11-17 requirement)

**Status: REQUIRED / LEGAL APPLICABILITY AND IMPLEMENTATION NOT YET VERIFIED.** This is a Phase-1 cross-cutting acceptance gate, not a claim of legal compliance or approval. Existing M0–M6 and work IDs remain authoritative; use VC-W02/W03 (owner and policy), VC-W04–06 (security), VC-W19 (security testing), VC-W20 (UAT/PDPA), VC-W21 (pilot) for execution rather than duplicating an issue or a new planning document.

### Sources and applicability questions

1. Computer Crime Act B.E. 2550 as amended B.E. 2560, section 26, and Ministry of Digital Economy and Society Notification on Computer Traffic Data Retention B.E. 2564 ([official ministry publication](https://mdes.go.th/storage/contents/file/aKZWEjqNLyG6DPKX8jVbvkrewbOG5Wsc8K2zt3OT.pdf)). Legal/security reviewer must classify whether the agency and this app act as an in-scope service provider, which appendix fields apply, and which infrastructure/cloud provider supplies which logs. For in-scope providers the general minimum is **90 days**, with possible lawful preservation orders up to statutory limits; this is **not** a blanket retention policy for all business records.
2. Cybersecurity Act B.E. 2562: assess public-agency obligations, applicable national/agency cyber standards, risk management and incident response; do **not** assert that this app is automatically designated critical information infrastructure.
3. Personal Data Protection Act B.E. 2562: review lawful basis, notice, purpose limitation, access scope, processors, retention/deletion, breach response and data-subject rights **to the extent applicable**, including any public-authority exceptions or sector-specific rules requiring legal interpretation.

### Required engineering controls and evidence

- **Separate** (a) application security/audit events (login success/failure, role decision, QR resolve, plate search, contact reveal, mutations, administrative actions) from (b) network/computer traffic data prescribed for the applicable provider category. Neither is automatically a substitute for the other.
- Record UTC timestamp and synchronized clocks, request/correlation ID, trusted actor/session reference, event/action, resource reference, decision/outcome, source IP and proxy attribution **where lawfully available and technically trustworthy**, user-agent/device context where justified. Never log passwords, bearer/session tokens, raw QR secrets, contact numbers, photo bytes or unredacted payloads.
- Confirm whether Apps Script web app can supply authoritative client IP/network metadata and adequate ingress logs. **Do not invent IP provenance**; if GAS cannot satisfy the required traffic-log fields, choose a compliant controlled ingress/logging architecture through an approved security design and update the application-specific decision log; do not silently bypass Master Blueprints.
- Protect logs with least-privilege read access, write-once/tamper-evident or independently protected centralized storage, encryption, retention/expiry, integrity checks, clock synchronization, controlled export and documented incident/legal hold. A mutable Google Sheet by itself is **not** accepted as tamper-resistant traffic-log storage.
- Test unauthorized access, direct GAS `/exec` bypass, event coverage, retention/expiry, immutable/tamper detection, timestamp correctness, safe redaction, incident escalation and evidence export in synthetic staging. Record test date, owner/reviewer, CI/PR and outcome.
- **Release block:** M1 security proof and M5 security/legal/privacy sign-off must be evidenced before M6 pilot. Legal applicability, exact field list, retention schedule, host/cloud responsibility and actual deployment configuration remain open decisions, not assumed pass.

### Mandatory review role: Thai Cybersecurity Legal Counsel (AI advisory role)

**Role ID:** `TH-CYBER-LEGAL-REVIEWER` — independent advisory reviewer within the project review workflow. This is an AI-assisted specialist function, **not a real appointed lawyer, a professional legal opinion, or a substitute for the agency's authorized legal officer**.

**Scope:** (1) Computer Crime Act B.E. 2550 and amendments, section 26 and relevant subordinate traffic-data retention notification; (2) Cybersecurity Act B.E. 2562 and agency-specific applicability; (3) PDPA B.E. 2562, applicable exemptions and agency rules; (4) Electronic Transactions Act and other relevant Thai rules where triggered by system functionality; (5) retention, lawful access, logging, data disclosure, incident response, evidence integrity and vendor/cloud obligations.

**Mandatory deliverable for every security/data change PR:** a dated legal applicability matrix containing legal instrument and current authoritative source, provision, whether applicable/uncertain/not applicable, system-specific fact, technical control, evidence reference, residual risk, named owner, and required human approval. No legal assertions without cited authoritative sources; unresolved interpretation is a **BLOCKED** gate, not a pass.

**Review workflow:** Developer drafts design → security reviewer performs threat model → TH-CYBER-LEGAL-REVIEWER performs independent legal check → data steward/privacy reviewer checks personal-data impact → authorized Thai agency legal officer signs off applicability → business owner accepts residual risk → implement in staging with evidence → release gate approval. AI reviewer can return `ADVISORY_PASS`, `CHANGES_REQUIRED`, or `LEGAL_CLARIFICATION_REQUIRED`; **only a named authorized human** may grant `LEGAL_APPROVED`.

**Immediate review questions:** Is this system an in-scope service provider for computer traffic-data retention? Which exact fields and retention rule apply? Is GAS capable of authoritative source IP and tamper-resistant logs? Is any separate traffic-log gateway/storage necessary? Which PDPA provisions and agency exceptions apply? Who is the legal controller/processor, incident owner and records custodian? Until answered, schema v2 remains proposal-only and protected routes/pilot remain blocked.

**No invented staffing:** assigning this AI role does not add a real GitHub assignee or represent that legal counsel has reviewed the project. Record the actual reviewer identity and signed outcome when the organization appoints one.

### Legal review decision policy — user-approved 2026-11-17

The AI advisory legal reviewer may **automatically clear the internal advisory review gate** when its completed, source-cited applicability matrix has no unresolved applicable-law issues, no missing mandatory controls, no material residual legal risks, and no ambiguous applicability requiring a qualified human interpretation. Record outcome `ADVISORY_PASS` and proceed to the next **already authorized** engineering/review stage without asking the project sponsor for redundant approval.

Use `CONDITIONAL_PASS` only for explicitly documented non-blocking observations with owner, deadline and follow-up verification. Use `BLOCKED` for material noncompliance, missing evidence, contested interpretation or an unresolved mandatory control; escalate with a concrete question.

**Separation of authority:** `ADVISORY_PASS` does not mean `LEGAL_APPROVED`, does not substitute for statutory/agency approval or a qualified human legal opinion, and cannot authorize a live Spreadsheet migration, protected API enablement, personal-data processing, or pilot/release where separate security, data-owner, change-control or human legal sign-off is required. Existing M1/M5/M6 release gates remain in force. Never mark the legal review completed merely because this policy is recorded; actual review findings and authoritative citations must be attached.
