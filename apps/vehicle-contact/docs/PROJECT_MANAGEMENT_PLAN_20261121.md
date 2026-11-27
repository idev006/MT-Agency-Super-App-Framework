# P6 Vehicle Contact — Project Management / Delivery Execution Plan

**Status:** SUPERSEDED 2026-11-27 — slice state of 2026-11-21; current order and status: [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md) · [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md) · [ROADMAP.md](ROADMAP.md).

**Document:** P6VC-PM-PLAN-001 | **Opened:** 2026-11-21 | **Last verified:** 2026-11-22 09:17 Asia/Bangkok
**Baseline:** handoff PR **#111**, merged `main` @ **`ad7630e`**; implementation/content PR **#110** @ **`bf3553d`**; published GAS **V48 / 0.9.1**, Frontend **0.8.0**, 56 operations, 25 Sheets
**Status:** ACTIVE slice/gate SSOT. Resume from [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md); release gates are detailed in [PRODUCTION_READINESS_PLAN_20261121.md](PRODUCTION_READINESS_PLAN_20261121.md).

## 1. Objective and definition of done

Deliver all five roles and 20 use cases with server-authoritative authorization, recoverable persistence, verified frontend journeys and explicit production approval.

A slice is not done merely because source exists. Record separately:

1. Source/contracts/tests merged with CI green.
2. Exact deployment state: GAS source HEAD, created source version, published Web App version, Worker version and Pages state are not interchangeable.
3. Live evidence with its transport stated. The current authenticated 72-case stage is direct-GAS; Worker behavior is proven independently, not by claiming every operation passed through the Worker.
4. Browser/device/business acceptance where applicable.
5. Human policy, PDPA, security, UAT and release decisions where required.

## 2. Current verified baseline

| Dimension | Current state |
|---|---|
| Operations/data | **56/56 operations** live-verified; **25/25 Sheets** audited after seed with zero visible errors and zero repairs. |
| Offline engineering | GAS `npm run check` **PASS**; C6 evidence includes GAS 139/139, FE 180/180 and Worker 31/31. |
| Live automation | **97/97 PASS** = 11 public direct-GAS + 14 Worker fail-closed + 72 authenticated direct-GAS; all five roles; cleanup 7/7. |
| DEV fixtures | 11 retired logically, 10 new ACTIVE; each 1 contact/5 photos/QR MATCH; cleanup 2/2. |
| Runtime | GAS Web App V48 / 0.9.1; Frontend 0.8.0; Worker `20180237-7441-481a-9540-e7ca2c9c79eb`. |
| Source nuance | Display-error maintenance repair is in GAS HEAD only; published API remains V48. Live report `f14458d` is not the merge/content baseline. |
| Production | **NOT production-ready / not released.** Human acceptance, decisions, credential rotation and sign-offs remain OPEN. |

See [live automation and reset evidence](LIVE_API_AUTOMATION.md).

## 3. Current slice board

| Slice | Current status | Evidence / remaining boundary |
|---|---|---|
| A1 | **DONE** | Published health is now V48 / 0.9.1. Initial V39 closure is historical; see §5. |
| A2 | **DONE** | Approval journey 10/10 plus negatives; [dated evidence](LIVE_DEV_E2E_EVIDENCE_20261121.md). |
| A3 | **DONE** | Historical 70/70, 55/55; current automation supersedes coverage with 72 authenticated cases and 56/56 operations. |
| B1 | **DONE** | Org ancestor cycle check; [evidence](BACKEND_ORG_CYCLE_CHECK_EVIDENCE_20261121.md). |
| B2 | **DONE** | Submit reconciliation, failure tests and [manual recovery runbook](OPERATION_JOURNAL_RECOVERY_RUNBOOK_20261121.md). Does not close B2b. |
| B2b | **DONE — engineering + published/live** | Durable journaling/compensation + restart convergence + idempotent replay for `registrationReview` and `assignRoles`; 6 injected-failure/restart tests, GAS check 164/164, `backendVersion` 0.9.2; **published V49**, live suite 97/97 + Sheets audit 0 errors + journals APPLIED; [B2b evidence](BACKEND_DURABLE_JOURNALING_B2B_EVIDENCE_20261122.md). |
| B3 | **BLOCKED — owner mapping** | Retention scheduler/notification business mapping not ratified. Blocks C5 with D5. |
| B4 | **DONE** | Login constant-work negative path; [evidence](BACKEND_LOGIN_CONSTANT_WORK_EVIDENCE_20261121.md). |
| C1 | **DONE — engineering** | [Change review](C1_CHANGE_REVIEW_SCREEN_EVIDENCE_20261121.md); browser/business acceptance OPEN. |
| C2 | **DONE — engineering** | [Unified detail](C2_VEHICLE_DETAIL_SCREEN_EVIDENCE_20261121.md); browser/business acceptance OPEN. |
| C3 | **DONE — engineering** | [Maintenance/conflict UX](C3_VEHICLE_MAINTENANCE_SCREEN_EVIDENCE_20261121.md); browser/business acceptance OPEN. |
| C4 | **DONE — engineering** | [OWNER journey](C4_MY_VEHICLES_SCREEN_EVIDENCE_20261121.md); browser/business acceptance OPEN. |
| C5 | **BLOCKED — not in progress** | Requires **D5 + B3** before RETENTION_WORKER console implementation or destructive rehearsal. |
| C6 | **DONE — engineering/live** | [Admin registry evidence](C6_ADMIN_VEHICLE_REGISTRY_EVIDENCE_20261121.md); VC-ADR-017 and browser/business acceptance OPEN. |
| QR camera | **DONE — engineering source (PR #112)** | Protected stash recovered against remote `main`; focused 16/16, Frontend 192/192, build/audit and direct adapter cleanup pass. [Evidence](QR_CAMERA_RECOVERY_EVIDENCE_20261122.md). Physical Android/iOS and browser/business acceptance remain OPEN. |
| D-E1 | **OPEN — human decision** | [E1 design](E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121.md) complete; bounded Sheets versus indexed-store decision not ratified. |
| D3 | **OPEN — human decision** | Phase priority/sequencing ratification. |
| D5 | **OPEN — human decision** | Destructive-retention enable mechanism/runbook; no enablement approved. |
| E1 | **DESIGN COMPLETE** | Engineering packet delivered; D-E1 remains OPEN. |
| E2 | **DONE** | Cross-role RBAC and live Worker fail-closed; [evidence](E2_WORKER_FAILCLOSED_EVIDENCE_20261121.md). Current C6 matrix is 250 checks. |
| E3 | **DOSSIER PREPARED — SIGN-OFFS OPEN** | [Dossier](E3_PRODUCTION_SIGNOFF_DOSSIER_20261121.md) is not PDPA/security/UAT/release approval. |
| Display repair | **DONE** | Root cause and narrow repair; [25-sheet incident/runbook](GAS_NUMBERFORMAT_DISPLAY_CORRUPTION_INCIDENT_20261121.md). Follow-up source is GAS HEAD only. |
| Live automation | **DONE** | [97/97, 56/56, cleanup and reports](LIVE_API_AUTOMATION.md); future protected GitHub secrets are optional, not a retrospective blocker. |
| DEV reset/audit | **DONE** | 11 retired/10 ACTIVE, cleanup 2/2; post-seed audit 25/25, zero errors/repairs. |

VC-ADR-014, VC-ADR-015 and VC-ADR-017 remain **OPEN for security/PDPA ratification** even though their engineering slices are delivered. See [DECISION_LOG.md](DECISION_LOG.md).

## 4. Milestones and critical path

| Milestone | Current assessment | Remaining unlock |
|---|---|---|
| M0 — Primary journey live-verified | **CLOSED — engineering** | Human browser/business acceptance remains separate. |
| M1 — Backend hardened and live-proven | **CLOSED for B1/B2/B4 scope** | B2b is an explicit follow-up, not silently included. |
| M2 — REGADMIN + OWNER frontend | **CLOSED — engineering** | Browser/business acceptance OPEN. C6 extends this scope. |
| M3 — Worker execution gated and rehearsed | **BLOCKED** | Human D5 + B3, then C5 and synthetic-only rehearsal. |
| M4 — Production readiness | **OPEN** | QR device acceptance, C5 dependency, decisions, credential rotation and all release sign-offs. B2b delivered + published. |

**Remaining engineering path:** B2b durable journaling is **delivered AND published/live-verified** (GAS check 164/164, `backendVersion` 0.9.2; live V49, suite 97/97, Sheets audit 0 errors, journals all APPLIED — [evidence §9](BACKEND_DURABLE_JOURNALING_B2B_EVIDENCE_20261122.md)). No further B2b engineering remains. QR physical-device evidence is a human/device gate, not an engineering substitute.
**Blocked path:** **D5 + B3 → C5 → synthetic retention rehearsal**. C5 must not be reported in progress while its decisions are open.
**Release-critical human path:** browser/business acceptance + D-E1/D3 + VC-ADR-014/015/017 + credential rotation + PDPA/security/UAT/release approvals. None may be self-approved by an assistant.

## 5. Dated historical results — retained as history

These results remain useful evidence but do not replace the current baseline above.

| Date | Historical result | Current interpretation |
|---|---|---|
| 2026-11-21 | A1 initially closed on Web App V39 / 0.9.0; later hardening published at V41 | Superseded by current V48 / 0.9.1. |
| 2026-11-21 | A2 approval E2E 10/10; lookup/QR MATCH and negative cases PASS | Completed journey evidence; not current operation count. |
| 2026-11-21 | A3 70/70 tests, 55/55 operations, all five roles | Superseded for current inventory by 72 authenticated cases and 56/56 operations. |
| 2026-11-21 | B1 7/7; B2 journal recovery 7/7; B4 5/5; then-full GAS suite 123/123 | Slice evidence remains valid; current offline suite is measured by `npm run check`. |
| 2026-11-21 | C1–C4 source/test/build evidence, ending at FE 172/172 before C6 | Browser acceptance was and remains a human gate; C6 later measured FE 180/180. |
| 2026-11-21 | E2 original RBAC matrix 245 checks over 49 protected operations; Worker 31/31 and live 14/14 | C6 adds one protected operation; current RBAC matrix is 250 checks. |
| 2026-11-21 | Original number-format repair fixed 6,659 display-format cells across 21 sheets | Follow-up legacy-value/header repair and post-seed audit are the final current evidence. |

## 6. Execution and safety rules

- Small slices include source, DTO/permission/inventory gates, Worker allowlist when applicable, tests, evidence and decision-log updates when policy changes.
- The GitHub Actions GAS source-push workflow requires the exact owner phrase **`PUSH_VEHICLE_GAS`**. A separately owner-authorized assistant `clasp` self-deploy path may be used within its approved scope; source push/version creation remains separate from Web App publication.
- Credentials are environment/profile based and never committed, logged or pasted into documentation. Rotate credentials through the owner/security process.
- Live writes are synthetic DEV only under the documented guard; preserve cleanup failures as failures. Never run enabled destructive retention against real data.
- Sheets access stays bounded, text-preserving and without cross-sheet joins. Preserve schema fail-closed behavior and idempotent repair evidence.
- Frontend permission gates never replace GAS authorization. No client-supplied identity or role is authoritative.
- Do not mark C5 unblocked, QR device acceptance complete, or any human gate approved without actual evidence and approver identity.

## 7. Tracking

- Current facts and next actions: [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md).
- Release evidence/gates: [PRODUCTION_READINESS_PLAN_20261121.md](PRODUCTION_READINESS_PLAN_20261121.md) and [E3 dossier](E3_PRODUCTION_SIGNOFF_DOSSIER_20261121.md).
- Decisions: [DECISION_LOG.md](DECISION_LOG.md). Live work: [Agile Kanban](AGILE_KANBAN.md) and repository Issues.
- After each slice, record exact source PR/SHA, component versions, test transport/scope, deployment state and residual human gates.
