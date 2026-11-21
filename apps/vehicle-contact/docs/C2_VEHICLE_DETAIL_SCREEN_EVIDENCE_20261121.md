# C2 — Unified Vehicle Detail Read (contacts / photos / history)

**Date:** 2026-11-21 (Asia/Bangkok)
**Slice:** WS-C / C2 (PM plan [PROJECT_MANAGEMENT_PLAN_20261121.md](PROJECT_MANAGEMENT_PLAN_20261121.md), M2)
**Status:** SOURCE COMPLETE + TEST GREEN + FE BUILD GREEN. **Live-verifiable now** — `vehicles.detail` + `vehicles.history` are live on V39 and Worker-allowlisted; no GAS re-push needed.
**Permission:** `vehicle.lookup` (route); contacts `vehicle.contact.read`, photos `vehicle.photos.read`, history `vehicle.history.read` (server-gated). STAFF/REGADMIN read.

## What was delivered

A deep-linkable unified detail view by `vehicleId`, reusing the **same** result component as plate search so there is one rendering contract for vehicle reads:

| Layer | File |
|---|---|
| Repository (extended) | `frontend/src/infrastructure/vehicles/gas-vehicle-detail-repository.js` — added `history(vehicleId)` (`vehicles.history` → `mapVehicleHistory`) alongside the C1 `detail()` |
| Composable | `frontend/src/features/vehicle-search/useVehicleDetail.js` |
| Page | `frontend/src/pages/VehicleDetailPage.vue` |
| Shared view | `frontend/src/features/vehicle-search/components/VehicleSearchResult.vue` — added a "ดูรายละเอียด" deep link |
| Route | `vehicles/detail/:vehicleId` → name `vehicle-detail`, `requiredPermissions: ['vehicle.lookup']` |
| DI | reuses `vehicleDetailRepositoryKey` already provided in `App.vue` (C1) |

Flow: route param `vehicleId` → `vehicles.detail` (current values, permission-gated contacts/photos) → `vehicles.history` only when `vehicle.history.read` → assemble `{vehicle, history, requestIds:{lookup, history}}` → render via `VehicleSearchResult`. Reachable from the search result's new detail link; `watch` on the route param reloads when navigating between vehicles.

## Best practices reinforced (SSOT)

- **One rendering contract for vehicle reads.** Search (by plate) and detail (by id) feed the same `VehicleSearchResult`, so contacts/photos/history gating, a11y and mobile layout stay consistent and are tested once.
- **Reuse the strict mappers.** `mapVehicleResponse` strips `storageRef` and gates contacts/photos by permission; `mapVehicleHistory` exposes only `id/action/redacted_summary/occurredAt` — no actor id or raw audit payload leaks to the browser.
- **History is permission-gated and lazy.** The history call is skipped entirely without `vehicle.history.read`; the result still renders with an empty timeline and `requestIds.history:''`.
- **Inactive ≠ error.** `VEHICLE_NOT_ACTIVE` maps to a calm `empty` state ("not found or cancelled"), while transient failures (`TIMEOUT`/`NETWORK_ERROR`/`HTTP_429`/`BUSY`) map to `recoverable-error` with a retry that reuses the same id — mirroring `useVehicleSearch`.
- **Read-only slice.** No write path, no confirm dialog; every open is audited server-side.

## Test evidence

- **Frontend:** `npx vitest run` → **31 files / 163 tests PASS**, including new `tests/vehicle-detail.test.js` (6 tests: history exact DTO + audit allowlist + no actor leak, no-permission forbidden, search-shaped payload with history, history skipped without permission + inactive→empty, recoverable retry, route/page/shared-link contract).
- **Frontend build:** `npm run build` → built OK (detail SFC + shared result link compile).
- **GAS backend:** unchanged (FE-only slice); suite green from C1.

## Live gate (owner action)

C2 needs no GAS re-push. To finish live verification: owner fills gitignored `.env` DEV secrets → assistant probes `vehicles.detail` + `vehicles.history` for a synthetic vehicle through the Worker → owner browser acceptance of the detail view (desktop/mobile, a11y). Credentials never committed.