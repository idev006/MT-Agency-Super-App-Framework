# P6 Vehicle Contact — Backend 0.9.0 scoped operations evidence

**Date:** 2026-11-21 | **Scope:** GAS backend + API v1 contract only (no frontend wiring, no live GAS push).
**Classification:** SOURCE + SYNTHETIC CI EVIDENCE. Not live authenticated GAS HTTP acceptance, not production release.

## 1. What changed and why

Three new least-privilege operations close the last role-coverage gaps identified in the
[Full role × use-case implementation plan](FULL_ROLE_USECASE_IMPLEMENTATION_PLAN_20261121.md):

| Operation | Inventory ID | Owning UC | Permission | Gap closed |
|---|---|---|---|---|
| `vehicles.listMine` | `VC-VEHICLES-006` | UC-OWNER-01 | `vehicle.own.read` (NEW) | OWNER had no way to discover own `vehicleId` |
| `changes.listMine` | `VC-CHANGES-004` | UC-OWNER-01 | `vehicle.own.read` (NEW) | OWNER had no way to track own submitted change requests |
| `retention.listExecutable` | `VC-RETENTION-005` | UC-RET-02 | `retention.worker` | RETENTION_WORKER could execute but had no read path to discover executable jobIds |

Decisions recorded as [VC-ADR-014 (D1)](DECISION_LOG.md) and [VC-ADR-015 (D2)](DECISION_LOG.md) —
**implemented in source, security ratification pending**.

API inventory grows **52 → 55** routes (54 DTO operations + `system.health`).
Protected operations **46 → 49**; RBAC matrix **230 → 245** checks (5 roles × 49).
Backend source version marker **0.8.1 → 0.9.0**.

## 2. Design constraints honoured

- **Server-authoritative identity.** `vehicles.listMine` filters `vc_vehicles.owner_user_id === actor.userId`
  and `status === 'ACTIVE'`; `changes.listMine` filters `vc_change_requests.submitted_by === actor.userId`.
  Ownership is never read from the client payload; the DTO rejects unknown fields such as `ownerUserId`.
- **Sheets is not an RDBMS (owner directive).** Each op performs a single bounded snapshot read
  (`store.list`) with an in-memory filter and returns minimal list fields. **No cross-sheet join**,
  no per-row contact/photo fetch. Detail is fetched on demand via existing detail ops.
  O(rows) scans are DEV-scale; an indexed store is required before production volume.
- **Least privilege for the worker.** `retention.listExecutable` requires `retention.worker`, not
  `retention.read`. It returns only jobs the worker may actually execute: status
  `DELETION_APPROVED`/`DELETION_FAILED`, an approver present, `due_at <= now`, and `legal_hold` false.
  SYSTEM_ADMIN (which holds `retention.read`/`retention.delete.approve` but not `retention.worker`)
  is denied this op — verified by SCOPED-07.
- **Destructive execution unchanged and still gated.** `retention.execute` remains behind
  `allowDestructiveRetention` (default false → `RETENTION_EXECUTION_DISABLED`).

## 3. Files touched

Backend source:
- `application/security/SessionService.js` — OWNER role gains `vehicle.own.read`.
- `application/use-cases/VehicleOperations.js` — `vehicleListMine`, `changeListMine` + exports.
- `application/use-cases/MediaRetentionOperations.js` — `executableJobs` + export.
- `api/controllers/OperationController.js` — 3 permission mappings; count gate 51 → 54.
- `api/dto/OperationPayloadValidator.js` — 3 DTO schemas (empty required; optional `limit`/`page`/`pageSize`).
- `api/routes/GroupRoutes.js` — `listMine`/`listExecutable` allowlist entries.
- `domain/policies/ApiInventoryGate.js` — ready count 50 → 55.

Contract / gateway:
- `contracts/api-inventory.v1.json` — +3 entries (`SOURCE_WRITTEN_UNVERIFIED`, all verified flags false).
- `contracts/api-permissions.v1.json` — +3 entries (`enabled:false`, `SERVER_VERIFIED_SESSION`).
- `tools/p6vc-api-test-console/worker.mjs` — +3 `FRONTEND_PAYLOAD_FIELDS` allowlist entries.

SSOT governance:
- `docs/use-cases/catalog.json`, `UC-OWNER-01/specification.md`, `UC-RET-02/specification.md`,
  `docs/traceability-matrix.md` (+3 rows), `scripts/validate-usecase-ssot.mjs` (52 → 55).

Tests:
- `tests/owner-worker-scoped-reads.test.mjs` (NEW, 8 cases) + wired into `package.json` test script.
- Count-based updates: `api-inventory.test.mjs`, `api-wiring.test.mjs`, `live-owner-dev-runner.test.mjs`,
  `actor-rbac-matrix.test.mjs` (52→55, 46→49, 230→245).
- `scripts/run-live-owner-dev-regression.mjs` — adds `vehicles.listMine` (+ STAFF FORBIDDEN negative),
  `changes.listMine`, `retention.listExecutable` (+ STAFF FORBIDDEN negative) for live coverage.

## 4. Synthetic CI evidence (local, this branch)

| Gate | Result |
|---|---|
| `node scripts/validate-usecase-ssot.mjs` | **PASSED** — 20 UC diagrams; 55/55 unique v1 operations; 0 errors |
| `npm test` (full GAS backend suite) | **PASS** — all suites green |
| `actor-rbac-matrix` | 55 routes (54 DTOs + health); anonymous denied at 49 protected ops; 5 roles × 49 = **245 checks** (role-allowed 78, denied 167) |
| `owner-worker-scoped-reads` | **8/8 pass** (SCOPED-01…08) |
| `api-wiring` | All 55 v1 routes match inventory; 54 DTOs wired |
| Worker `node --test worker.test.mjs` | **28/28 pass** |
| Compiled GAS VM Editor | AUTH 19/19, LIFECYCLE 21/21 (unchanged) |

SCOPED cases prove: owner-only ACTIVE vehicle filtering; client-supplied owner id rejected
(`INVALID_REQUEST`); STAFF/anonymous denied; owner-only change filtering; REGISTRATION_ADMIN denied
`changes.listMine`; worker queue excludes waiting/hold/future/no-approver jobs; worker-only least
privilege (STAFF and SYSTEM_ADMIN denied); `page`/`pageSize` envelope shape; scoped reads do not
mutate business rows.

## 5. Explicitly NOT done / remaining gates

- **No live GAS push.** Source is written and CI-green; owner must type `PUSH_VEHICLE_GAS`, then
  publish the Web App version themselves. Live authenticated HTTPS E2E for the 3 new ops
  (via `run-live-owner-dev-regression.mjs`) remains `PENDING_REAL_GAS`.
- **No frontend wiring.** `my-vehicles` (OWNER) and worker execution UI are separate slices.
- **Security ratification of D1/D2 pending.** New permission `vehicle.own.read` and the worker-scoped
  read are engineering least-privilege defaults, not a human security sign-off.
- **Worker redeploy** by assistant after merge (wrangler), then health probe through the Worker.
- Inventory `enabled:false` / verified flags false are contract governance state, **not** test results.

## 6. Reproduce

```bash
node scripts/validate-usecase-ssot.mjs
cd apps/vehicle-contact/backend/gas && npm test
cd tools/p6vc-api-test-console && node --test worker.test.mjs
```

## 7. Live deployment verification + backendVersion marker-drift fix (2026-11-21)

**Push:** owner authorized `PUSH_VEHICLE_GAS`; workflow run
[44868644525](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44868644525)
pushed 54 files from commit `04fd95b` and created immutable source **Version 36**.
Owner then published the Web App as **Version 37** (2026-11-21 13:51).

**Bug found (marker drift):** after publication, `system.health` through the Worker still
reported `backendVersion: "0.8.1"`. Root cause: the health marker is a hardcoded literal in
`src/api/groups/system/SystemGroup.js`, separate from `package.json`. The 0.9.0 slice bumped
`package.json` but **not** the health literal, so the published deployment was functionally
0.9.0 yet indistinguishable from 0.8.1 by health probe — a recurrence of the V33/V35 lesson
(see [SheetStore coercion fix & best practices](SHEETSTORE_COERCION_FIX_AND_SHEETS_BEST_PRACTICES_20261121.md)).

**Functional proof that 0.9.0 was actually live (independent of the marker):** through the Worker,
`vehicles.listMine` with a syntactically-valid dummy session returned `UNAUTHENTICATED`
(route recognized, session required), while a fabricated `vehicles.listMineXYZ` returned
`OPERATION_NOT_ALLOWED` (Worker allowlist rejection). The new ops were therefore present in the
published Version 37 source; only the version label was stale.

**Fix + permanent guard:**
- `SystemGroup.js` health `backendVersion` → `"0.9.0"`.
- `tests/contract.test.mjs` now asserts `health.backendVersion === package.json version`, so any
  future marker drift fails CI before push. Full backend suite re-run: **PASS**.

**Best practice (recorded for the team):** a behavior/version change MUST bump the health
`backendVersion` literal together with `package.json`; the contract guard now enforces this.
Always verify a publication with a health probe **and** a functional probe of a changed route —
do not assume "owner published" means the new code is served.

**Remaining gate:** the marker fix requires a fresh source push (new owner `PUSH_VEHICLE_GAS`)
and a new Web App publication before health reads `0.9.0`. Live authenticated E2E of the three
new ops (real OWNER/WORKER sessions) still awaits the owner's transient DEV credential.