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

## Positive control — EXECUTED 2026-11-22 (residual gate closed)

Owner re-reported the same empty queue on 2026-11-22 (Registration Review, SYSTEM_ADMIN + REGISTRATION_ADMIN, **direct GAS**, Service v0.9.2). Re-verified against live data and then **executed the positive control** under the owner-authorized synthetic DEV write guard (`P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV`, gitignored `.env`). No real data, no `ENFORCED`, no destructive retention.

**Baseline re-read (read-only gviz, owner session):** `vc_registration_requests` = **37 rows, 37 `APPROVED`, 0 `PENDING_APPROVAL`** → correct-empty again (the full live suite approves its synthetic submissions; seeded fixtures are `APPROVED`).

**Positive control (one synthetic request, left PENDING for the owner):**

| Step | Result |
| --- | --- |
| `organizations.create` + `campaigns.create` (maxSubmissions 3) + `photos.upload` ×5 | synthetic org/campaign/5 staged photos |
| `registrations.submit` (plate **ฑฆ9999**, TH-10) | `status:PENDING_APPROVAL`, requestId `ac6f103b…`, vehicleId `68991afc…` |
| `registrations.listPending` (REGISTRATION_ADMIN) | **total 1**, new requestId present ✓ |
| `registrations.detail` | `PENDING_APPROVAL`, 5 photos ✓ |
| **Independent sheet read-back (gviz)** | **38 rows = 37 APPROVED + 1 PENDING_APPROVAL**; persisted `request_id`/`vehicle_id`/`plate`/`province` match the API; `reviewed_by`/`reviewed_at` empty ✓ |

**API ↔ persisted data consistent** (verification directive honored: every call checked against the actual sheet, not just the response). The owner can now refresh the Review screen and approve/reject **ฑฆ9999**; afterwards `npm run reset:dev` retires the synthetic org/campaign/request.

### RBAC nuance confirmed (not a bug)

`registrations.listPending` requires `vehicle.registration.approve`, which **only `REGISTRATION_ADMIN` holds** — `SYSTEM_ADMIN` alone does **not** ([SessionService.js](../backend/gas/src/application/security/SessionService.js) `ROLE_PERMISSIONS`). The owner's account holds **both** roles, so the screen loads. A pure `SYSTEM_ADMIN` account would get `FORBIDDEN` on the review queue (by design, least privilege). The automation admin also holds both roles, so no temp user was needed.

### Best practice reinforced

- **Correct-empty vs broken-empty:** always tally the live filter field (`status`) before assuming a defect. 37/37 `APPROVED` → empty is correct.
- **Prove the positive path live:** create a matching row → confirm it appears in the API **and** in the persisted store (read-back). This is the strongest proof and is now executed, not just unit-tested.
- **Empty-state UX is a separate concern:** the queue intentionally lists only `PENDING_APPROVAL`. If reviewers find "no pending" confusing when the sheet has approved rows, a future UX hint ("all N requests already reviewed — submit a new registration to test") could help; that is a product decision, not a defect.