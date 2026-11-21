# P6 Vehicle Contact — F0 Worker allowlist expansion + permission-contract drift fix

**Date:** 2026-11-21 | **Scope:** Cloudflare Worker gateway allowlist + `api-permissions.v1.json` contract + GAS inventory drift-guard. Foundational enabler for FE slices C1–C5.
**Classification:** SOURCE + SYNTHETIC CI EVIDENCE. No GAS runtime source change; no live GAS push. Worker redeploy required (assistant self-deploys).

## 1. Bug / gap

### 1.1 Worker allowlist missing the maintenance/change/retention ops
The Worker `/api/frontend` gateway is fail-closed: only ops in `FRONTEND_PAYLOAD_FIELDS` are forwarded. It already had the 3 scoped reads (`vehicles.listMine`, `changes.listMine`, `retention.listExecutable`) but was **missing** every op the 5 new role screens need:
`vehicles.detail/update/cancel`, `contacts.read/update`, `changes.submit/listPending/review`, `photos.list/replace`, `retention.execute`.
Without these, C1–C5 calls through the Worker return `OPERATION_NOT_ALLOWED` (403) — the screens could never work live.

### 1.2 Permission-contract drift (SSOT bug — privilege-escalation risk)
`contracts/api-permissions.v1.json` disagreed with the runtime authority `OperationController.OPERATION_PERMISSIONS`:
| Op | Contract (wrong) | Backend (correct) | Risk if contract were trusted |
|---|---|---|---|
| `contacts.update` | `vehicle.contact.read` | `vehicle.update` | **STAFF** (has `vehicle.contact.read`, lacks `vehicle.update`) could edit contacts — privilege escalation |
| `changes.submit` | `campaign.token.valid` / `SERVER_VERIFIED_CAMPAIGN` | `vehicle.change.submit` / `SERVER_VERIFIED_SESSION` | Documented as a public campaign op; actually an authenticated OWNER-scoped op |

The backend was correct in both cases; the **contract documentation was wrong**. No CI gate cross-checked the two, so the drift went unnoticed.

## 2. Fix

- **Worker allowlist:** added all 11 ops with exact required/optional DTO fields (mirrors `OperationPayloadValidator.SCHEMAS`). `photos.replace` is a protected large-image op: exempted from the 32 KB payload/raw limits (like `photos.upload`) and given a dedicated image-shape validation block (vehicleId + slot + base64 + mime) that **requires a valid session token** (unlike public `photos.upload`).
- **Contract drift:** `contacts.update.requiredPermission` → `vehicle.update`; `changes.submit.requiredPermission` → `vehicle.change.submit`, `identitySource` → `SERVER_VERIFIED_SESSION`.
- **Permanent drift guard:** `tests/api-inventory.test.mjs` now imports `OPERATION_PERMISSIONS` + `PUBLIC_OPERATIONS` and asserts every non-public contract `requiredPermission === OPERATION_PERMISSIONS[op]`. Verified **0 drift across all 49 non-public ops** after the fix. This makes the bug class fail CI forever.

## 3. Files
- `tools/p6vc-api-test-console/worker.mjs` — allowlist + `photos.replace` size exemption/validation + raw-size exemption
- `tools/p6vc-api-test-console/worker.test.mjs` — denial example changed from `photos.replace` (now allowed) to non-allowlisted `vehicles.delete`; +2 tests (maintenance/change/retention exact-DTO forwarding + negatives; protected large-image `photos.replace` + bad-shape/no-session negatives)
- `apps/vehicle-contact/contracts/api-permissions.v1.json` — 2 drift fixes
- `apps/vehicle-contact/backend/gas/tests/api-inventory.test.mjs` — drift guard

## 4. Proof (synthetic CI, local)
- Worker suite **30/30 PASS** (was 28; +2 new).
- GAS inventory/permission gate **PASS** (incl. new drift guard).
- Full GAS suite **EXIT 0**; build **EXIT 0** (53 .gs + manifest). No GAS runtime source changed.

## 5. Best practices (SSOT knowledge)
- **The runtime controller is the permission authority; the contract is documentation.** Keep them in lockstep with an automated cross-check — a read-permission documented on a write op is a latent privilege-escalation bug.
- **Fail-closed gateway allowlists must be extended in the same slice as the FE that calls them**, with exact DTO field mirroring, or the screen silently 403s live.
- **Protected large-image ops need explicit size-limit exemptions + shape validation + session enforcement**; never reuse the public-upload path (which bypasses the session check).

## 6. Remaining gates
- **Worker redeploy — DONE:** assistant self-deployed via `wrangler deploy` (Version ID `3384ace9-7a65-4486-9ff4-2cd22393edee`, `main` @ `a77d4bd`, PR #98). **Live-verified through the Worker:** `vehicles.detail` + `changes.listPending` with a dummy session → `UNAUTHENTICATED` (route recognized + forwarded, not `OPERATION_NOT_ALLOWED`); non-allowlisted `vehicles.delete` → `OPERATION_NOT_ALLOWED` (fail-closed negative PASS).
- FE slices C1–C5 build on this enabler.
- Live hardening re-push (B1/B4/B2) still awaits owner `PUSH_VEHICLE_GAS` — see [PRODUCTION_READINESS_PLAN_20261121.md](PRODUCTION_READINESS_PLAN_20261121.md).