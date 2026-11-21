# P6 Vehicle Contact — B2 operation-journal reconciliation + recovery evidence

**Date:** 2026-11-21 | **Scope:** GAS backend source + tests + runbook (no contract/DTO/permission/inventory/Worker change; no live GAS push).
**Classification:** SOURCE + SYNTHETIC CI EVIDENCE. Closes PM-plan slice **B2** (D-SEQ-05 / D-SEQ-09). **Merged PR #96** (`main` @ `b2f8a6a`), CI green. Live GAS push batched with B1/B4, awaits next owner `PUSH_VEHICLE_GAS`.

## 1. Bug / gap

Google Sheets has no ACID transactions. `SheetStore.withLock` gives isolation (ScriptLock) + flush, **not atomicity**. Multi-step writes can be interrupted by an abrupt Apps Script timeout/restart (6-min limit, quota, deploy) that kills the process **without running the `catch` block**.

- **D-SEQ-05 (`registrationSubmit`):** a `PREPARED` journal + in-process compensation existed, but a timeout after `PREPARED` left an orphan application + `CLAIMED` photos + possibly incremented quota, with **no automatic reconciliation**. The retry guard simply threw `OPERATION_RECOVERY_REQUIRED` **forever**, permanently blocking that idempotency key.
- **D-SEQ-09 (`assignRoles`, `registrationReview`, `retention.execute`):** multiple writes with **no journal and no compensation**. A mid-sequence failure leaves partial state (lost roles / orphan ACTIVE vehicle / partial deletion) with no recovery path.

## 2. Fix (this slice)

**Automatic, state-driven reconciliation for `registrations.submit`** — `reconcileSubmitTimeout(idemKey)` in [`VehicleOperations.js`](../backend/gas/src/application/use-cases/VehicleOperations.js), called before creating a new application (replaces the permanent-block guard):

- Idempotency `COMPLETED` → prior attempt committed; stale `PREPARED` journal marked `APPLIED`; cached result returned (idempotent replay, no duplicate).
- Orphan application (no `COMPLETED` idempotency) → remove orphan, restore its `CLAIMED` photos to `STAGED`, mark old journal `RECOVERY_REQUIRED` with `recovery.quotaCheck:'MANUAL'`; retry proceeds.
- Compensating write fails → `OPERATION_RECOVERY_REQUIRED` (fail-safe; manual runbook).
- **Join-free + idempotent:** single-table lookups (`vc_registration_requests` by `idempotency_key`, `vc_operation_journal` by `entity_id`, `vc_photo_staging` by `photo_id`); no cross-sheet join, no per-submit journal scan (owner latency directive). No extra hot-path write — it reuses the lookup the old guard already did.

**Honest residual:** campaign `submitted_count` is a separate write; state alone cannot prove a dead attempt incremented it, so quota is **not** auto-refunded — it is flagged `quotaCheck:'MANUAL'` for the [recovery runbook](OPERATION_JOURNAL_RECOVERY_RUNBOOK_20261121.md) (§3.1 derives the correct count from two bounded reads + an in-memory key set).

**D-SEQ-09:** injected-failure tests prove the partial-write gaps; the runbook gives tested manual recovery (re-assign roles; complete-or-reverse the orphan review; retry the job-tracked, retry-safe `executeDeletion`). Durable journaling for `review`/`assignRoles` + an admin reconcile op is deferred to follow-up **B2b** (documented, not silently skipped).

## 3. Files touched

- `src/application/use-cases/VehicleOperations.js` — `reconcileSubmitTimeout` helper; `registrationSubmit` early section (idempotent replay marks journal `APPLIED`; orphan guard → reconcile-then-proceed).
- `tests/acceptance-fixture.mjs` — `setWriteFailAfter(n)` injection (fails the Nth write) for precise partial-failure simulation; existing `setWriteFailure(table)` unchanged.
- `tests/journal-recovery.test.mjs` — **NEW, 7 cases**; wired into `package.json` test script.
- `docs/OPERATION_JOURNAL_RECOVERY_RUNBOOK_20261121.md` — **NEW** recovery runbook.
- No schema, DTO, permission, inventory, count-gate, or Worker change (no new operation/route).

## 4. Proof (synthetic CI, local)

| Gate | Result |
|---|---|
| `node --test tests/journal-recovery.test.mjs` | **7/7 PASS** |
| `npm test` (full GAS backend suite) | **PASS** — exit 0, 0 failures (incl. existing `EDGE-09` compensation + all submit/review/retention tests — no regression) |
| `npm run build` (esbuild layer-mirrored flatten) | **PASS** — 53 `.gs` modules + manifest; no new module |

Cases:
- **RECOVERY-01** timeout after request+photos+quota (no commit): retry reconciles — orphan removed, photos restored then re-claimed, fresh application + `APPLIED` journal, old journal `RECOVERY_REQUIRED`/`quotaCheck:MANUAL`, quota drift (+1) documented for manual verification.
- **RECOVERY-02** timeout after commit (stale `PREPARED` + `COMPLETED` idempotency): replay returns cached result, marks journal `APPLIED`, no duplicate.
- **RECOVERY-03** reconciliation cleanup failure: `OPERATION_RECOVERY_REQUIRED`, errors recorded (fail-safe).
- **RECOVERY-04** abort before any business write: retry proceeds, quota incremented exactly once; inert `PREPARED` journal flagged for runbook.
- **DSEQ09-01** `assignRoles` partial (remove ok, insert fails): roles lost, no journal — gap proven.
- **DSEQ09-02** `registrationReview` partial: orphan ACTIVE vehicle, request still `PENDING_APPROVAL`, no contact/QR — gap proven.
- **DSEQ09-03** `executeDeletion` partial: photos removed, contacts/vehicle remain, job `DELETION_FAILED` + `last_error` (retry-safe) — gap proven.

**Test-method note:** a caught injected failure runs `registrationSubmit`'s compensation (→ `ROLLED_BACK`), which is *not* a timeout. Timeout aftermath is therefore **seeded directly** (PREPARED journal + partial rows, no compensation) to model a process death + restart. `setWriteFailAfter` accounts for the per-call `vc_sessions.last_seen_at` touch write when targeting a specific write in an authenticated op.

## 5. Best practices (recorded for the team)

- **A commit marker beats a counter.** The `COMPLETED` idempotency record is the authoritative commit signal; reconcile from it, not from the journal status alone (which a timeout can leave stale).
- **Derive recovery from observed state, idempotently.** Reverse only what provably exists (orphan row, `CLAIMED` photo); re-running must not double-apply.
- **Don't guess ambiguous side effects — flag them.** Quota increment cannot be proven from state, so flag `MANUAL` rather than silently refund/over-refund. Honest residual + runbook > false certainty.
- **No cross-sheet join, no hot-path scan.** Recovery uses bounded single-table lookups; the inert-journal sweep is deferred to an admin op to keep submit latency flat (Sheets ≠ RDBMS).
- **Fail-safe on failed compensation.** If cleanup cannot complete, surface `OPERATION_RECOVERY_REQUIRED` and stop — never proceed on unknown partial state.
- **Job-tracked destructive ops are retry-safe.** `executeDeletion` records `DELETION_FAILED` + `last_error` and accepts retry; prefer this pattern over unjournaled multi-writes.

## 6. Remaining gates
- **B2b (follow-up):** journal + compensation for `registrationReview`/`assignRoles`, or an admin `system.reconcile` op sweeping `PREPARED`/`RECOVERY_REQUIRED` journals (durable recovery without manual sheet edits).
- **Live GAS push** of B1/B4/B2 batched — awaits owner `PUSH_VEHICLE_GAS`; owner publishes the Web App version.
- Production security/PDPA/UAT and destructive-retention enable (D5) remain separately gated.