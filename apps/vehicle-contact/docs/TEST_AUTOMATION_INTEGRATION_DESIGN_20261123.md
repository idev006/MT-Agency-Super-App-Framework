# P6VC Test Automation + Integration Test Design (GAS + Firestore main engine)

**Doc ID:** P6VC-QA-TEST-DESIGN-001 · **Date:** 2026-11-23 (Asia/Bangkok) · **Status:** **APPROVED — owner "อนุมัติตามที่คุณเสนอ" (chat 2026-11-23, [VC-ADR-024](DECISION_LOG.md))**: gaps G1–G8, slice order G1+G2+G6 → G3 → G7 → G8 → G4+G5, nightly cron 02:00 Asia/Bangkok, prune phrase `PRUNE_SYNTHETIC_SUITE_RESIDUE`. Slice A (G1+G2+G6) implemented in the same slice as this approval record.
**Scope:** synthetic DEV only · **Authority:** [VC-ADR-023](DECISION_LOG.md) (GAS+Firestore main engine, APIs for all actors/use cases, **authorize checked on every API call**), [VC-ADR-022](DECISION_LOG.md) (production runtime = GAS Firestore REST; measure-first, avoid over-engineer), [VC-ADR-019](DECISION_LOG.md) (verification directive: **API OK ≠ data proof — every call confirmed against persisted data**)

## 1. Binding rules (apply to every layer)

1. **Independent read-back:** a write is proven only by reading the persisted record back through an independent path (Node SDK for Firestore; gviz for Sheets). API `ok:true` alone is never evidence.
2. **Synthetic DEV only.** Real-data go-live (#55) BLOCKED (legal/DPO). No real PII in any fixture, report or log.
3. **Secrets never echoed/logged/committed.** SA key outside repo (`~/.p6vc` via gitignored `.env`); CI secrets only where already provisioned. Reports = sanitized counters + field NAMES; `test-results/` reports are gitignored.
4. **Write gates:** live writes require `P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV`; Firestore SDK probes require `P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE`. CI privileged modes are owner-only + main-only + exact confirmation phrase ([p6vc-live-acceptance.yml](../../../.github/workflows/p6vc-live-acceptance.yml)).
5. **Never run the live API suite and the frontend Firestore bridge concurrently.**
6. **Tooling-only changes** (`scripts/`, `tests/`, `.github/workflows/`) do NOT touch the GAS runtime bundle → they do not void live evidence and need no `PUSH_VEHICLE_GAS`. Runtime source changes remain DEFERRED (owner decision) and always require push + publish + full re-verify.
7. **Latency budget is measured, not assumed:** GAS `UrlFetchApp` ≈ 1 s/call × sequential call count; per-request harness timeout 40 s. Quantile method: ascending sort, `floor(q·n)`-th value (0-indexed).

## 2. Layer model + existing inventory (what already runs)

| Layer | What | Where | Trigger | Current evidence |
|---|---|---|---|---|
| **L0 Offline unit/contract** | 57 GAS test files / 224 checks: DTO, session policy, PBKDF2, journal recovery, store-port contract (Sheets = Firestore = in-memory, identical suite), REST gateway vs fake server, dual-write, backfill, round-trip regression (insert=3/update=2/remove=2) | `backend/gas/tests/` | every PR (`validate-p6vc.yml` → `npm run check`) + local | 224/224 EXIT 0 |
| **L1 Offline integration** | FULL real API on in-memory store ([acceptance-fixture.mjs](../backend/gas/tests/acceptance-fixture.mjs)): actor-usecase acceptance, **RBAC matrix 5 roles × 50 ops = 250**, scoped reads, pagination, auth-session, failure injection | `backend/gas/tests/` | every PR + local | green (store-agnostic proof) |
| **L2 Live API integration (GAS runtime)** | `run-live-api-suite.mjs --require-authenticated`: PUBLIC_DIRECT_GAS 11 + WORKER_FAIL_CLOSED 14 + AUTHENTICATED_FULL_INVENTORY 72 (**56/56 ops**, all 5 roles) + cleanup 7 | repo-root `test-results/p6vc-live-api-suite.json` | manual: CI `full-api-suite` (owner phrase `RUN_FULL_API_SUITE`) or local detached launcher | 97/97 @ V52 0.9.3 |
| **L3 Live data proof** | Dual-store audit (Sheets gviz vs Firestore SDK, per-PK type-normalized) — **valid only while dual-write is ON**; Firestore-only direct SDK read-back of suite records: committed [firestore-readback-proof.mjs](../backend/gas/scripts/firestore-readback-proof.mjs) (6 checks, G1 DONE — suite stage `DATA_PROOF` behind `--require-data-proof`) | repo-root `test-results/p6vc-firestore-readback-proof.json` (gitignored) | suite stage (gated) or standalone `--since` | audit 2,464/2,464 PASS (dual-write era); Firestore-only proof 6/6 (evidence §4.4) |
| **L4 Frontend** | vitest 192 (pages/composables/repositories/contracts) + build; live browser E2E all 5 roles via browser-use runbook (#70, 225 read-backs) | `frontend/` | vitest: every PR; browser E2E: manual runbook | FE 192/192; #70 DONE |
| **L5 Gateway** | Worker contract 31 (fail-closed, origin, secret boundary) + live WORKER_FAIL_CLOSED 14 | `tools/p6vc-api-test-console/` | every PR + live suite | green |
| **L6 Node bridge pipeline** | `firestore-live-api-suite.mjs` 72/72 + 302 SDK read-backs — proves Firestore DEV + adapter logic, **NOT the GAS runtime** (different runtime, kept as regression) | `backend/gas/scripts/` | local gated | #69 DONE |

**Authorize enforcement (VC-ADR-023) is tested at three layers already:** L1 full 250-cell RBAC matrix offline; L0 `api-inventory`/`api-wiring` guards (startup throws `INCOMPLETE_API_DISPATCH` if any op lacks a permission mapping); L2 live suite exercises role-scoped happy paths + Worker fail-closed. **Gap: live negative-authorization probes → G4.**

## 3. Gap register (design decisions)

### G1 — Firestore-only data proof as a committed suite stage (PRIORITY 1 — DONE, Slice A)
**Problem:** after dual-write cleared (2026-11-23), the dual-store audit is no longer valid (Sheets stopped mirroring). The independent read-back exists only as a gitignored scratch script.
**Design:** promote to `scripts/firestore-readback-proof.mjs` (gated, sanitized): locate the suite's synthetic records by run marker (`make=SYNTHETIC`, `model=AUTOMATED`, plate `TST########`, `created_at >= suite.startedAt`), then 6 checks — vehicle persisted (version, owner, timestamps), registration APPROVED (+ idempotency key), contact updated, photos=5, post-cleanup lifecycle status, 0 OPEN divergences. Wire into `run-live-api-suite.mjs` as stage **DATA_PROOF** behind `--require-data-proof`; without the SDK gate/creds the stage reports `SKIPPED_DATA_PROOF` (honest, never silent PASS). CI `full-api-suite` keeps working (no SA secret in CI → SKIPPED with reason); local/owner runs get the full proof.
**Acceptance:** stage PASS recorded in the suite report; report contains counters + field NAMES only; scratch script retired.
**Cost:** ~6 SDK reads ≈ 2–4 s. No runtime change.

### G2 — Latency budget report + regression guard (PRIORITY 2 — DONE, Slice A)
**Problem:** latency is a production-readiness blocker (VC-ADR-022) but no automated guard exists; regressions would surface only as 40 s timeouts.
**Design:** suite summary gains a `latency` block computed from regression `durationMs` (method §1.7): p50/p90/p95/max + slowest 5 ops + per-op ceiling check (harness timeout 40 s). Budgets are **recorded measurements, not invented targets**: baseline dual-write ON p50 9,726 / p90 20,056 / p95 23,000 / max 36,737 ms; dual-write OFF baseline = the first G1-era run (this PR). Guard = WARN when p95 exceeds the recorded baseline by >25% (measure-first; no hard FAIL until owner sets a production budget).
**Acceptance:** every suite report carries the latency block + baseline comparison; WARN visible in CI step summary.

### G3 — Nightly safe-public smoke (PRIORITY 2)
**Problem:** live acceptance is manual-only; a broken deployment or flag drift can sit unnoticed for days.
**Design:** new scheduled workflow (cron nightly, e.g. 02:00 Asia/Bangkok) running ONLY `smoke-api.mjs` (public, no secrets, no writes) + health assertion: `status=ready`, `backendVersion` matches the repo's expected-version marker, `persistence.engine=firestore`. On mismatch → workflow fails (GitHub notification). **No authenticated calls, no writes, no SA key** — safe to schedule without owner phrases. Expected-version marker lives in a committed config (updated by the publish slice, not by the smoke job).
**Acceptance:** nightly run green on stable live; intentional flag/version drift produces a failed run.

### G4 — Live negative-authorization sample stage (PRIORITY 3)
**Problem:** the full 250-cell RBAC matrix runs offline only; live runtime authorization (session + permission on every call, VC-ADR-023) has no dedicated negative probes.
**Design:** bounded sample, NOT the full matrix (latency: ~1 s/call × cells). New stage `RBAC_LIVE_SAMPLE`: for each of the 5 roles, 2 probes against ops outside its permission set → expect `FORBIDDEN`; plus 1 no-token probe against a protected op → `UNAUTHENTICATED`; plus 1 expired/invalid-token probe → `SESSION_EXPIRED`/`UNAUTHENTICATED`. ~12 calls ≈ 1–2 min. Full matrix stays L1 offline (cheap, exhaustive).
**Acceptance:** 12/12 denial probes PASS; any allow = FAIL (security signal, references rollback runbook).

### G5 — Synthetic residue lifecycle (PRIORITY 3)
**Problem:** suite cleanup = disable/suspend, NOT delete → every run grows the synthetic baseline (2,464 → +N per run); counts drift and storage accumulates.
**Design:** two parts: (a) suite report records its **run marker** (plate/idempotency keys created) — already derivable; (b) gated prune script `scripts/prune-suite-residue.mjs` deletes ONLY records matching the run marker **after** DATA_PROOF PASS, with independent delete read-back (residue=0), behind the existing dev-write gate + a new exact phrase `PRUNE_SYNTHETIC_SUITE_RESIDUE`. Alternative for full baseline reset: existing `npm run reset:dev` (Mode A, already gated). Never prune identity/config/reference tables.
**Acceptance:** post-prune count returns to the pre-suite baseline; delete read-back proves 0 residue; owner gate honored.

### G6 — Post-publish verify chain (PRIORITY 2 — DONE, Slice A)
**Problem:** after each publish the verify steps (health → smoke → full suite → data proof → latency) are run ad-hoc by the Tech Lead.
**Design:** one committed command `scripts/verify-live-publish.mjs` chaining: health assertion (version + persistence flags) → public smoke → detached full suite (never foreground >10 min) → DATA_PROOF → latency report → sanitized summary. Used after every `clasp update-deployment`; output is the evidence block pasted into the docs slice. No new logic — assembly of G1/G2 + existing stages.
**Acceptance:** single command reproduces the full post-publish evidence chain; fails closed at the first broken link.

### G7 — Live concurrency + idempotency proof (NEW, owner-approved; PRIORITY after G3)
**Problem:** the highest-value missing dimension for a multi-user system. Firestore ACID transactions + the operation journal are proven offline (L0/L1) and via the Node bridge (L6) but have **no live proof on the GAS runtime** — the exact property that justified Firestore over Sheets.
**Design:** bounded (~10 calls), gated like the owner-dev suite (`RUN_SYNTHETIC_OWNER_DEV` + test credentials), synthetic records only:
1. **Parallel `registrations.submit` with the SAME idempotency payload** (2–3 concurrent calls) → exactly **1** persisted registration (independent SDK read-back by `idempotency_key`), losers get the idempotent replay/conflict response — never a duplicate row.
2. **Parallel review/approve of the same request** (2 concurrent calls) → journal/transaction must prevent a duplicate QR issuance; read-back proves exactly 1 QR token row.
3. Cleanup via the same disable/suspend path as the main suite; run marker recorded for G5 prune.
**Acceptance:** persisted-count proof (not API responses) for both races; any duplicate = FAIL with the journal evidence attached. Never run concurrently with the main suite or the FE bridge (§1.5).
**Cost:** ~10 live calls ≈ 1–2 min. No runtime change.

### G8 — Frontend accessibility automated audit (NEW, owner-approved; PRIORITY after G7)
**Problem:** accessibility has no automation at all; #70 browser E2E covered function/RBAC, not a11y.
**Design:** axe-core audit injected via browser-use (`evaluate_script`) on every page of all 5 roles (same page inventory as the #70 runbook), plus the public campaign/registration pages. Committed runbook + a report script that aggregates axe results into a sanitized JSON (rule IDs + counts + selectors, no PII). WCAG 2.1 AA target; violations triaged: fix-now (tooling/FE-test only) vs FE runtime fixes (owner-gated — runtime source changes void live evidence, §1.6).
**Acceptance:** audit runs across all role pages; report committed as evidence doc; zero untriaged serious/critical violations (fixes that touch FE runtime go through the owner gate).

## 4. Automation trigger matrix (target state)

| Trigger | Layers | Gates |
|---|---|---|
| Every PR | L0 + L1 + L4 vitest + L5 contract + SSOT validators + artifact guard | none (existing `validate-p6vc.yml`) |
| Nightly cron **02:00 Asia/Bangkok** (owner-approved) | L2 public smoke + health/flag assertion (G3) | none — public only |
| After every publish | G6 chain: health → smoke → L2 full → L3 DATA_PROOF → G2 latency | local `.env` gates; Tech Lead executes |
| Manual owner CI dispatch | L2 full (+ L3 SKIPPED_DATA_PROOF in CI until SA secret provisioned — owner gate) | owner-only + main-only + `RUN_FULL_API_SUITE` |
| Manual gated (after publish / on demand) | G7 live concurrency + idempotency proof | `RUN_SYNTHETIC_OWNER_DEV` + test creds; never concurrent with suite/bridge |
| Weekly / pre-release | L4 browser E2E runbook (all 5 roles) + **G8 axe-core a11y audit** + L6 Node pipeline regression | browser-use owner session; local gates |

## 5. Non-goals (avoid over-engineer, VC-ADR-022)

- **No Firestore emulator layer** — L0 fake REST server + L6 real DEV pipeline already cover both sides; emulator adds infra weight without new signal.
- **No full Playwright FE E2E infrastructure now** — vitest contracts + browser-use runbook cover FE; revisit only if a FE bug escapes both.
- **No production Firestore provisioning / SA-key rotation / CI SA secret** — owner gates (VC-ADR-022 item 4); G1 CI stage stays SKIPPED until then.
- **No real-data tests** — #55 BLOCKED.
- **No runtime source changes** in these slices — tooling only (§1.6).
- **No load/stress test** (owner-approved deferral): GAS quota limits + ~1 s/call mean a load run risks quota exhaustion for little signal in synthetic DEV; revisit at the production-runtime decision (VC-ADR-022).
- **No live recovery drill for now**: offline journal-recovery tests already cover the logic; revisit after G7 if the owner wants it.
- **Device/QR acceptance + PDPA cannot be automated** — owner-personal gates (#55, E3).

## 6. Implementation order (OWNER-APPROVED, VC-ADR-024)

| Slice | Scope | Status |
|---|---|---|
| **A** | **G1 + G2 + G6** — committed data-proof stage + latency guard + verify chain (one PR, tooling-only) | **DONE (this slice)** |
| **B** | **G3** — nightly public-smoke cron 02:00 Asia/Bangkok + expected-version assertion | pending |
| **C** | **G7** — live concurrency + idempotency proof (bounded ~10 calls, gated) | pending |
| **D** | **G8** — FE axe-core a11y audit via browser-use (all 5 roles' pages) + runbook | pending |
| **E** | **G4 + G5** — live RBAC negative sample + gated residue prune (`PRUNE_SYNTHETIC_SUITE_RESIDUE`) | pending |

Each slice: offline checks green → PR → CI green → merge → evidence doc update (SSOT). Every bug found during implementation is recorded as bug + solution + best practice in the evidence doc (owner directive).

## 7. Owner gates / actions

- ~~G3 nightly schedule time + G5 prune phrase~~ — **APPROVED 2026-11-23 (VC-ADR-024): 02:00 Asia/Bangkok; `PRUNE_SYNTHETIC_SUITE_RESIDUE`.**
- CI SA secret for L3-in-CI: deferred with production provisioning (VC-ADR-022).
- Production latency budget (turns G2 WARN into FAIL): owner decision after dual-write-OFF measurements (measured OFF: p50 8,382 / p95 22,374 ms — evidence §4.4).
- G8 findings that require FE runtime fixes: owner gate (§1.6 — runtime changes void live evidence).
- #55 real-data gate, ratifications (D3/D5/B3, VC-ADR-014/015/017, E3, QR device): unchanged, owner-personal.