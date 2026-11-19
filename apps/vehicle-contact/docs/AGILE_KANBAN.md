# P6 Vehicle Contact — Agile Kanban Operations & Live Issue Board

**Document ID:** P6VC-KANBAN-001  
**Created:** 2026-11-17 | **Last reconciled:** 2026-11-20 (Asia/Bangkok) | **Status:** OPERATIONAL ISSUE-BASED KANBAN; **NOT** a verified native GitHub Projects v2 board
**Canonical planning document:** [Development Roadmap](DEVELOPMENT_ROADMAP_PHASE1.md)  
**Work-tracking source:** [GitHub Issues](https://github.com/idev006/MT-Agency-Super-App-Framework/issues) with stable issue IDs `VC-W01`–`VC-W31` plus P6VC engineering gates #38–#39. Actual issue state and `status:*` label supersede this document's historical snapshots.

## 1. Live Kanban lanes

These links query **live GitHub Issues** by label. To inspect all app tickets, search for `VC-W` in the repository. No owners, estimates or approved delivery dates were invented.

| Lane | Live GitHub filter | Reconciled count (2026-11-20) | Rule |
|---|---|---:|---|
| BACKLOG / TODO | [status:todo](https://github.com/idev006/MT-Agency-Super-App-Framework/issues?q=is%3Aissue+label%3A%22status%3Atodo%22) | 5 | Requirements and dependencies understood, no active worker assigned |
| IN PROGRESS | [status:in-progress](https://github.com/idev006/MT-Agency-Super-App-Framework/issues?q=is%3Aissue+label%3A%22status%3Ain-progress%22) | 1 | Work actually started, evidence/branch and next step recorded |
| REVIEW / TEST | [status:review](https://github.com/idev006/MT-Agency-Super-App-Framework/issues?q=is%3Aissue+label%3A%22status%3Areview%22) | 3 | Deliverable ready for technical/business review or tests, not yet accepted |
| BLOCKED | [status:blocked](https://github.com/idev006/MT-Agency-Super-App-Framework/issues?q=is%3Aissue+label%3A%22status%3Ablocked%22) | 16 | Missing approval, security/architecture proof, access or hard dependency |
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
| IN-PROGRESS | `VC-W17`: STAFF vehicle search is delivered and wired; scanner and the remaining actor/operator flows are not complete. |
| REVIEW | `VC-W07`, `VC-W29`, `VC-W31`: data-dictionary approval, deployment governance reconciliation and the remaining secured/physical-device acceptance are still open. |
| BLOCKED / guarded | `VC-W04` and `VC-W06` have implemented authentication/RBAC with automated and live development evidence, but remain blocked from DONE pending named security/policy approval. `VC-W11`–`VC-W14` contain substantial backend implementation but retain their security/privacy/release dependencies. |

Delivery evidence since the initial snapshot:

- PRs [#44](https://github.com/idev006/MT-Agency-Super-App-Framework/pull/44)–[#55](https://github.com/idev006/MT-Agency-Super-App-Framework/pull/55) merged through `main` commit `3cfcf0e46a904c1e936a071b48837cde4dfa17e5`.
- STAFF read-only vehicle search and the SYSTEM_ADMIN administration pages have frontend unit/contract, build, responsive, corporate/dark and axe evidence in the linked frontend evidence documents.
- Manual GAS [run 44573790557](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44573790557) pushed tested source from `3cfcf0e` and created Apps Script source Version 20. The owner separately reported publishing that version to the Web App.
- Public read-only health verification on 2026-11-20 returned `status=ready`, `apiVersion=v1`, `backendVersion=0.4.0`, `releaseChannel=development`.
- Privileged development acceptance [run 44574709121](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44574709121) verified the selected administrator's full human access profile. It is not a production security/PDPA approval.

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

**Immediate critical path:** [VC-W02](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/2) project owners → [VC-W04](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/4) auth provider → [VC-W05](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/5) non-bypassable GAS ingress → [VC-W06](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/6) RBAC → protected Backend groups. These are **blocked pending people/decisions**.

**Engineering work that can proceed with synthetic data in parallel:** [VC-W08](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/8) fake Sheets tests, [VC-W15](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/15) Vue mock shell, [VC-W18](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/18) QR scanner PoC integration. **VC-W10** Google Drive photo adapter depends on effective Drive sharing permissions and approved image-access model.

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

**Historical snapshot (2026-11-17):** 29 initial work items plus later `VC-W30`–`VC-W31`. **Reconciled 2026-11-20 scope:** 31 `VC-W` items plus two P6VC engineering-gate issues (#38–#39). Live labels after reconciliation: 7 DONE-EVIDENCED, 1 IN-PROGRESS, 3 REVIEW, 16 BLOCKED, 5 TODO and 1 ON-HOLD. A development Web App is live at Backend API `0.4.0`; production/security/PDPA approval remains unconfirmed and must not be inferred.

## 8. Native GitHub Projects board status

A native GitHub Projects v2 board remains **NOT VERIFIED**. The authenticated CLI token used for the 2026-11-20 reconciliation lacks `read:project`, so it cannot independently inspect or synchronize a Projects board. The live issue-label views above are the current **issue-backed Kanban authority**. If a native Project is later enabled, it must mirror these labels and must not become a competing status SSOT.

## 9. Canonical references
- [Phase 1 Roadmap](DEVELOPMENT_ROADMAP_PHASE1.md)
- [System Analyst Baseline](SYSTEM_ANALYST_BASELINE_PHASE1.md)
- [Schema Sync](SCHEMA_SYNC_IMPLEMENTATION.md)
- [Vehicle Photo Media Storage](VEHICLE_MEDIA_STORAGE_DESIGN.md)
- [GAS Test Evidence](GAS_TEST_EVIDENCE.md)


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
