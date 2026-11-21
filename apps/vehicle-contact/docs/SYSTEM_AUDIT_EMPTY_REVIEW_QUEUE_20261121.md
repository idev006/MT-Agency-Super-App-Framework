# System audit — empty registration-review queue (correct-empty, not a bug)

**Date:** 2026-11-21 (Asia/Bangkok)
**Trigger:** Owner opened the Registration Review screen (System Admin · Registration Reviewer, via Cloudflare, session ready) and saw **"ไม่มีคำขอลงทะเบียนที่รอตรวจสอบ"** (no pending registrations). Owner asked why the list is empty and requested a full-system audit.
**Verdict:** **CORRECT-EMPTY.** Every registration request in the live datastore is already `APPROVED`; there is genuinely nothing pending. The read path, permissions, data integrity and system health are all verified. **No bug found.**

## Live evidence (read-only, owner Google session)

Read `vc_registration_requests` directly from the production spreadsheet via the gviz CSV export (owner session; no writes):

```json
{ "totalDataRows": 14, "tally": { "APPROVED": 14 }, "nonApproved": [] }
```

- **14 / 14 rows `APPROVED`; 0 `PENDING_APPROVAL`.** The review queue filters on `status === 'PENDING_APPROVAL'`, so an empty list is the correct result.
- Stored values are clean: `reviewed_at` renders as proper ISO-8601 (e.g. `2026-11-18T02:51:11.937Z`), `status` as plain text, `application_json` intact — confirming the [number-format repair](GAS_NUMBERFORMAT_DISPLAY_CORRUPTION_INCIDENT_20261121.md) touched **display formats only, never values**.

### Why no pending requests remain

The synthetic approval E2E (A2) approved the 8 pending requests `ฑฆ9903`–`ฑฆ9910`; `ฑฆ9901`/`9902` were already `APPROVED` pre-fix (see [LIVE_DEV_E2E_EVIDENCE](LIVE_DEV_E2E_EVIDENCE_20261121.md), pre-run ground truth: 8 PENDING + 2 APPROVED). Additional earlier synthetic runs account for the 14 total. All are now approved → the pending queue is legitimately empty. The campaign quota (10/10) is also consumed, so no new submissions exist either.

## Read-path verification (end-to-end)

| Layer | Location | Finding |
| --- | --- | --- |
| GAS filter | `VehicleOperations.js` `registrationPending` → `store.list('vc_registration_requests',{status:'PENDING_APPROVAL'})` | Exact-match on stored status value; reads `getValues()`, **not** display format → unaffected by the format incident |
| GAS permission | `VehicleApi.js` `registrations.listPending` → `vehicle.registration.approve` | Owner holds System Admin + Registration Reviewer → authorized (screen loaded, not a permission error) |
| Worker | allowlist `registrations.listPending` + paginated envelope | Edge fail-closed suite confirms allowlist/DTO/session enforcement |
| Frontend | `gas-registration-review-repository.js` `listPending` → `callPaginatedOperation('registrations.listPending')` → `mapPending` | Correct op + contract mapping; empty items → empty-state banner |
| Display logic | `frontend/tests/registration-review.test.js` | Unit tests prove pending items render when present (FE suite green) |

## System-wide health (credential-free, live)

- GAS Web App **v47** `/exec` health → `status:ready`, `backendVersion:0.9.0`.
- Worker edge fail-closed `verify-live-worker-failclosed.mjs` → **14/14 PASS** (origin/allowlist/session/DTO/size/method/version denials + public health liveness through the gateway).
- GAS suite **134/134**; frontend + Worker + SSOT CI green on `main` (`f0ee90f`).
- All 25 schema sheets format-conforming (`totalMismatched:0`, idempotent) after the number-format repair.

## Best practice (team SSOT): distinguish correct-empty from broken-empty

1. **An empty list is a hypothesis, not a verdict.** Before assuming a bug, read the **live source data** and tally the filter field. Here `status` was 14/14 `APPROVED` → correct-empty.
2. **Verify the filter reads values, not display.** GAS queries use `getValues()`; a display-format defect cannot change query results. This isolates format incidents from read-path bugs.
3. **Prove the positive path separately.** Empty-state correctness needs two proofs: (a) live data has no matching rows (done), and (b) the UI renders rows when they exist (unit tests). A **live positive control** (create a pending row → see it appear) is the strongest proof but requires write credentials.
4. **Audit credential-free first.** Health + edge fail-closed + full test suites give a system-wide health snapshot without secrets; reserve authenticated probes for the owner-gated `.env`.

## Residual / owner gate (positive control)

To **see the queue populate live** (full reassurance), create a fresh synthetic `PENDING_APPROVAL` request and confirm it appears, then approve/reject it. This requires:
- the gitignored DEV `.env` credentials (or one-phrase authorization to bootstrap a DEV test admin), **and**
- a new campaign (the current campaign quota 10/10 is consumed).

This is the only audit step not executable credential-free. It is a verification convenience, not a defect — the empty queue is already proven correct from live data + code + tests.