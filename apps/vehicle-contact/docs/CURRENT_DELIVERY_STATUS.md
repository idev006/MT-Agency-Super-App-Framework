# P6 Vehicle Contact — Current Delivery Status / Resume Here

**Last verified:** 2026-11-22 10:25 Asia/Bangkok (V50 publication health re-verified: live `/exec` ×2 + Worker→GAS end-to-end 200)
**Current main:** PR **#117** merged @ **`14a61a5`** (B2b durable journaling). **Live GAS Web App V50 / `backendVersion` 0.9.2** (V50 published via owner-authorized clasp 2026-11-22, runtime-identical to V49; health re-verified direct ×2 + Worker→GAS end-to-end 200. Live suite 97/97 + independent Sheets audit 0 errors verified at V49, identical runtime). Prior: #116 owner decision briefing + QR device plan @ `4daf25b`; #115 independent Sheets SSOT data audit @ `45fdf7c`; #114 gated synthetic DEV clean-init reset @ `9269be2`. Full test includes an **independent read-only Sheets SSOT data audit** (25/25 sheets, 0 display errors, 10/10 fixtures, clean FK, B2b journals APPLIED) — an API `OK` is not treated as data proof.
**Handoff baseline:** PR **#111**, merged `main` @ **`ad7630e`**
**Source/content baseline:** PR **#110**, merged `main` @ **`bf3553d`**
**Status:** DEV engineering evidence is strong; **production readiness and all human sign-offs remain OPEN**.

Read this page first. The [PM plan](PROJECT_MANAGEMENT_PLAN_20261121.md) owns slice state and dependencies; the [production readiness plan](PRODUCTION_READINESS_PLAN_20261121.md) owns release gates; [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md) contains the next-AI prompt, precedence and diagrams. Dated evidence documents retain the versions and counts measured on their dates.

## 1. Verified runtime and source boundary

| Component | Current verified state |
|---|---|
| GAS Backend API | Published Web App **Version 50**, `backendVersion` **0.9.2**, `status:ready`; **56 operations** over **25 logical Sheets**. Runtime-identical to V49 (F2 Firestore adapter bundled-not-wired + DB-agnostic schema metadata). Includes **B2b durable journaling**; V50 published via owner-authorized clasp 2026-11-22, health re-verified direct (×2) + Worker→GAS end-to-end 200; live suite 97/97 + Sheets audit 0 errors verified at V49 (identical runtime). |
| Frontend | **0.8.0**, deployed on GitHub Pages; C6 approved-vehicle registry is present. |
| Cloudflare Worker | Version **`20180237-7441-481a-9540-e7ca2c9c79eb`**; live fail-closed probes passed. |
| GAS HEAD maintenance source | Display-error repair + **B2b durable journaling** (`backendVersion` **0.9.2**) **published in V49**. On 2026-11-22 the owner-authorized `PUSH_VEHICLE_GAS` CI workflow pushed HEAD `8fd9d3a` source and created **GAS version 50** ([run 45010301788](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/45010301788); 57 modules incl. the bundled-not-wired F2 Firestore adapter + DB-agnostic schema metadata; runtime-identical to V49). Version 50 was **subsequently PUBLISHED** to the Worker-facing pinned deployment via the owner-authorized clasp self-deploy path (owner `approve`); **live is now V50 / 0.9.2**, runtime-identical to V49. Health re-probed `0.9.2`/`ready` direct (×2, no 404) **and** Worker→GAS end-to-end **200** with a valid envelope. Source push, version creation and Web App publication remain distinct facts; the CI workflow never publishes. [Evidence](GAS_TEST_EVIDENCE.md). |

`f14458d` is the `sourceCommit` recorded in the executed live report while harness changes were still uncommitted. It is **not** the merge/content baseline; use **`bf3553d` / PR #110** for source reconciliation. Runtime endpoints, credentials and session material are intentionally not reproduced here.

These are DEV facts, not PDPA, security, UAT or production-release approval.

## 2. Current verification evidence

| Layer | Verified result | Scope boundary |
|---|---|---|
| Offline GAS | `npm --prefix apps/vehicle-contact/backend/gas run check` **PASS** | Build, contracts, RBAC, compiled-GAS and repair regressions; see the automation runbook for the executed inventory. |
| Live automation | **97/97 PASS**, **56/56 operations**, cleanup **7/7**, all five roles | 11 public direct-GAS + 14 Worker fail-closed + 72 authenticated **direct-GAS** cases. The 72 authenticated cases are **not** an all-through-Worker claim. |
| DEV fixture reset | 11 vehicles logically retired; 10 new `ACTIVE`; each has 1 contact, 5 photos and QR `MATCH`; cleanup **2/2** | Domain lifecycle preserved related records and audit history; no physical table clear. |
| Post-seed Sheets audit | **25/25 sheets**, zero visible errors before/after, zero repairs, no incomplete sheets | Confirms the reset did not recreate display corruption. |
| **Independent Sheets data audit** | **25/25 sheets, 0 display errors, 25/25 headers OK, 10/10 ACTIVE fixtures complete** (1 contact / 5 photos / 1 QR / 1 APPROVED reg), **12 clean FK checks** | Raw-cell recheck via read-only `gviz` CSV **independent of the API** (an API `OK` is not data proof). Empty `vc_roles`/`vc_role_permissions` confirmed **by design** (frozen code catalog `ROLE_PERMISSIONS`). [Evidence](SHEETS_DATA_AUDIT_EVIDENCE_20261122.md). |

Canonical evidence and commands: [LIVE_API_AUTOMATION.md](LIVE_API_AUTOMATION.md). Reports are sanitized and gitignored. Optional protected GitHub secrets `P6VC_TEST_USERNAME` / `P6VC_TEST_PASSWORD` are needed only for a **future manual GitHub Actions full-suite run**; they are **not** a blocker for the completed local 97/97 run.

## 3. Delivery state

### DONE-EVIDENCED

- **A1–A3:** primary journey and live DEV verification; the earlier 10/10 approval and 70/70, 55-operation results remain dated history, superseded for current coverage by 97/97 and 56/56 above.
- **B1 / B2 / B4:** organization-cycle rejection, submit reconciliation plus tested manual recovery, and login constant-work hardening; published in V48.
- **C1–C4:** change review, unified vehicle detail, maintenance with version-conflict UX, and OWNER `my-vehicles`; source/tests delivered. Browser/business acceptance is still OPEN.
- **C6:** admin approved-vehicle registry using least-privilege `vehicles.list`, minimal non-PII projection and server-side `ACTIVE` filtering; [C6 evidence](C6_ADMIN_VEHICLE_REGISTRY_EVIDENCE_20261121.md). VC-ADR-017 ratification remains OPEN.
- **E2:** cross-role authorization regression and live Worker fail-closed verification; [E2 evidence](E2_WORKER_FAILCLOSED_EVIDENCE_20261121.md).
- **Display repair:** root-cause fixes and narrow, idempotent editor repair completed; final and post-seed audits cover 25/25 sheets with zero visible errors. [Incident and runbook](GAS_NUMBERFORMAT_DISPLAY_CORRUPTION_INCIDENT_20261121.md).
- **Live automation and DEV reset:** canonical workflow, sanitized reports, fail-closed gates and lifecycle-based fixtures completed as measured above.
- **E1/E3 preparation:** [datastore decision packet](E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121.md) and [sign-off dossier](E3_PRODUCTION_SIGNOFF_DOSSIER_20261121.md) are prepared; neither is an approval.

### ENGINEERING FOLLOW-UPS

| Work | State | Next boundary |
|---|---|---|
| QR camera | **DONE — engineering source (PR #112)** | Protected WIP recovered onto remote `main` base, direct adapter-cleanup tests pass, and source is delivered in PR #112. Physical Android/iOS and browser/business acceptance remain OPEN; source delivery is not device acceptance or deployment approval. |
| B2b durable journaling | **DONE — engineering + published/live-verified** | Durable PREPARED→APPLIED/ROLLED_BACK/RECOVERY_REQUIRED journal + compensation + automatic restart convergence + idempotent replay for `registrationReview` and `assignRoles`; deterministic derived QR token; 6 injected-failure/restart tests; GAS check **164/164 EXIT 0**; `backendVersion` 0.9.1→0.9.2. **Published V49** via owner-authorized clasp (carried in live **V50**, runtime-identical); live suite **97/97**, Sheets audit **0 errors**, journals all **APPLIED** (0 stuck). [B2b evidence §9](BACKEND_DURABLE_JOURNALING_B2B_EVIDENCE_20261122.md). [Runbook](OPERATION_JOURNAL_RECOVERY_RUNBOOK_20261121.md) §3.3/§3.5 manual steps retained only for `RECOVERY_REQUIRED`. Destructive retention stays disabled. |
| C5 RETENTION_WORKER console | **BLOCKED — not in progress** | Wait for human **D5 + B3** decisions. Destructive retention remains disabled; no real-data rehearsal. |

### HUMAN GATES — ALL OPEN

**Single decision sheet:** [Owner decision briefing](OWNER_DECISION_BRIEFING_20261122.md) collects D-E1/D3/D5/B3, VC-ADR-014/015/017, the four sign-offs and the human acceptance actions into one actionable page (options + recommendations + consequence map). It presents choices; it approves nothing.

- PDPA, security, UAT and production-release sign-offs.
- Browser/business acceptance of the delivered journeys, including gallery/copy, C1–C4 and C6, plus physical QR-device acceptance.
- Decisions/ratifications **D-E1, D3, D5, B3** and **VC-ADR-014 / 015 / 017**.
- Credential rotation and confirmation of the approved release-credential handling process.
- Catalog `ENFORCED` mode remains separately gated; current catalog mode is `ADVISORY`.

## 4. Exact next actions

1. **Obtain QR device acceptance** after reviewed Pages publication using named Android/iOS devices; record camera permission, switching, decode and cleanup evidence separately from the [offline engineering evidence](QR_CAMERA_RECOVERY_EVIDENCE_20261122.md).
2. **B2b durable journaling is delivered AND published** (V49→V50 / 0.9.2 live, runtime-identical; GAS check 164/164, live suite 97/97, Sheets audit 0 errors, journals all APPLIED). Remaining engineering is essentially complete; the critical path is the owner human gates in the [decision briefing](OWNER_DECISION_BRIEFING_20261122.md). Do not enable destructive retention.
3. **Keep C5 blocked** until the owner ratifies D5 and B3; only then implement the permission-gated console and synthetic two-person/`legal_hold` rehearsal.
4. **Arrange human browser/business acceptance** for the delivered screens and journeys. Capture sanitized evidence; do not convert API automation into UAT approval.
5. **Resolve release decisions and rotate credentials** through the owner/security process, then use the [production readiness plan](PRODUCTION_READINESS_PLAN_20261121.md) for any release-candidate deployment and final sign-off.

## 5. QR recovery result

The protected WIP was recovered from the documented stash onto remote `main` @ `ad7630e`, resolved against Frontend **0.8.0**, committed at `d92e08c` and pushed as PR **#112**. Focused QR/resolve tests pass **16/16**, the Frontend suite passes **192/192**, build and dependency audit pass, and direct adapter-cleanup paths are covered. See [QR camera recovery evidence](QR_CAMERA_RECOVERY_EVIDENCE_20261122.md).

Do not recreate or reapply the historical stash over PR #112. Physical Android/iOS acceptance remains required and must not be inferred from offline tests.

## 6. Safety and deployment rules

- GitHub source is canonical; generated `.gs` and deployed artifacts are not a second source tree.
- The GitHub Actions GAS source-push workflow requires the owner’s exact per-push phrase **`PUSH_VEHICLE_GAS`**. A separately owner-authorized assistant `clasp` self-deploy path may be used within its approved scope; neither path removes authorization or evidence requirements.
- Source push and source-version creation are **not** Web App publication. Record push, created version, publication/deployment and health verification as separate facts.
- Never expose credentials, session tokens, private endpoints, raw PII or secret-bearing logs. Live authenticated tests require their documented synthetic-DEV write guard and cleanup.
- Frontend permissions are UX only; GAS is the authorization authority. Never infer access from a client-supplied role.
- No schema mutation, destructive retention, production `ENFORCED` mode or production release without explicit authorization.

## 7. Evidence index

- [Owner decision briefing (one sitting)](OWNER_DECISION_BRIEFING_20261122.md) · [QR physical device acceptance plan](QR_DEVICE_ACCEPTANCE_PLAN_20261122.md)
- [World-class test suite plan](WORLD_CLASS_TEST_SUITE_PLAN_20261122.md) · [Data model ER diagram (25 Sheets)](DATA_MODEL_ER_DIAGRAM_20261122.md)
- [DEV clean-init reset evidence (Mode A-full executed + Mode B source)](DEV_CLEAN_RESET_EVIDENCE_20261122.md)
- [Independent Sheets SSOT data audit (raw-cell, read-only)](SHEETS_DATA_AUDIT_EVIDENCE_20261122.md)
- [Current live automation, reset and audit](LIVE_API_AUTOMATION.md)
- [A2/A3 historical live DEV evidence](LIVE_DEV_E2E_EVIDENCE_20261121.md)
- [QR camera recovery engineering evidence](QR_CAMERA_RECOVERY_EVIDENCE_20261122.md)
- [B1 org cycle](BACKEND_ORG_CYCLE_CHECK_EVIDENCE_20261121.md) · [B2 journal recovery](BACKEND_JOURNAL_RECOVERY_EVIDENCE_20261121.md) · [B2b durable journaling](BACKEND_DURABLE_JOURNALING_B2B_EVIDENCE_20261122.md) · [B4 login hardening](BACKEND_LOGIN_CONSTANT_WORK_EVIDENCE_20261121.md)
- [C1 change review](C1_CHANGE_REVIEW_SCREEN_EVIDENCE_20261121.md) · [C2 detail](C2_VEHICLE_DETAIL_SCREEN_EVIDENCE_20261121.md) · [C3 maintenance](C3_VEHICLE_MAINTENANCE_SCREEN_EVIDENCE_20261121.md) · [C4 my vehicles](C4_MY_VEHICLES_SCREEN_EVIDENCE_20261121.md)
- [Decision log](DECISION_LOG.md) · [Architecture SSOT](ARCHITECTURE_SSOT.md) · [Code map](CODE_MAP_20261121.md) · [Logical ER SSOT](DATA_MODEL_ER_DIAGRAM_20261122.md) · [Use-case SSOT](use-cases/README.md) · [F2 Firestore adapter](BACKEND_FIRESTORE_ADAPTER_F2_EVIDENCE_20261122.md) · [F4 Firestore DEV infra + connectivity read-back](BACKEND_FIRESTORE_INFRA_F4_EVIDENCE_20261122.md) · [POC #1 GAS Firestore REST + SA OAuth (offline 10/10 + live run #2 PASS 8/8; incident CLOSED)](BACKEND_FIRESTORE_REST_POC1_EVIDENCE_20261122.md) · [POC #1 live-shape incident](FIRESTORE_REST_LIVE_POC_INCIDENT_20261122.md) · [F3a real REST gateway + backend selection flag (offline 19/19, check exit 0)](BACKEND_FIRESTORE_GATEWAY_F3A_EVIDENCE_20261122.md)
