# P6 Vehicle Contact — Project Management / Delivery Execution Plan

**Document:** P6VC-PM-PLAN-001 | **Date:** 2026-11-21 | **Baseline:** `main` @ `bd60a62`, Backend `0.9.0`
**Status:** ACTIVE EXECUTION PLAN (SSOT). Companion to [Full role × use-case plan](FULL_ROLE_USECASE_IMPLEMENTATION_PLAN_20261121.md) (gap analysis) and [Code map](CODE_MAP_20261121.md) (structure). Resume point: [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md).

## 1. Objective & definition of done

**Objective:** deliver a backend + API + frontend that is complete for all 5 roles and all 20 use cases, **live-verified**, hardened, and production-gated.

**"Done" is NOT source-complete.** A workstream is done only when:
1. Source + contract + tests merged to `main` (CI green).
2. Deployed (GAS push gated on owner `PUSH_VEHICLE_GAS`; publication owner action; Worker assistant-deployed).
3. **Live-proven** through the Worker (health marker + functional/authenticated probe), evidence doc linked to SHA.
4. Business/security decisions ratified by a human where required (PDPA, destructive retention, permission policy).

## 2. Current state (honest baseline)

| Dimension | State |
|---|---|
| Operations | **55/55** source-complete (54 DTO + health), 20 UCs, 5 roles |
| CI | RBAC 245 checks, SSOT 55/55, full suite, Worker 28/28 — **green** |
| Live | 0.9.0 **functionally live in V37**; marker-fix **V38 pushed, publication pending** |
| Live authenticated E2E | **NOT done** — awaits owner transient DEV credential; traceability all `PENDING_REAL_GAS` |
| Business completeness | gaps open: D-SEQ-05/06/08/09/11, G1 anonymous claim, G5 Google OIDC |
| Frontend | several role pages NOT_WIRED (G2/G3/G4 FE, `my-vehicles`) |

## 3. Workstreams & WBS

Owner-gate legend: 🔑 = needs owner action/credential/decision; 🤖 = assistant autonomous (source→CI→merge→Worker).

### WS-A — Live verification (close the proof gap) — 🔑
| ID | Slice | Depends | Gate | DoD |
|---|---|---|---|---|
| A1 | Publish V38 + probe health = `0.9.0` | — | 🔑 publish | health marker verified via Worker |
| A2 | Approval E2E: repair dirty 9901/9902 + approve 8 → **10/10** + negatives (`INVALID_REQUEST_STATE`, `PHOTO_NOT_FOUND`) | A1 | 🔑 DEV credential | evidence doc + PR + #61 comment; `.tmp/` scratch deleted |
| A3 | Live authenticated E2E of 3 scoped ops (`vehicles.listMine`, `changes.listMine`, `retention.listExecutable`) + RBAC negatives | A1 | 🔑 DEV credential + owner/worker accounts | `run-live-owner-dev-regression.mjs` coverage 55/55 PASS |

### WS-B — Backend hardening (production-safety gaps) — 🤖 (GAS push batched 🔑)
| ID | Slice | Ref | Depends | DoD |
|---|---|---|---|---|
| **B1** | **Org ancestor cycle check** + negative tests | D-SEQ-08 | — | cycle rejected `INVALID_ORG_PARENT`; bounded single-table walk; tests green; evidence + PR |
| B2 | Partial-write / deletion **reconciliation + recovery** runbook + failure/restart tests | D-SEQ-05/09 | — | injected-failure tests; durable recovery or documented manual runbook |
| B3 | Retention **scheduler / notification** + status mapping | D-SEQ-06 | 🔑 business mapping approval | owner-approved mapping; scheduler tests |
| B4 | Login **constant-work negative path** (timing side-channel) | D-SEQ-11 | — | unknown-user path does same hash work; timing test |

### WS-C — Frontend wiring (use-case completeness) — 🤖
| ID | Slice | Ref | Depends | DoD |
|---|---|---|---|---|
| C1 | REGADMIN **change-approval** screen (list → delta diff → APPROVE/REJECT) | G2 | A2 | route+menu gated `vehicle.change.approve`; FE tests + evidence |
| C2 | Unified **vehicle detail read** (contacts/photos/history) | G3 read | A2 | STAFF/REGADMIN read; a11y/mobile evidence |
| C3 | **Vehicle maintenance edit** (update/link owner/contact/photo replace/cancel) | G3 edit | C2 | `expectedVersion` conflict UX; REGADMIN gated |
| C4 | OWNER **`my-vehicles`** (list → submit change → track) | G1 FE / 2B | B1+A3 | server-scoped reads wired; owner journey E2E |
| C5 | RETENTION_WORKER **execution console** (list executable → execute → status/retry) | G4 FE / 3B | D5+B3 | gated destructive UX; two-person; legal_hold |

### WS-D — Decisions & security ratification — 🔑
| ID | Decision | Ref | Recommended default |
|---|---|---|---|
| D-R1 | Ratify `vehicle.own.read` (OWNER scoped read) | VC-ADR-014 | approve least-privilege |
| D-R2 | Ratify worker-scoped `retention.listExecutable` | VC-ADR-015 | approve (no `retention.read` to worker) |
| D3 | Phase priority / sequencing | plan §6 | A → B1/B2/B4 → C1 → C4 → C5 |
| D4 | Google identity timing + configure `VEHICLE_GOOGLE_CLIENT_ID` | G5 | defer to Phase 4; prefer local JWT verification |
| D5 | Destructive-retention enable mechanism + runbook | G4 / 3C | flag-gated, two-person, synthetic rehearsal only |

### WS-E — Production readiness — 🤖 plan / 🔑 approval
| ID | Slice | DoD |
|---|---|---|
| E1 | Indexed datastore plan (Sheets O(rows) = DEV-scale, no-join directive) | migration design doc + owner decision |
| E2 | Cross-role authorization regression + Worker fail-closed probes | every role × op matrix; Origin/allowlist negatives |
| E3 | PDPA / security / UAT / release gates | human sign-offs (separate, open) |

## 4. Milestones & critical path

| Milestone | Criteria | Unlocks |
|---|---|---|
| **M0 — Primary journey live-verified** | A1 + A2 | epic #61 acceptance; build-on-top confidence |
| **M1 — Backend hardened + 0.9.0 proven** | B1 + B2 + B4 + A3 | safe foundation for FE |
| **M2 — REGADMIN + OWNER FE complete** | C1 + C2 + C3 + C4 | operational + owner journeys |
| **M3 — Worker execution gated + rehearsed** | C5 + D5 + B3 | destructive retention (synthetic only) |
| **M4 — Production readiness** | E1 + E2 + E3 + D4 | release candidacy |

**Critical path:** ~~A2 (🔑 credential)~~ **DONE — live 10/10** against V37 (functional 0.9.0). **M0 now only waits on A1** (🔑 owner publish V38 → health reads 0.9.0). **M1** has B1 ✅ + B4 ✅ + A3 ✅; only **B2** remains. B1/B4 were independent and landed in parallel.

## 5. Execution rules (every slice)

- Small slice contract: **code + DTO/permission/inventory/count gate (if op changes) + Worker allowlist (if op changes) + tests + evidence doc + DECISION_LOG (if policy) + PR**.
- 🤖 assistant: implement → CI green → merge → Worker redeploy (if allowlist changed).
- 🔑 GAS source push: **only after owner types `PUSH_VEHICLE_GAS`** (per-push, not carry-over). Batch B-slices into one push where possible.
- 🔑 Web App publication: **owner manual**; assistant verifies by health + functional probe.
- 🔑 credentials: transient DEV via env `P6VC_ADMIN_USER`/`P6VC_ADMIN_PASS` only — **never** persisted to repo/files/logs/docs/issues.
- Sheets: single bounded snapshot, **no cross-sheet join**; text-preserving writes; fakes emulate USER_ENTERED coercion.
- Security invariants: server-side identity/ownership; two-person retention; `legal_hold`; self-demotion/expansion guards; default-deny.

## 6. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Live proof skipped → "source-complete" mistaken for done | high | M0 gate mandatory before FE build-on-top |
| Partial Sheets writes / GAS timeout leave inconsistent state | high | B2 reconciliation + failure tests before destructive enable |
| Destructive retention on real data | critical | D5 gate, synthetic rehearsal only, two-person, legal_hold |
| Sheets O(rows) scan at production volume | high | E1 indexed store plan; bounded snapshots now |
| Permission policy drift / client-supplied identity | critical | immutable ROLE_PERMISSIONS, RBAC matrix, server-side filters |
| Marker drift (health ≠ deployed code) | medium | contract guard `backendVersion === package.json` (added #91) |
| Credential leakage | critical | env-only transient creds; never persisted; scratch deleted |

## 7. Tracking

- Tasks tracked in-session (TaskCreate/Update); each slice → evidence doc + PR + issue comment.
- Decisions → [DECISION_LOG.md](DECISION_LOG.md). Resume → [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md).
- This plan is the PM SSOT; update slice status here as work lands.

## 8. Slice status board

| Slice | Status | Evidence / PR |
|---|---|---|
| A1 | 🔑 WAITING owner publish V38 | source Version 38 pushed (run 44878044190); V37 already functionally 0.9.0, health label stale |
| A2 | ✅ LIVE PASS **10/10** + negatives | [Live DEV E2E evidence](LIVE_DEV_E2E_EVIDENCE_20261121.md) — 8 approved + 2 pre-fix, lookup+QR MATCH, `INVALID_REQUEST_STATE`/`PHOTO_NOT_FOUND` |
| A3 | ✅ LIVE PASS **70/70**, **55/55** ops | [Live DEV E2E evidence](LIVE_DEV_E2E_EVIDENCE_20261121.md) — all 5 roles, 3 scoped ops + FORBIDDEN negatives, cleanup PASS |
| B1 | ✅ MERGED (#93) | [Org cycle evidence](BACKEND_ORG_CYCLE_CHECK_EVIDENCE_20261121.md) — 7/7 |
| B2 | ⬜ TODO (next autonomous slice) | — |
| B3 | 🔑 WAITING business mapping | — |
| B4 | ✅ MERGED (#94) | [Login constant-work evidence](BACKEND_LOGIN_CONSTANT_WORK_EVIDENCE_20261121.md) — 5/5 + suite 123/123 |
| C1–C5 | ⬜ TODO (after M0) | — |
| D-R1/D-R2/D3/D4/D5 | 🔑 WAITING owner | VC-ADR-014/015 recorded |
| E1–E3 | ⬜ TODO | — |