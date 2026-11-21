# C3 — Vehicle Maintenance Edit (update / owner link / contact / photo replace / cancel)

**Date:** 2026-11-21 (Asia/Bangkok)
**Slice:** WS-C / C3 (PM plan [PROJECT_MANAGEMENT_PLAN_20261121.md](PROJECT_MANAGEMENT_PLAN_20261121.md), M2; depends C2)
**Status:** SOURCE COMPLETE + TEST GREEN + FE BUILD GREEN. **Live-verifiable now** — `vehicles.update`, `contacts.update`, `photos.replace`, `vehicles.cancel` are live on V39 and Worker-allowlisted (F0 redeploy); no GAS re-push needed.
**Permission:** `vehicle.update` (REGADMIN). FE gating is UX-only; GAS re-authorizes, re-checks `expectedVersion` and state.

## What was delivered

| Layer | File |
|---|---|
| Port | `frontend/src/application/vehicles/vehicle-maintenance-port.js` |
| Repository | `frontend/src/infrastructure/vehicles/gas-vehicle-maintenance-repository.js` |
| Composable | `frontend/src/features/vehicle-maintenance/useVehicleMaintenance.js` |
| Page | `frontend/src/pages/VehicleMaintenancePage.vue` |
| Route | `vehicles/maintenance/:vehicleId` → name `vehicle-maintenance`, `requiredPermissions: ['vehicle.update']` |
| Entry | `VehicleDetailPage` toolbar shows a gated "แก้ไขข้อมูล" link only with `vehicle.update` |
| DI | `App.vue` provides `vehicleMaintenanceRepositoryKey`; reuses `vehicleDetailRepositoryKey` (C1/C2) for current values + version |

Four write paths, each with an exact DTO and a fail-closed receipt:
- **Vehicle fields / owner link** — `vehicles.update {vehicleId, expectedVersion, …filled fields}` → `{vehicleId, version+1}`. Fields: plate/province/plateType/vehicleType/brand/model/color/ownerUserId.
- **Primary contact** — `contacts.update {vehicleId, contactName?, contactPhone?}` → `{vehicleId, updated:true}`.
- **Photo replace** — file → validated base64 (JPEG/PNG/WebP ≤5MB) → `photos.replace {vehicleId, slot, base64Image, mimeType}` → `{vehicleId, slot, replaced:true}`.
- **Cancel (destructive)** — `vehicles.cancel {vehicleId}` → `{vehicleId, status:'INACTIVE'}`; revokes active QR + creates a retention job; two-step ConfirmDialog.

## Bug found + solution (SSOT knowledge transfer)

**Bug — the conflict flag was clobbered by its own recovery reload.** The first implementation of the `VERSION_CONFLICT` branch set `conflict.value = true` and then called `load()` to refresh the current values/version. But `load()` begins with `conflict.value = false`, so the flag was immediately reset and the "someone else edited this, re-check and save again" banner never showed. Two unit tests caught it (`conflict` expected `true`, got `false`).
**Solution:** set `conflict.value = true` **after** `await load(...)` in the conflict branch, so the recovery reload completes first and the flag survives. `load()` keeps clearing the flag on a fresh/navigation load (correct), and the write path clears it at the start of each attempt.

**Test-fixture lesson:** the optimistic-concurrency success test must mock the post-write `vehicles.detail` reload returning the **new** version (4), not the stale pre-write version (3) — otherwise the reload legitimately overwrites the bumped version and the assertion fails. The receipt version and the reloaded version must agree, exactly as in production.

## Best practices reinforced

- **Optimistic concurrency, never blind-retry.** Every vehicle update carries `expectedVersion`; on `VERSION_CONFLICT` the UI reloads the fresh version + current values and asks the user to re-apply — it does **not** auto-resubmit (which could overwrite another editor's work).
- **Uncertain writes are never auto-retried.** `TIMEOUT`/`NETWORK_ERROR` → `actionPhase:'uncertain'` + "do not press again, reload and check status".
- **Destructive cancel is gated and explicit.** A dedicated danger zone + ConfirmDialog states the irreversible effects (INACTIVE, QR revoked, retention job). Cancel is disabled once completed.
- **Photo replace reuses the intake media guard.** Same `ALLOWED_MIME` + 5MB cap + chunked `arrayBuffer→btoa` as registration intake; the Worker enforces the 7.5MB payload exemption and exact DTO for `photos.replace`.
- **Single source of truth for current values.** After every successful write the composable reloads `vehicles.detail`, so the displayed values/version always match the server (no optimistic local mutation drift).
- **Strict receipts fail closed.** A non-integer version, `updated!==true`, `replaced!==true`, or `status!=='INACTIVE'` throws `VehicleMaintenanceContractError`; invalid slot/base64/mime is rejected before the call.

## Test evidence

- **Frontend:** `npx vitest run` → **32 files / 172 tests PASS**, including new `tests/vehicle-maintenance.test.js` (10 tests: update exact DTO + new version, contact/photo/cancel exact DTOs, fail-closed invalid photo + broken receipts, no-permission forbidden, version bump on success, VERSION_CONFLICT reload + no blind-retry, uncertain no-retry + completed cancel, photo replace from validated file, route/gated-entry/page contract).
- **Frontend build:** `npm run build` → built OK (maintenance SFC compiles).
- **Worker allowlist:** `vehicles.update`, `vehicles.cancel`, `contacts.update`, `photos.replace` present with exact field allowlists + the `photos.replace` size exemption/validation.
- **GAS backend:** unchanged (FE-only slice); suite green from C1.

## Live gate (owner action)

C3 needs no GAS re-push. To finish live verification: owner fills gitignored `.env` DEV secrets → assistant probes a synthetic vehicle maintenance journey (update with version conflict, contact update, photo replace, cancel) through the Worker with the owner-dev write guard → owner browser acceptance. Cancel/retention is synthetic only; never real data / `ENFORCED`. Credentials never committed.