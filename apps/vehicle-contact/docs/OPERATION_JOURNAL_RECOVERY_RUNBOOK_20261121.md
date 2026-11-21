# P6 Vehicle Contact — Operation journal recovery runbook (D-SEQ-05 / D-SEQ-09)

**Date:** 2026-11-21 | **Owner:** SYSTEM_ADMIN (on-call) | **Scope:** DEV/staging synthetic data first; production only under the separate security/PDPA/UAT gate.
**Why this exists:** Google Sheets is not an RDBMS. Multi-step writes have no ACID rollback. A caught exception is compensated in-process, but an **abrupt Apps Script timeout/restart** (6-minute execution limit, quota, deploy) kills the process mid-sequence and the `catch` never runs. This runbook + the automatic reconciliation in `registrationSubmit` close that gap. See [journal recovery evidence](BACKEND_JOURNAL_RECOVERY_EVIDENCE_20261121.md).

## 1. Operation journal states (`vc_operation_journal`)

| Status | Meaning | Action |
|---|---|---|
| `PREPARED` | Intent persisted before business writes; attempt may have died | Reconcile (below). If an idempotency record is `COMPLETED`, the attempt actually succeeded → mark `APPLIED`. |
| `APPLIED` | Attempt committed successfully | None. |
| `ROLLED_BACK` | Caught exception fully compensated in-process | None. |
| `RECOVERY_REQUIRED` | Partial state needs human attention (compensation failed, or quota ambiguous) | Follow §3. |

`detail_json` carries `{operation, requestId, vehicleId, campaignId, idempotencyKey, requestDigest}` and, after reconciliation, `recovery:{requestRemoved, photosRestored, quotaCheck, errors}`.

## 2. Automatic reconciliation (implemented — `registrations.submit`)

On every submit, before creating a new application, `reconcileSubmitTimeout(idemKey)` runs **single-table lookups only (no cross-sheet join)**:

- **Idempotency record `COMPLETED` exists** → the prior attempt committed; a stale `PREPARED` journal is marked `APPLIED` and the cached result is returned (idempotent replay). No duplicate application.
- **Orphan application exists** (a `vc_registration_requests` row with this `idempotency_key` but no `COMPLETED` idempotency) → the prior attempt died uncommitted. The orphan application is removed and its `CLAIMED` photos are restored to `STAGED`, so the retry can proceed. The old journal is marked `RECOVERY_REQUIRED` with `recovery.quotaCheck:'MANUAL'`.
- **Cleanup itself fails** (a compensating write errors) → `OPERATION_RECOVERY_REQUIRED` is returned; do **not** retry blindly — follow §3.
- **No orphan** (timeout before the application row) → nothing to reverse; the retry proceeds. The inert `PREPARED` journal is left for §3.4 (no per-submit cross-table scan, per the latency directive).

**Residual the runbook must handle:** campaign `submitted_count` is incremented as a separate write. State alone cannot prove whether a dead attempt reached that step, so reconciliation does **not** auto-refund quota — it flags `quotaCheck:'MANUAL'`. A retry after a quota-incrementing partial therefore leaves `submitted_count` over by 1 until verified (§3.1).

## 3. Manual recovery procedures

> Inspect journals in the `vc_operation_journal` sheet tab (or via a future admin reconcile op). Always work on a bounded set; never join sheets. Confirm `legal_hold` before any deletion. Destructive steps require two-person approval.

### 3.1 `RECOVERY_REQUIRED` + `quotaCheck:'MANUAL'` (submit partial)
1. Read the campaign row (`vc_campaigns`, `campaign_id` from `detail_json`). Note `submitted_count` (S) and `max_submissions`.
2. Count **valid** applications for that campaign: `vc_registration_requests` rows with `campaign_id` = that campaign whose `idempotency_key` has a `COMPLETED` `vc_idempotency` record. (Do this as two bounded reads + an in-memory key set, not a sheet join.) Call it V.
3. If `S > V`, the excess `S − V` is quota consumed by dead partials. Set `submitted_count = V` via `campaigns` admin update / a guarded sheet edit. If `S == V`, no drift — clear the flag.
4. Mark the journal `ROLLED_BACK` (or `APPLIED` if the application was actually kept) and record the correction in `vc_change_audit`.

### 3.2 Compensation failed (`recovery.errors` non-empty)
1. The orphan application may be partially removed and photos may still be `CLAIMED`. Read `vc_photo_staging` for the `photoId`s in `recovery.photosRestored`; set any stuck `CLAIMED` rows back to `STAGED` (`used_at:''`).
2. Remove any leftover `vc_registration_requests` row for `detail_json.requestId`.
3. Re-run §3.1 for quota. Mark the journal `ROLLED_BACK`; audit the intervention.

### 3.3 `assignRoles` partial (D-SEQ-09 — **no journal, no compensation**)
Failure between removing existing roles and inserting new ones leaves the user with **zero roles** (locked out).
1. Detect: `vc_user_roles` has no `ACTIVE` row for the `user_id`, but `vc_change_audit` shows a `ROLES_CHANGED` intent or an admin reports a failed assignment.
2. Recover: re-issue `users.assignRoles` with the intended role set (it is a full replace, so it is safe to re-run). Confirm `SELF_DEMOTION_DENIED` / `SELF_ROLE_EXPANSION_DENIED` guards still apply.
3. `sessions.revokeUser` already ran or will run on the successful re-assign; the user re-authenticates.

### 3.4 Inert `PREPARED` journal with no application row
A timeout between the journal insert and the application insert. No business state changed. Mark the journal `ROLLED_BACK` and audit. (A future admin reconcile op can sweep these; until then they are inert and harmless.)

### 3.5 `registrationReview` partial (D-SEQ-09 — **no journal, no compensation**)
Failure after inserting `vc_vehicles` but before contacts/photos/QR leaves an **orphan ACTIVE vehicle** and the request still `PENDING_APPROVAL`.
1. Detect: a `vc_vehicles` row whose `vehicle_id` equals a `PENDING_APPROVAL` request's `vehicle_id`, with missing contacts/QR.
2. Recover (choose one, two-person):
   - **Complete:** insert the missing primary contact, the five `vc_vehicle_photos`, and a `vc_qr_tokens` row, then advance the request to `APPROVED` — or
   - **Reverse:** remove the orphan `vc_vehicles` (and any partial contacts/photos/QR for that `vehicle_id`), leave the request `PENDING_APPROVAL`, and re-run `registrations.review` (it re-checks `DUPLICATE_VEHICLE`, so the orphan must be gone first).
3. Audit the intervention. `registrations.review` is **not** idempotent; never re-run it while the orphan vehicle exists.

### 3.6 `executeDeletion` partial (D-SEQ-09 — job-tracked, retry-safe)
Failure mid-deletion marks the job `DELETION_FAILED` with `last_error`. Some rows/photos are already gone.
1. Confirm `legal_hold` is false and two-person approval stands.
2. **Retry `retention.execute`** — it accepts `DELETION_FAILED`, re-trashes Drive photos (idempotent) and removes the remaining rows, then marks `DELETION_COMPLETED`. Change/lookup audits are retained by policy.
3. If retry keeps failing, inspect `last_error`; reconcile remaining `vc_vehicle_*` rows for the `vehicle_id` manually before retrying. Never bypass `allowDestructiveRetention`.

## 4. Invariants
- **No cross-sheet joins.** Bounded single-table reads + in-memory key sets only (owner directive: Sheets ≠ RDBMS, real-world latency).
- **Idempotent recovery.** Re-running a procedure must not double-apply; reconcile from observed state, not assumptions.
- **Two-person + `legal_hold`** for any destructive step. Destructive retention stays behind `allowDestructiveRetention` (default false).
- **Audit every intervention** in `vc_change_audit`.
- **Synthetic rehearsal first.** Validate these procedures on DEV synthetic data before any production use.

## 5. Remaining hardening (follow-up slice B2b)
`registrationReview` and `assignRoles` still write no journal. B2b should add PREPARED-journal + compensation (or an admin `system.reconcile` op that sweeps `PREPARED`/`RECOVERY_REQUIRED` journals) so recovery is durable without manual sheet edits. `executeDeletion` is already job-tracked and retry-safe. This slice (B2) delivers automatic submit reconciliation + injected-failure/restart tests + this runbook.