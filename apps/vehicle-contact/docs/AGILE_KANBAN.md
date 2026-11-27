# P6 Vehicle Contact — Agile Kanban Operations & Live Issue Board

**Status:** SUPERSEDED 2026-11-27 — board of 2026-11-22; work order and status now: [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md) · [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md) · [ROADMAP.md](ROADMAP.md).

> **CURRENT HANDOFF (2026-11-22) — LIVE ISSUES REMAIN LANE AUTHORITY.** Counts, crosswalks and delivery narratives below are dated snapshots, not a current census. Use actual GitHub issue state and exactly one `status:*` label per issue; never infer or invent lane counts. For implementation/runtime context read [Current Delivery Status](CURRENT_DELIVERY_STATUS.md), [Delivery Execution Plan](PROJECT_MANAGEMENT_PLAN_20261121.md), [Live API Automation](LIVE_API_AUTOMATION.md), and [Code Map](CODE_MAP_20261121.md).

**Document ID:** P6VC-KANBAN-001  
**Created:** 2026-11-17 | **Last reconciled:** 2026-11-20 (Asia/Bangkok) | **Status:** OPERATIONAL ISSUE-BASED KANBAN; **NOT** a verified native GitHub Projects v2 board
**Canonical planning document:** [Development Roadmap](DEVELOPMENT_ROADMAP_PHASE1.md)  
**Primary journey epic:** [Registration-to-verification workflow](PRIMARY_WORKFLOW_DELIVERY_PLAN.md)
**Compact continuation SSOT:** [Current Delivery Status / Resume Here](CURRENT_DELIVERY_STATUS.md)
**Work-tracking source:** [GitHub Issues](https://github.com/idev006/MT-Agency-Super-App-Framework/issues) with stable issue IDs `VC-W01`–`VC-W31` plus P6VC engineering gates #38–#39. Actual issue state and `status:*` label supersede this document's historical snapshots.

## 1. Live Kanban lanes

These links query **live GitHub Issues** by label. To inspect all app tickets, search for `VC-W` in the repository. No owners, estimates or approved delivery dates were invented.

| Lane | Live GitHub filter | Reconciled count (2026-11-20) | Rule |
|---|---|---:|---|
| BACKLOG / TODO | [status:todo](https://github.com/idev006/MT-Agency-Super-App-Framework/issues?q=is%3Aissue+label%3A%22status%3Atodo%22) | 4 | Requirements and dependencies understood, no active worker assigned |
| IN PROGRESS | [status:in-progress](https://github.com/idev006/MT-Agency-Super-App-Framework/issues?q=is%3Aissue+label%3A%22status%3Ain-progress%22) | 3 | Work actually started, evidence/branch and next step recorded |
| REVIEW / TEST | [status:review](https://github.com/idev006/MT-Agency-Super-App-Framework/issues?q=is%3Aissue+label%3A%22status%3Areview%22) | 4 | Deliverable ready for technical/business review or tests, not yet accepted |
| BLOCKED | [status:blocked](https://github.com/idev006/MT-Agency-Super-App-Framework/issues?q=is%3Aissue+label%3A%22status%3Ablocked%22) | 15 | Missing approval, security/architecture proof, access or hard dependency |
| DONE — EVIDENCED | [status:done-evidenced](https://github.com/idev006/MT-Agency-Super-App-Framework/issues?q=is%3Aissue+label%3A%22status%3Adone-evidenced%22) | 7 | Closed with evidence; scope-limited completion only |
| ON HOLD / FUTURE | [status:on-hold](https://github.com/idev006/MT-Agency-Super-App-Framework/issues?q=is%3Aissue+label%3A%22status%3Aon-hold%22) | 1 | Future phase; not executable or accessible in Phase 1 |

**GitHub Issues filter note:** GitHub's default issue list shows only open issues. Click **closed** or use [all evidence-completed tickets including closed](https://github.com/idev006/MT-Agency-Super-App-Framework/issues?q=is%3Aissue+is%3Aclosed+label%3A%22status%3Adone-evidenced%22) to see DONE. The status labels are literal GitHub issue labels, not native Projects fields.

**Status authority:** Maintain exactly one `status:*` label per issue. Use issue state `closed` only for `DONE-EVIDENCED`; future work remains open/on-hold. If work reopens, restore `open` state and appropriate label. A red/green label alone is never proof of release approval.

## 2. Initial swimlanes / issue crosswalk

| Lane | Work IDs / direct issue links |
|---|---|
| DONE-EVIDENCED | [VC-W01](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/1) (SA docs); [VC-W23](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/23) (canonical JSON); [VC-W24](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/24) (drift detector); [VC-W25](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/25) (proposal generation) |
| REVIEW | [VC-W07](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/7) (Data Dictionary approval) |
| TODO | [VC-W08](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/8), [VC-W09](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/9), [VC-W15](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/15), [VC-W18](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/18), [VC-W26](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/26), [VC-W28](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/28) |
| BLOCKED | [VC-W02–06](https://github.com/idev006/MT-Agency-Super-App-Framework/issues?q=is%3Aissue+label%3A%22status%3Ablocked%22), [VC-W10–14](https://github.com/idev006/MT-Agency-Super-App-Framework/issues?q=is%3Aissue+label%3A%22status%3Ablocked%22), [VC-W16–17](https://github.com/idev006/MT-Agency-Super-App-Framework/issues?q=is%3Aissue+label%3A%22status%3Ablocked%22), [VC-W19–21](https://github.com/idev006/MT-Agency-Super-App-Framework/issues?q=is%3Aissue+label%3A%22status%3Ablocked%22), [VC-W27](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/27) |
| ON-HOLD | [VC-W22](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/22) visitor/pass future-only |

The crosswalk above is the 2026-11-17 historical snapshot. Use the **live links above** and the reconciliation below for current status; never interpret either table as automatic synchronization.

### Reconciliation — 2026-11-20

| Result | Work / evidence |
|---|---|
| DONE-EVIDENCED | `VC-W15` Vue shared shell and `VC-W16` login/session adapter: PRs [#45](https://github.com/idev006/MT-Agency-Super-App-Framework/pull/45)–[#47](https://github.com/idev006/MT-Agency-Super-App-Framework/pull/47), responsive/accessibility evidence and live session acceptance. Existing completed items remain `VC-W01`, `VC-W23`–`VC-W25`, `VC-W30`. |
| IN-PROGRESS | `#61`, `VC-W17` and `VC-W18`: intake, registration review, STAFF plate search and manual QR resolve are delivered and wired; camera integration, unified detail and full deployed synthetic journey are not complete. |
| REVIEW | `VC-W07`, `VC-W27`, `VC-W29`, `VC-W31`: catalog-data approval, applied migration/recovery review, deployment governance reconciliation and the remaining secured/physical-device acceptance are still open. |
| BLOCKED / guarded | `VC-W04` and `VC-W06` have implemented authentication/RBAC with automated and live development evidence, but remain blocked from DONE pending named security/policy approval. `VC-W11`–`VC-W14` contain substantial backend implementation but retain their security/privacy/release dependencies. |

Delivery evidence since the initial snapshot:

- PRs [#44](https://github.com/idev006/MT-Agency-Super-App-Framework/pull/44)–[#55](https://github.com/idev006/MT-Agency-Super-App-Framework/pull/55) merged through `main` commit `3cfcf0e46a904c1e936a071b48837cde4dfa17e5`.
- STAFF read-only vehicle search and the SYSTEM_ADMIN administration pages have frontend unit/contract, build, responsive, corporate/dark and axe evidence in the linked frontend evidence documents.
- Manual GAS [run 44573790557](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44573790557) pushed tested source from `3cfcf0e` and created Apps Script source Version 20. The owner separately reported publishing that version to the Web App.
- Public read-only health verification on 2026-11-20 returned `status=ready`, `apiVersion=v1`, `backendVersion=0.4.0`, `releaseChannel=development`.
- Privileged development acceptance [run 44574709121](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44574709121) verified the selected administrator's full human access profile. It is not a production security/PDPA approval.
- PRs [#57](https://github.com/idev006/MT-Agency-Super-App-Framework/pull/57)–[#60](https://github.com/idev006/MT-Agency-Super-App-Framework/pull/60) delivered registration review, assisted intake and deployment evidence. The remaining delivery order is governed by the primary journey plan rather than by completing isolated actor menus.
- PR [#64](https://github.com/idev006/MT-Agency-Super-App-Framework/pull/64) delivered the normalized reference-catalog backend contract. Manual GAS run [44701663467](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44701663467) pushed Version 22; the owner reported Web App publication and public health independently returned Backend `0.5.0`. PR [#65](https://github.com/idev006/MT-Agency-Super-App-Framework/pull/65) then deployed the compatible Worker and Frontend `0.6.0`; approved catalog data and guarded Sheet migration remain blocked.
- The Project Owner's sanitized 2026-11-20 20:44 schema dry-run returned exactly one additive `CREATE_TABLE vc_reference_values` step with no blockers and no write (`applied:false`, `DRY_RUN`). The preview gate passes; guarded apply and catalog-data approval remain separate gates.
- The explicitly gated 20:59 DEV apply then returned `APPLIED` with backup created; the 21:00 post-apply dry-run returned no steps and no blockers. `VC-W27` moved from BLOCKED to REVIEW. Catalog content approval remains open under `VC-W07`.
- Reference Seed v1 source was merged in PR [#72](https://github.com/idev006/MT-Agency-Super-App-Framework/pull/72). Manual workflow [44826384253](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44826384253) pushed the tested Backend `0.6.0` artifact and created GAS source Version 24; Web App publication, live preview and checksum-bound seed apply remain separate gates.
- Brand/default refinement was merged in PR [#75](https://github.com/idev006/MT-Agency-Super-App-Framework/pull/75). Manual workflow [44831990140](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44831990140) pushed Backend `0.7.0` with the 645-row manifest and created GAS source Version 25; Web App publication, live preview and checksum-bound seed apply remain separate gates.
- The Project Owner published Web App **Version 26** on 2026-11-21 05:55. Credential-free `system.health` probes (direct GAS and Worker -> GAS) both returned Backend `0.7.0`, `status:ready`; publication gate PASS. Live seed preview and checksum-bound apply remain open under `VC-W07`.
- 2026-11-21 seed incident resolved: the 07:06 apply failed on Sheets USER_ENTERED coercion; fixes PR #78 (plain-text write, 0.7.1) and PR #80 (real `clearContent` API + API-surface guard test, 0.7.2) were pushed with owner confirmation as source Versions 27/28. Gated recovery cleared 645 dirty rows (07:52) and the checksum-approved reapply returned `APPLIED`/645/backup then `ALREADY_APPLIED` (07:56). Catalog is seeded in `ADVISORY`; Web App deployment still serves Version 26 and must be switched to Version 28. Evidence: [seed coercion incident](REFERENCE_SEED_COERCION_INCIDENT_20261121.md).
- Owner-authorized synthetic API E2E (08:22–08:29): admin login -> organizations.list -> references.registration (`ADVISORY` 77/524/16/17 live) -> campaigns.create/validate -> 50 photo uploads -> 10/10 `registrations.submit` `PENDING_APPROVAL` with canonical codes + referenceVersion; idempotent replay returned the same requestId; listPending showed all 10. Next: review/approve then vehicle/QR/lookup under #61. Evidence: [synthetic E2E](SYNTHETIC_REGISTRATION_E2E_20261121.md).

### Primary journey execution order

Use the [Primary Workflow Delivery Plan](PRIMARY_WORKFLOW_DELIVERY_PLAN.md) as the Epic-level sequence. Strict `qr.resolve` Worker contract and the manual Vue resolver are current release candidates; continue with camera decoding/cleanup → controlled synthetic deployed journey → browser/device/recovery evidence. Existing `VC-W` issues remain the trackable capabilities and blockers under that journey; this document does not fabricate a native Projects parent/child relationship.

## 3. Agile operating policy (proposed cadence, not a scheduled event)

**Method:** Kanban with lightweight Scrum ceremonies (Scrumban). Board lives in GitHub Issues; delivery plan lives in app-specific docs.

- **Daily 10–15 min** (when team agrees to run): each owner states what changed, next executable action, blockers and evidence in their Issue.
- **Weekly replenishment/planning:** select up to 3 engineering tickets that are genuinely ready and non-blocked; ensure security work is prioritized over protected-data CRUD. This is a **suggested WIP limit**, not an existing team agreement.
- **Weekly review/demo:** demonstrate one runnable slice or test evidence and compare expected/actual.
- **Weekly retro:** identify leading blockers, nonproductive work and decisions needing sponsor escalation.
- **Monthly governance:** review stakeholder approvals, privacy, security, scope and delivery risk.

**Flow:** TODO → IN PROGRESS → REVIEW → DONE-EVIDENCED. BLOCKED can be entered from any open stage; move back only after documenting blocker resolution. ON-HOLD requires fresh approval before activation.

**Issue status update protocol:**
1. Assign a named owner in GitHub (if authorized); record actual start and dependency links.
2. Replace the current `status:*` label with the new lane and update issue body/comment with results and blockers.
3. Include commit/PR, CI run, app environment, test dates, sanitized evidence and reviewer.
4. Review acceptance criteria. Close as completed only if criteria and review pass; failure or unapproved scope remains open.
5. Product/system status reports must separate **source/docs/CI success** from **deployed runtime**, **field tests** and **business/security/PDPA approvals**.

## 4. Prioritization and next sprint candidate

**Immediate executable path:** approve and seed reference data under [VC-W07](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/7), while [VC-W27](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/27) receives migration/recovery review and [VC-W18](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/18) QR camera engineering continues independently. Then run the controlled synthetic Frontend → Worker → GAS journey under [#61](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/61). The production governance path through VC-W02/04/05/06 remains blocked pending named people/decisions and must not be bypassed.

**Engineering work that can proceed with synthetic data in parallel:** [VC-W08](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/8) fake Sheets tests and [VC-W18](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/18) QR scanner integration under the [Primary Workflow Delivery Plan](PRIMARY_WORKFLOW_DELIVERY_PLAN.md). The Vue shell/login and intake/review/search source slices already exist; controlled deployed E2E remains separate. **VC-W10** Google Drive photo adapter depends on effective Drive sharing permissions and approved image-access model.

## 5. Definition of Ready (DoR)

Every issue MUST include: specific user/business need; links to authoritative requirement or policy; exact deliverable; known dependencies; scope/PII classification; testable acceptance; owner/approver or unresolved named role; developer environment and release restrictions. Unresolved blocking dependencies prevent starting protected data operations.

## 6. Definition of Done (DoD)

- Code or document is in app SSOT and reviewed; no secret or real PII in repo.
- Relevant unit/integration, browser/physical device or security tests are attached with exact commit/build and environment.
- Data/schema/API compatibility verified; failure paths and redaction tested.
- Reviewer signs off issue acceptance criteria; recorded release status is not overstated.
- Phase-1 protected APIs require explicit separate security and PDPA approvals; passing CI alone is **not** acceptance of live data handling.

## 7. Governance and truthful progress metrics

Track weekly: total work items by live lane, throughput (# evidenced closed this week), cycle time (first in-progress to accepted), age of blocked items, WIP count, PR review lead time, CI pass/fail, defect reopen rate and critical security gate status. Compute from real issue history; do not fabricate baselines or completion percentages.

**Historical snapshot (2026-11-17):** 29 initial work items plus later `VC-W30`–`VC-W31`. **Reconciled 2026-11-20 scope:** 31 `VC-W` items plus two P6VC engineering-gate issues (#38–#39) and primary-journey epic #61. The 33 work/gate issues contain 7 DONE-EVIDENCED, 2 IN-PROGRESS, 4 REVIEW, 15 BLOCKED, 4 TODO and 1 ON-HOLD; #61 is the additional in-progress epic, so the live in-progress filter totals 3. A development Web App is live at Backend API `0.7.0` (Version 26, verified 2026-11-21); production/security/PDPA approval remains unconfirmed and must not be inferred.

## 8. Native GitHub Projects board status

A native GitHub Projects v2 board remains **NOT VERIFIED**. The authenticated CLI token used for the 2026-11-20 reconciliation lacks `read:project`, so it cannot independently inspect or synchronize a Projects board. The live issue-label views above are the current **issue-backed Kanban authority**. If a native Project is later enabled, it must mirror these labels and must not become a competing status SSOT.

## 9. Canonical references
- [Phase 1 Roadmap](DEVELOPMENT_ROADMAP_PHASE1.md)
- [System Analyst Baseline](SYSTEM_ANALYST_BASELINE_PHASE1.md)
- [Schema Sync](SCHEMA_SYNC_IMPLEMENTATION.md)
- [Vehicle Photo Media Storage](VEHICLE_MEDIA_STORAGE_DESIGN.md)
- [GAS Test Evidence](GAS_TEST_EVIDENCE.md)
- [Primary Workflow Delivery Plan](PRIMARY_WORKFLOW_DELIVERY_PLAN.md)


## 10. Evidence reconciliation — 2026-11-17 (post-handover)

This section supersedes the *initial snapshot counts only* above; preserve original historical snapshots for audit. Issue labels/states remain the live authority. Checked individually: VC-W01, W02, W04–W08, W15, W23–W25, W29–W31. Do **not** infer full board counts from this subset.

- VC-W29 is **REVIEW**, not the older BLOCKED/first-push-pending description: source pushes evidenced by [Version 3 run 44033187307](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44033187307), [Version 4 run 44034261629](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44034261629) and [Version 5 run 44035053861](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44035053861). Editor verification, actual /exec deployment version, and security gates are not accepted.
- VC-W30 is **closed/DONE-EVIDENCED**, limited to [7/7 live bootstrap smoke](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44036525176); protected routes are disabled.
- VC-W31 is **open/REVIEW**, with [10/10 Node synthetic tests](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44037490677) and 17-module build, but no secured E2E or proof that the 17-module artifact was pushed.
- VC-W08 remains **TODO** and explicitly depends on VC-W07 review. Synthetic-only tests that do not require approval can be scoped separately within the existing issue, but do not silently treat the dependency as resolved.
- VC-W15 remains **TODO**; mock-only Vue shell may be implemented without enabling protected APIs.
- The canonical existing work IDs include **M0** (governance, VC-W01–03), then M1–M6; do not relabel M0 tasks as M1 merely to fit a six-stage visualization. GitHub issue `area:m*` labels are not proof that native GitHub Milestone objects exist.
- This connected GitHub integration exposes issue `milestone` assignment but not creation/listing of native milestones or GitHub Projects board creation. Do not claim M1–M6 native objects or a draggable Projects board exist until verified by an authorized maintainer.

**Next board hygiene:** preserve one `status:*` label per issue; reconcile all 31 issues and exact counts against GitHub before publishing metrics; use existing issue bodies for acceptance/evidence, not duplicate tracking documents. Any milestone-number assignment requires verification of the actual native milestone ID and title.

### Complete issue-state census (2026-11-17)

All **31** issues VC-W01–VC-W31 were individually fetched after the initial reconciliation. GitHub issue states/labels yielded **5 DONE-EVIDENCED (closed): W01, W23, W24, W25, W30; 3 REVIEW: W07, W29, W31; 6 TODO: W08, W09, W15, W18, W26, W28; 16 BLOCKED: W02–W06, W10–W14, W16–W17, W19–W21, W27; 1 ON-HOLD: W22; 0 IN-PROGRESS**. Counts are a point-in-time audit, not an auto-refreshing dashboard. All fetched issues had **no native milestone assigned** (`milestone: null`); `area:m0` through `area:m6` are existing labels and the roadmap also includes M0. Native milestone creation/Projects board provisioning remains unverified/unavailable via this connector, so no milestone IDs were fabricated.
