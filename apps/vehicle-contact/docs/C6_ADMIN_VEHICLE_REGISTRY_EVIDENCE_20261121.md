# C6 — SYSTEM_ADMIN approved-vehicle registry (`vehicles.list`)

**Date:** 2026-11-21 (Asia/Bangkok)
**Handoff:** 2026-11-22 08:23 Asia/Bangkok; source merge baseline `main` @ **`bf3553d`** (PR **#110**).
**Slice:** WS-C / C6 (PM plan [PROJECT_MANAGEMENT_PLAN_20261121.md](PROJECT_MANAGEMENT_PLAN_20261121.md))
**Decision:** [VC-ADR-017](DECISION_LOG.md) — IMPLEMENTED IN SOURCE; SECURITY/PDPA RATIFICATION PENDING
**Status:** SOURCE COMPLETE + TEST GREEN + **DEPLOYED LIVE (GAS Web App Version 48, `backendVersion 0.9.1`) + full authenticated API verification PASS**. Browser UX acceptance and VC-ADR-017 security/PDPA ratification remain open human gates.
**Trigger:** Project Owner — "System Admin ก้ควรดูรายการรถที่ได้รับการอนุมัติได้สิ" (System Admin should be able to see the list of approved vehicles).

## Problem

Before C6, SYSTEM_ADMIN had **no bulk vehicle-read capability**. The only vehicle reads were:
- `vehicles.lookup` — requires **plate + province**, returns ONE `ACTIVE` vehicle (a search, not a browse); permission `vehicle.lookup` held by REGISTRATION_ADMIN/STAFF, **not** SYSTEM_ADMIN.
- `vehicles.listMine` — OWNER-scoped (own vehicles only); permission `vehicle.own.read`.

The owner could search only because their account also holds REGISTRATION_ADMIN. A pure SYSTEM_ADMIN had no way to see the approved-vehicle registry. C6 closes that gap with a dedicated admin-only browse op.

## What was delivered

| Layer | File / change |
|---|---|
| Use-case | `backend/gas/src/application/use-cases/VehicleOperations.js` — `vehicleList(p)`: `vc_vehicles` snapshot filtered to `ACTIVE`, mapped to minimal non-PII fields, `paginate(items,p,{defaultLimit:50,maxLegacyLimit:100})` |
| Permission authority | `OperationController.js` — `'vehicles.list':'vehicle.list'`; entry/DTO count gate 54→55 |
| DTO | `OperationPayloadValidator.js` — `'vehicles.list':[{}, {limit:'n',page:'n',pageSize:'n'}]` (no client `status`/`ownerUserId` filter) |
| Routes | `GroupRoutes.js` — vehicles group `…,'listMine','list'` (55→56 routes) |
| Role SSOT | `SessionService.js` ROLE_PERMISSIONS — `vehicle.list` granted to **SYSTEM_ADMIN + REGISTRATION_ADMIN only** (NOT STAFF/OWNER/RETENTION_WORKER) |
| Contracts | `api-inventory.v1.json` VC-VEHICLES-007; `api-permissions.v1.json` VC-VEHICLES-007 (`vehicle.list`, SERVER_VERIFIED_SESSION, enabled false); `list-pagination.v1.json` += `vehicles.list` |
| Worker | `tools/p6vc-api-test-console/worker.mjs` FRONTEND_PAYLOAD_FIELDS `"vehicles.list":[[],["limit","page","pageSize"]]` |
| FE port | `frontend/src/application/vehicles/vehicle-registry-port.js` |
| FE repository | `frontend/src/infrastructure/vehicles/gas-vehicle-registry-repository.js` (allowlist map + fail-closed `VehicleRegistryContractError`) |
| FE composable | `frontend/src/features/vehicle-registry/useVehicleRegistry.js` (read-only; permission gate `vehicle.list`; page-clamp) |
| FE page | `frontend/src/pages/VehicleRegistryPage.vue` (list + pagination + conditional detail link) |
| FE route | `vehicles/registry` → name `vehicle-registry`, `requiredPermissions:['vehicle.list']` |
| FE menu | `vehicle-registry` item, `permissionsAny:['vehicle.list']` |
| FE DI | `App.vue` provides `vehicleRegistryRepositoryKey` via `session.callProtected` |
| Health marker | `backendVersion` 0.9.0 → **0.9.1** (`SystemGroup.js` + `package.json`) so the published deploy is verifiable by probe |

**Returned fields (allowlist, non-PII):** `vehicleId, plate, province, vehicleType, brand, model, color, status, version, createdAt`. **No `owner_user_id`, no contacts.** PII (contact name/phone, photos, history) stays behind `vehicle.lookup` / `vehicle.contact.read` on the existing detail screen; the registry's "ดูรายละเอียด" link renders only when the session also holds `vehicle.lookup`.

## Best practices reinforced (SSOT)

- **Dedicated least-privilege permission, not role inference.** A new `vehicle.list` permission gates the op; FE navigation uses GAS-returned permissions, never the role name. Admin-only by default (PDPA-conservative); STAFF/OWNER/worker explicitly excluded.
- **Minimal non-PII projection.** The registry exposes only vehicle descriptors + approval timestamp. Owner identity and contact PII are never in the list payload — they require the separate, permission-gated detail read.
- **Single bounded snapshot, no cross-sheet join.** `vehicleList` reads `vc_vehicles` once, filters `ACTIVE` in memory, paginates. Sheets ≠ RDBMS; no per-row join to owners/contacts (latency directive).
- **No client-supplied filters/identity.** The DTO accepts only `limit/page/pageSize`; a spoofed `status` or `ownerUserId` is rejected (`INVALID_REQUEST` at GAS, `INVALID_OPERATION_PAYLOAD` at the Worker allowlist). The `ACTIVE` filter is server-authoritative.
- **Strict FE contract mapping + fail-closed.** Rows mapped through an allowlist (unknown fields dropped); a broken required field throws `VehicleRegistryContractError`, a broken page envelope throws `PaginationContractError`. Read-only composable — no write/uncertain path.
- **Verifiable deployment marker.** Adding a functional op bumps `backendVersion` (0.9.1) so `system.health` distinguishes the new published source from the old (the documented health-marker best practice).

## Test evidence

- **GAS backend:** `npm test` → **139/139 PASS, EXIT 0**. New `tests/admin-vehicle-list.test.mjs` REG-01..05: sys+reg see all ACTIVE across owners; minimal-field allowlist (no owner id/contacts); STAFF/OWNER/RETENTION_WORKER FORBIDDEN + anonymous UNAUTHENTICATED; DTO rejects `ownerUserId`/`status` spoof; page envelope + no business-row mutation. Count gates synchronized: inventory 56, routes 56, DTO/entries 55, protected permissions 50, RBAC matrix **5 roles × 50 = 250 checks**, live-owner-dev-runner 56 (incl. `VEHICLES.LIST` + `VEHICLES.LIST.FORBIDDEN` probes).
- **Frontend:** `npx vitest run` → **33 files / 180 tests PASS**. New `tests/vehicle-registry.test.js` (6 tests: non-PII allowlist + exact paginated DTO + secret drop, fail-closed required-field/envelope, no-permission forbidden, load/empty/page-clamp, forbidden/unauthenticated/error capture no-retry, route/routed-menu/read-only page contract). `menu-catalog.test.js` SYSTEM_ADMIN baseline now includes `vehicle-registry`; `system-admin-routes-contract.test.js` += `vehicle-registry`/`vehicle.list`.
- **Frontend build:** `npx vite build` → **147 modules transformed, built OK** (daisyUI 5.8.1).
- **Worker:** `node --test worker.test.mjs` → **31/31 PASS** (new `vehicles.list` positive `{page,pageSize}` + negative spoofed `status` cases).

## Live deployment + verification (2026-11-21)

Assistant self-deployed via the owner-authorized clasp/wrangler path (no secret values in repo/logs/docs):

1. **GAS:** `npm run build` (54 `.gs` + webapp-only manifest `executeAs:USER_DEPLOYING,access:ANYONE_ANONYMOUS`) → `clasp -u p6vc push --force` → `create-version` → **Version 48** → `update-deployment AKfycby15c-… -V 48` → `list-deployments` confirms live **@48**.
   - Direct `/exec` health: `{"ok":true,"data":{"status":"ready","apiVersion":"v1","backendVersion":"0.9.1"}}`.
2. **Worker:** bindings safety-checked (`wrangler versions view 5d074650-…` == toml 3 plain vars, no secrets/KV) → `wrangler deploy` → **Version `20180237-7441-481a-9540-e7ca2c9c79eb`**, bindings preserved.
   - Worker `system.health` (Origin `https://idev006.github.io`): `backendVersion:"0.9.1", status:"ready"` → confirms Worker → GAS v48.
   - `verify-live-worker-failclosed.mjs`: **14/14 PASS**.
   - `vehicles.list` anonymous (no session) → **`INVALID_SESSION_PAYLOAD`** (Worker fails closed; op recognized as protected).
   - `vehicles.list` spoofed `{status:"INACTIVE"}` → **`INVALID_OPERATION_PAYLOAD`** (Worker allowlist rejects non-DTO field).
3. **Historical pre-reseed live data positive-control (gviz CSV, owner browser session, no creds):** at that observation, `vc_vehicles` = **14 rows → `ACTIVE` 11 / `INACTIVE` 3**. The registry's server-side `ACTIVE` filter would return those **11** approved-and-active vehicles; the 3 cancelled/inactive were correctly excluded. (Read via plain `out:csv` with owner cookies; `out:json`/`tq` require OAuth → ACCESS_DENIED, per the documented gviz quirk.) The later reseed below supersedes this row count, not the historical observation.
4. **Source merged + frontend live:** PR **#108** merged to `main` @ **`cef47e7`** (CI `Validate P6 Vehicle Contact` all steps green: SSOT validators 56/56 ops, FE 180/180 + build, Worker 31/31, GAS `npm run check` + artifact 54 `.gs`). `deploy-pages-ssot` run **44910792210** success → live Pages bundle `assets/index-CfsuYp98.js` contains `vehicle-registry` (route/menu), `vehicles.list` (op) and "ทะเบียนยานพาหนะ" (page title). The registry screen is reachable on GitHub Pages for an authenticated SYSTEM_ADMIN. PR #110 subsequently established the handoff source merge baseline at `bf3553d`.
5. **Full authenticated API verification:** the 2026-11-21 22:01:34–22:10:30 run passed **97/97** (11 public direct-GAS + 14 Worker + 72 authenticated direct-GAS), covered **56/56 operations**, and passed cleanup **7/7**. The authenticated stage exercised `vehicles.list` positive and forbidden RBAC paths, completing the C6 authenticated API probe. This does not close browser acceptance or human ratification. See [LIVE_API_AUTOMATION](LIVE_API_AUTOMATION.md).
6. **DEV reseed after the historical 11-ACTIVE observation:** 11 old synthetic vehicles were retired through `vehicles.cancel`; 10 new `ACTIVE` vehicles were created, each verified with exactly **1 contact / 5 photos / QR MATCH**. Seed cleanup passed **2/2**. The post-seed GAS editor audit checked **25/25 sheets with zero errors**. The current intentional DEV fixture set is therefore 10 ACTIVE vehicles.

## Remaining live gates (owner action)

1. **Browser acceptance:** sign in as SYSTEM_ADMIN → menu "ทะเบียนยานพาหนะ" → see the current 10 ACTIVE synthetic DEV vehicles, paginate, and drill into detail (combined admin role). This remains open even though API verification passed.
2. **PDPA/security ratification of [VC-ADR-017](DECISION_LOG.md)** (admin-only bulk vehicle read) — production sign-off remains separate and open.

Credentials live solely in the gitignored `.env` or protected optional CI secrets, never committed/pushed/logged/pasted into docs/issues/chat. Credential rotation remains an open security gate.
