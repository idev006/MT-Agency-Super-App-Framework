# C4 — OWNER `my-vehicles` (list → submit change → track)

**Date:** 2026-11-21 (Asia/Bangkok)
**Slice:** WS-C / C4 (PM plan [PROJECT_MANAGEMENT_PLAN_20261121.md](PROJECT_MANAGEMENT_PLAN_20261121.md), sequence D3: C1 → C4)
**Status:** SOURCE COMPLETE + TEST GREEN + FE BUILD GREEN. **Live-verifiable now** — all three ops (`vehicles.listMine`, `changes.submit`, `changes.listMine`) are already live on Web App V39 (scoped ops #90, A3 55/55) and allowlisted in the Worker. Owner browser acceptance + synthetic owner-journey E2E pending DEV credentials in gitignored `.env`.
**Permission:** read `vehicle.own.read`, submit `vehicle.change.submit` (OWNER). FE gating is UX-only; GAS re-authorizes and re-checks ownership.

## What was delivered

| Layer | File |
|---|---|
| Port | `frontend/src/application/vehicles/my-vehicles-port.js` |
| Repository | `frontend/src/infrastructure/vehicles/gas-my-vehicles-repository.js` |
| Composable | `frontend/src/features/vehicle-changes/useMyVehicles.js` |
| Page | `frontend/src/pages/MyVehiclesPage.vue` |
| Route | `vehicles/mine` → name `my-vehicles`, `requiredPermissions: ['vehicle.change.submit']` |
| Menu | existing `my-vehicles` item now **routed** (`route: 'my-vehicles'`) |
| DI | `App.vue` provides `myVehiclesRepositoryKey` via `session.callProtected` |

Flow: `vehicles.listMine` (server-scoped owned vehicles) → select → change form (`brand`/`model`/`color`/`contactName`/`contactPhone`, prefilled from current vehicle values) → `changes.submit` (only filled fields) → `changes.listMine` track filtered to the selected vehicle, showing status `PENDING`/`APPROVED`/`REJECTED` + proposed delta + submitted/reviewed times. This closes the owner↔REGADMIN loop with C1 (owner submits, REGADMIN approves).

## Best practices reinforced (SSOT)

- **Server-scoped reads, never a client owner id.** `vehicles.listMine` filters by the server session identity; the FE sends only pagination. The track is filtered client-side from that single bounded snapshot — **no cross-sheet join** (Sheets ≠ RDBMS).
- **Ownership is re-checked server-side on write.** `changeSubmit` requires `v.owner_user_id === a.userId` (or `vehicle.update`); the FE never asserts ownership, it only renders owned vehicles. A forged `vehicleId` fails closed with `OWNERSHIP_NOT_VERIFIED`.
- **Send only the delta the owner filled.** The repository includes allowlisted non-empty fields only; an empty delta is rejected server-side (`NO_CHANGES`), and the submit button is disabled until at least one field is filled.
- **A submitted change is a proposal, not a write.** The UI states data changes only after approval; the receipt is `PENDING`, and the track reflects the stored `APPROVED`/`REJECTED` after C1 review.
- **Uncertain writes are never auto-retried.** `TIMEOUT`/`NETWORK_ERROR` → `actionPhase:'uncertain'` + "do not press again, reload and check status" banner.
- **Strict DTO mapping + fail-closed receipts.** Vehicle/change rows are mapped through allowlists (unknown fields dropped); a submit receipt with a non-`PENDING` status or empty `requestId` throws `MyVehiclesContractError`.

## Test evidence

- **Frontend:** `npx vitest run` → **30 files / 157 tests PASS**, including new `tests/my-vehicles.test.js` (8 tests: owned-vehicle allowlist + exact paginated DTO, filled-only submit DTO + PENDING receipt, fail-closed receipt, change-track delta allowlist + DTO, no-permission forbidden, load/filter/refresh-after-submit, submit-permission gate + uncertain no-retry, route/routed-menu/page contract).
- **Frontend build:** `npm run build` → **137 modules transformed, built OK** (both C1 and C4 SFCs compile; daisyUI 5.8.1).
- **Worker allowlist:** `vehicles.listMine`, `changes.submit`, `changes.listMine` present (`tools/p6vc-api-test-console/worker.mjs`), so the slice is reachable through the Origin-locked gateway.
- **GAS backend:** unchanged by C4 (FE-only slice); suite remains green from C1 (`npm run check` EXIT 0).

## Live gate (owner action)

C4 needs **no GAS re-push** — its ops are already live. To finish live verification:
1. Owner fills the gitignored `.env` DEV secrets once (`P6VC_ADMIN_PASS`, `P6VC_TEST_USERNAME`, `P6VC_TEST_PASSWORD`).
2. Assistant runs a synthetic owner-journey probe (login → `vehicles.listMine` → `changes.submit` → `changes.listMine` track) with the owner-dev write guard; synthetic only, never real data / `ENFORCED`.
3. Owner browser acceptance of the list/submit/track UX.

Credentials live solely in the gitignored `.env`, never committed/pushed/logged.