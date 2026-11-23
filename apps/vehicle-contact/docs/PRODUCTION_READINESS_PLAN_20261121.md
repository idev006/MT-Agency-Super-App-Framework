# P6 Vehicle Contact — Production Readiness Plan

**Document:** P6VC-PROD-PLAN-001 | **Opened:** 2026-11-21 | **Last verified:** 2026-11-22 09:17 Asia/Bangkok
**Baseline:** handoff PR **#111**, merged `main` @ **`ad7630e`**; implementation/content PR **#110** @ **`bf3553d`**
**Status:** ACTIVE GATE TRACKER — **NOT PRODUCTION-READY AND NOT RELEASE-APPROVED**. The original 48-hour target is historical, not a remaining schedule or approval.

Companions: [current status](CURRENT_DELIVERY_STATUS.md), [PM slice board](PROJECT_MANAGEMENT_PLAN_20261121.md), [E1 datastore decision packet](E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121.md), and [E3 sign-off dossier](E3_PRODUCTION_SIGNOFF_DOSSIER_20261121.md).

## 1. Release-candidate definition

Production readiness requires all applicable items below, with evidence and named human approval:

1. Delivered engineering scope is merged and tested, including QR recovery/device evidence and B2b durable recovery.
2. C5 is either explicitly excluded by an approved scope decision or unblocked by **D5 + B3**, implemented and rehearsed synthetically. The assistant must not make that scope decision.
3. Live deployment provenance is exact: reviewed source SHA, GAS source version, published Web App version, Worker version and Pages build are recorded separately.
4. Authorization and recovery regressions pass, including Worker fail-closed evidence and clearly labelled direct-GAS versus through-Worker coverage.
5. Browser/business UAT and physical Android/iOS QR acceptance are signed off.
6. **D-E1, D3, D5, B3** and **VC-ADR-014/015/017** are resolved as applicable.
7. Credentials are rotated and release-secret handling is approved.
8. PDPA, security, UAT and final release sign-offs are explicitly approved. None is inferred from tests or elapsed time.

## 2. Completed engineering evidence — current

| Area | Verified result | What it does not prove |
|---|---|---|
| Runtime | GAS Web App **V48 / 0.9.1**; Frontend **0.8.0**; Worker **`20180237-7441-481a-9540-e7ca2c9c79eb`** | Production approval or immutable future deployment state. |
| Offline | GAS `npm run check` **PASS**; C6 evidence GAS 139/139, FE 180/180, Worker 31/31 | Browser/business/device acceptance. |
| Live automation | **97/97 PASS**, **56/56 operations**, all five roles, cleanup **7/7** | The 72 authenticated cases are direct-GAS, not all-through-Worker; no production sign-off. |
| DEV data | 11 logically retired, 10 new ACTIVE with 1 contact/5 photos/QR MATCH; cleanup 2/2 | Real-data migration or production UAT. |
| Sheets | Post-seed audit **25/25**, zero visible errors and zero repairs | Production-scale acceptance or permission to mutate schema. |
| Delivery slices | A1–A3, B1/B2/B4, C1–C4, C6, E2, display repair and live automation complete | B2b, QR acceptance and blocked C5 are not included. |
| E1/E3 preparation | Datastore design and sign-off dossier prepared | D-E1 or any PDPA/security/UAT/release decision. |

Evidence: [live automation](LIVE_API_AUTOMATION.md), [C6](C6_ADMIN_VEHICLE_REGISTRY_EVIDENCE_20261121.md), [E2](E2_WORKER_FAILCLOSED_EVIDENCE_20261121.md), and [Sheets repair](GAS_NUMBERFORMAT_DISPLAY_CORRUPTION_INCIDENT_20261121.md).

**Deployment boundary:** follow-up display-error maintenance source is in **GAS HEAD only**; the published API remains V48. A future release must reconcile reviewed source HEAD, source-version creation and actual Web App publication rather than assuming they are identical.

## 3. Remaining work and gates

| Item | Owner/state | Required closure evidence |
|---|---|---|
| QR camera recovery | Engineering source **DONE — PR #112** | Recovered against remote `main`; direct adapter-cleanup and offline suites pass. [Evidence](QR_CAMERA_RECOVERY_EVIDENCE_20261122.md). This does not close device acceptance. |
| Physical QR acceptance | Human/device **OPEN** | Android/iOS camera, decoding and switching evidence; automated tests cannot substitute. |
| B2b durable journaling | Engineering **TODO** | Durable `registrationReview`/`assignRoles` recovery, fault/restart tests and runbook update. |
| C5 console | **BLOCKED, not in progress** | Human D5 + B3 first; then gated UI and synthetic two-person/`legal_hold` rehearsal. Destructive retention stays disabled. |
| Browser/business acceptance | Human **OPEN** | Delivered journeys including gallery/copy, C1–C4 and C6, with sanitized reviewer evidence. |
| D-E1 data-scale decision | Human **OPEN** | Ratify bounded-volume Sheets with caps/monitoring or approve a separate indexed-store migration. |
| D3 sequencing | Human **OPEN** | Approved remaining scope/order. |
| D5 + B3 retention | Human **OPEN** | Enable mechanism/runbook and scheduler/notification mapping; no real-data destructive test. |
| VC-ADR-014/015/017 | Human **OPEN** | Security/PDPA ratification of owner-scoped reads, worker-scoped reads and admin registry. |
| Credential rotation | Owner/security **OPEN** | Rotation completed without exposing old/new values; release profiles and protected secrets reviewed. |
| PDPA/security/UAT/release | Named humans **OPEN** | Signed decisions in the E3 record or equivalent approved system. |

Protected GitHub secrets `P6VC_TEST_USERNAME` / `P6VC_TEST_PASSWORD` are optional for future manual full-suite Actions runs. They are **not** a blocker for the already completed local 97/97 run and must not be requested merely to validate that historical result.

## 4. Release sequence — no date commitment

1. Finish B2b engineering and complete QR Android/iOS acceptance; preserve C5 as blocked unless D5 and B3 are actually ratified.
2. Run relevant offline checks. Use the [live automation runbook](LIVE_API_AUTOMATION.md) only for authorized synthetic DEV verification, with exact transport and cleanup results reported.
3. Complete human browser/business and physical-device acceptance; rotate credentials through the approved security process.
4. Resolve D-E1/D3/D5/B3 and VC-ADR-014/015/017 as applicable; complete PDPA/security/UAT review.
5. Build the release candidate from a reviewed SHA. The GitHub Actions GAS source-push workflow requires exact per-push **`PUSH_VEHICLE_GAS`** authorization. A separately owner-authorized assistant `clasp` self-deploy path may be used only within its approved scope.
6. Record source push, created GAS source version, Web App publication, Worker deployment and Pages deployment independently; verify health and regression scope after publication.
7. Obtain final human release approval. Until then, the system remains a DEV release candidate at most.

## 5. Production risks and controls

| Risk | Control / residual gate |
|---|---|
| Sheets O(rows) behavior at production volume | D-E1 decision, explicit caps/monitoring or separate indexed-store project; DEV success is not scale approval. |
| Partial writes without ACID | B2 reconciliation/runbook remains available; close B2b before claiming durable review/role-assignment recovery. |
| Destructive retention on real data | D5 + B3, default-disabled flag, two-person control, `legal_hold`, synthetic rehearsal only. |
| Camera/device behavior differs from tests | Physical Android/iOS acceptance remains OPEN. |
| Deployment marker/provenance drift | Record source/version/publication separately; probe health and behavior after each publication. GAS HEAD repair is not silently treated as published. |
| Credential exposure or stale credentials | Environment/profile-only handling, protected Actions secrets when needed, rotation and sanitized evidence. |
| Automation mistaken for business/security approval | Keep transport scope explicit and all human sign-offs OPEN until named approval exists. |

## 6. Sign-off state

| Gate | State | Approver/evidence |
|---|---|---|
| PDPA | **OPEN** | Named legal/PDPA approval required. |
| Security | **OPEN** | Named security approval and applicable ADR ratifications required. |
| UAT / browser / business / device | **OPEN** | Named reviewer and sanitized acceptance evidence required. |
| Production release | **OPEN** | Named release approval after all applicable gates. |

**Release precondition (2026-11-23):** production must use a freshly generated `VEHICLE_AUTH_PEPPER` (the DEV pepper was partially exposed in an assistant screenshot; owner deferred DEV rotation) and enable Firestore backups/PITR before using the editor admin-reset tool (the Sheets backup gate was removed by S1, VC-ADR-029).
