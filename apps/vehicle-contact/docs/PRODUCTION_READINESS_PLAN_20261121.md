# P6 Vehicle Contact — 48-Hour Production Readiness Plan

**Document:** P6VC-PROD-PLAN-001 | **Date:** 2026-11-21 | **Baseline:** `main` @ `647c463`, Backend source `0.9.0`, live Web App **V39** (health `0.9.0`)
**Status:** ACTIVE — compressed production push. Companion to [PM execution plan](PROJECT_MANAGEMENT_PLAN_20261121.md) (WBS SSOT) and [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md) (resume).
**Owner directive (2026-11-21):** production-ready within **48 hours**; DEV credentials may be stored in a **gitignored** local file; do not waste time.

## 1. Definition of "production-ready" (honest)

A release candidate is production-ready only when ALL of:
1. **Functional completeness live:** 5 roles × 20 use cases wired end-to-end (FE C1–C5) and live-verified through the Worker.
2. **Hardening live:** B1 (org cycle) + B4 (login constant-work) + B2 (submit reconciliation) **pushed, published, and probed live** — not just merged.
3. **Authorization proven:** E2 cross-role × operation matrix + Worker fail-closed (Origin/allowlist/public-op) negatives green live.
4. **Data-scale decision ratified:** E1 — Sheets is O(rows) DEV-scale; owner accepts bounded-volume initial production OR approves an indexed-store migration.
5. **Human sign-offs (cannot be automated):** PDPA / security / UAT / release approval (E3); destructive-retention enable (D5) with synthetic rehearsal; decisions D3–D5 + VC-ADR-014/015 ratification.

**Engineering can reach release-candidate in 48h. Items 4–5 are human/owner gates — they set the real critical path.** This plan parallelizes everything automatable so owner decisions are the only wait.

## 2. Current truth (verified 2026-11-21)

| Fact | State |
|---|---|
| `system.health` via Worker | **`0.9.0`, ready** — A1 DONE, **M0 CLOSED** (A1+A2) |
| Live GAS source provenance | last push `3646e39` (PR #91 marker fix) — **predates B1/B4/B2** → hardening **NOT live** |
| Backend source | B1 #93 + B4 #94 + B2 #96 merged; full suite + build green |
| Live E2E | A2 10/10 + A3 70/70 (55/55 ops) PASS (against functional 0.9.0) |
| Frontend | C1–C5 NOT_WIRED (REGADMIN change-approval, unified detail, maintenance edit, OWNER my-vehicles, WORKER console) |
| Credentials | gitignored `.env` + `scripts/load-env.mjs` auto-loader wired into both live runners; **3 secret blanks await owner fill-once** |

## 3. Parallel lanes

### Lane A — Assistant autonomous (no owner gate)
| ID | Work | Output |
|---|---|---|
| A-FE1 | **C1** REGADMIN change-approval screen (list → delta diff → APPROVE/REJECT), gated `vehicle.change.approve` | route+menu+FE tests+evidence |
| A-FE2 | **C2** unified vehicle detail read (contacts/photos/history), STAFF/REGADMIN | a11y/mobile evidence |
| A-FE3 | **C3** vehicle maintenance edit (update/link/contact/photo replace/cancel), `expectedVersion` conflict UX | REGADMIN-gated |
| A-FE4 | **C4** OWNER `my-vehicles` (list → submit change → track), server-scoped reads | owner journey E2E |
| A-FE5 | **C5** WORKER execution console (list executable → execute → status/retry), gated destructive UX | two-person + legal_hold |
| A-E2 | Cross-role authorization regression + Worker fail-closed probes (synthetic CI + live) | role×op matrix evidence |
| A-E1 | Indexed-datastore migration **design doc** (Sheets O(rows) analysis, options, recommendation) | design + owner decision packet |
| A-E3 | PDPA / security / UAT / release **gate checklist + evidence pack** (prepared, NOT self-approved) | sign-off-ready dossier |
| A-REL | Release-candidate build + Pages deploy + Worker redeploy (allowlist if ops change) | deployed RC |

### Lane B — Owner gates (the real critical path)
| ID | Action | Why it blocks production |
|---|---|---|
| B-CRED | Fill 3 secret blanks in gitignored `.env` **once** (`P6VC_ADMIN_PASS`, `P6VC_TEST_USERNAME`, `P6VC_TEST_PASSWORD`) | unblocks all live authenticated probes/runners |
| B-PUSH | Type **`PUSH_VEHICLE_GAS`** → assistant pushes `main` @ `647c463` → **owner publishes new version** | makes B1/B4/B2 hardening LIVE (security requirement) |
| B-D3 | Ratify phase priority / sequencing | locks scope |
| B-D4 | Google identity timing + `VEHICLE_GOOGLE_CLIENT_ID` (recommend defer; local auth suffices for launch) | G5 |
| B-D5 | Destructive-retention enable mechanism + runbook (flag-gated, two-person, synthetic rehearsal only) | G4 / 3C |
| B-ADR | Ratify **VC-ADR-014/015** (OWNER scoped read, worker-scoped retention) | permission policy |
| B-B3 | Approve retention scheduler/notification **business mapping** | D-SEQ-06 |
| B-E1 | Decide Sheets bounded-volume initial production **vs** indexed-store migration | data-scale |
| B-E3 | **PDPA / security / UAT / release sign-offs** (human/legal) | compliance — cannot be automated |

## 4. Compressed 48h schedule

| Window | Assistant (Lane A) | Owner (Lane B) |
|---|---|---|
| **0–6h** | C1 + C2 FE wiring + tests; E2 synthetic matrix; E1 design doc | B-CRED fill `.env`; B-PUSH `PUSH_VEHICLE_GAS` + publish; B-ADR ratify |
| **6–18h** | C3 + C4 FE; live hardening probe (B1/B4/B2) after publish; E2 live fail-closed | B-D3/D4/D5 decisions; B-B3 mapping; review E1 design |
| **18–30h** | C5 FE (gated destructive UX); A-E3 sign-off dossier; RC build + Pages + Worker | B-E1 data-scale decision; begin PDPA/security/UAT review |
| **30–42h** | Full live regression (55/55) on RC; synthetic destructive-retention rehearsal; fix-forward | B-E3 sign-offs; D5 enable decision after rehearsal |
| **42–48h** | Release-candidate freeze; evidence pack final; production deploy (owner-gated) | **Final release approval** |

**Critical path:** B-PUSH (hardening live) → live probes → C1–C5 FE → E2 live → B-E3 sign-offs → release. **B-E3 (PDPA/UAT/security) is the longest human pole — start it at hour 0, not hour 30.**

## 5. Production risk register (48h-specific)

| Risk | Impact | Mitigation |
|---|---|---|
| Live V39 lacks B1/B4/B2 (timing oracle open) | **critical** | B-PUSH re-push + publish + probe BEFORE release |
| Sheets O(rows) at production volume | high | B-E1 decision; bounded snapshots now; migration design ready |
| PDPA/UAT/security sign-off not achievable in 48h | **critical** | start review hour 0; dossier prepared; owner owns legal approval |
| Destructive retention on real data | critical | D5 flag-gated, two-person, legal_hold, **synthetic rehearsal only** |
| FE C1–C5 scope too large for 48h | high | slice small; C1/C4 first (operational+owner); C5 gated last |
| Credential leakage via `.env` | critical | `.env` gitignored (verified `git check-ignore`); never committed/logged; loader skips blanks |
| Marker drift (health ≠ code) | medium | contract guard `backendVersion === package.json` (#91); probe after each publish |

## 6. Credential handling (owner-authorized change)

- Owner authorized (2026-11-21) storing DEV credentials in a **gitignored local file**: repo-root `.env` (covered by `.gitignore` `.env` / `.env.*`).
- `scripts/load-env.mjs` auto-loads `.env` into `process.env` (existing env wins; blanks skipped); wired into `run-live-approval-e2e.mjs` + `run-live-owner-dev-regression.mjs`.
- **Verified:** `git check-ignore .env` → ignored; `.env` absent from `git status`. **Never commit, push, log, or paste `.env` contents.** Reports remain sanitized (`secretsExposed:false`).
- Non-secret endpoints/config pre-filled; owner fills 3 secret blanks once.

## 7. Tracking

- Slice status → [PM plan board](PROJECT_MANAGEMENT_PLAN_20261121.md). Resume → [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md). Decisions → [DECISION_LOG.md](DECISION_LOG.md).
- Each Lane-A slice → code + tests + evidence doc + PR (CI green) + merge. Lane-B gates tracked here; assistant reports owner action list every turn.