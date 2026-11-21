# C1 — REGADMIN Change-Approval Screen (list → delta diff → APPROVE/REJECT)

**Date:** 2026-11-21 (Asia/Bangkok)
**Slice:** WS-C / C1 (PM plan [PROJECT_MANAGEMENT_PLAN_20261121.md](PROJECT_MANAGEMENT_PLAN_20261121.md))
**Status:** SOURCE COMPLETE + TEST GREEN. **Live verification PENDING** the batched GAS re-push (owner `PUSH_VEHICLE_GAS`) — see "Live gate" below.
**Permission:** `vehicle.change.approve` (REGISTRATION_ADMIN). FE gating is UX-only; GAS re-authorizes every call.

## What was delivered

A full frontend vertical slice for approving owner-submitted vehicle change requests, mirroring the registration-review convention:

| Layer | File |
|---|---|
| Port (detail, shared C2/C3) | `frontend/src/application/vehicles/vehicle-detail-port.js` |
| Port (change review) | `frontend/src/application/vehicles/change-review-port.js` |
| Repository (detail) | `frontend/src/infrastructure/vehicles/gas-vehicle-detail-repository.js` |
| Repository (change review) | `frontend/src/infrastructure/vehicles/gas-change-review-repository.js` |
| Composable | `frontend/src/features/vehicle-changes/useChangeReview.js` |
| Page | `frontend/src/pages/ChangeReviewPage.vue` |
| Route | `vehicles/changes/review` → name `change-review`, `requiredPermissions: ['vehicle.change.approve']` |
| Menu | `change-review` item, `permissionsAny: ['vehicle.change.approve']`, routed |
| DI | `App.vue` provides `vehicleDetailRepositoryKey` + `changeReviewRepositoryKey` via `session.callProtected` |

Flow: `changes.listPending` (paginated queue, each row carries `proposedDelta`) → select → `vehicles.detail(vehicleId)` for current values → diff table (current vs proposed for `contactName`/`contactPhone`/`brand`/`model`/`color`) → `changes.review({requestId,decision})`. Contact current values read from the primary active contact; brand/model/color from the vehicle view. `storageRef` is stripped and contacts/photos are permission-gated by reusing `mapVehicleResponse`.

## Bug found + solution (SSOT knowledge transfer)

**Bug 1 — approver was blind.** `changes.listPending` (`changePending` in `VehicleOperations.js`) returned only `{requestId, vehicleId, submittedAt}`. A REGADMIN could see *that* a change was pending but not *what* was proposed, so an informed APPROVE/REJECT was impossible from the queue.
**Solution:** added `proposedDelta: JSON.parse(r.proposed_delta)` to each pending row, matching the shape `changes.listMine` already returns. The FE diff is built from this delta against `vehicles.detail`.

**Bug 2 — fixture violated a real invariant.** After adding the parse, `pagination-contract.test.mjs` failed with `OPERATION_FAILED` on `changes.listPending`: its seeded `vc_change_requests` rows had **no `proposed_delta`**, so `JSON.parse(undefined)` threw. In the real flow `changeSubmit` always writes `proposed_delta = JSON.stringify(delta)`, and `changeListMine` already parses it unconditionally — the fixture, not the production code, was wrong.
**Solution:** seeded realistic `proposed_delta` values (`{"brand":"Honda"}`, `{"color":"แดง"}`) in the pagination fixture. No defensive parse added to production code (consistent with `changeListMine`; a change request always carries a delta).

## Best practices reinforced

- **A list endpoint must carry the payload the actor needs to act.** An approval queue without the proposed delta is a UX dead-end; surface the decision-relevant fields server-side rather than forcing N detail calls just to render the queue.
- **Test fixtures must mirror production invariants.** A seed row missing a column that every real write populates hides crashes until a new reader parses it. When a reader starts depending on a field, audit every fixture that feeds it.
- **Reuse the strict DTO mapper.** `gas-vehicle-detail-repository` delegates to `mapVehicleResponse` so PII gating + `storageRef` stripping stay in one place; it only adds `version` (needed later by C3 `expectedVersion`).
- **Fail closed on contract drift.** The review repository rejects a mismatched `requestId` or any status outside the `APPROVE`/`REJECT` verb set the backend actually returns (`changeReview` echoes `p.decision`, not the stored `APPROVED`/`REJECTED`).
- **Uncertain writes are never auto-retried.** `TIMEOUT`/`NETWORK_ERROR` → `actionPhase:'uncertain'` with a "do not press again, reload and check status" banner, identical to registration review.

## Test evidence

- **Frontend:** `npx vitest run` → **29 files / 149 tests PASS**, including new `tests/change-review.test.js` (9 tests: queue delta allowlist + exact paginated DTO, exact review DTOs + verb status, fail-closed drift, detail DTO + storageRef strip + version, permission-gated contacts/photos, no-permission forbidden, diff from primary contact, uncertain-write no-retry, route/page contract) and `menu-catalog.test.js` (+1 case `vehicle.change.approve → change-review`).
- **GAS backend:** `npm run check` (build + full suite) → **EXIT 0, 130 ✔, 0 failures**; 53 `.gs` modules + manifest emitted. `pagination-contract` now green with realistic deltas.

## Live gate (owner action)

The `changePending` `proposedDelta` enhancement is a **backend source change**. Live Web App V39 source (`3646e39`) predates it, so until the batched re-push the live `changes.listPending` returns rows **without** `proposedDelta`; the FE then renders an empty diff (graceful, but not functional). C1 live verification therefore joins task #19:

1. Owner types `PUSH_VEHICLE_GAS` → assistant pushes `main` (B1 + B4 + B2 + this `changePending` delta) → owner publishes the new Web App version.
2. Assistant runs an authenticated REGADMIN probe: `changes.listPending` returns `proposedDelta`; `vehicles.detail` + `changes.review` APPROVE/REJECT verified live.
3. Owner browser acceptance of the diff/approve UX on synthetic requests.

No real data, no `ENFORCED`; synthetic owner-dev only. Credentials live solely in the gitignored `.env`, never committed.