# FRONTEND — Full E2E of every page/role against LIVE Firestore DEV (#70)

- Date: 2026-11-23 (Asia/Bangkok)
- Status: **PASS — all 5 roles + a 6th UI-created account, every routed page, full business pipeline through the UI; 225 independent write read-backs, 0 audit failures, 107 bridge requests; console clean (0 errors/warnings)**
- Environment: real Vue 3 frontend (Vite dev, `localhost:5173`) → dev-only local bridge (`127.0.0.1:5178/api/frontend`) → **REAL application** (`Container → StoreSelector → FirestoreStore → F3a GAS REST gateway`) → live Firestore DEV, project `mt-iam-core-2026`, database `(default)`, Bangkok `asia-southeast3`. Synthetic data only; gate `P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE`.
- Reports/artifacts (gitignored, sanitized — counters/field-names only, never values): `backend/gas/test-results/firestore-frontend-bridge.json` (periodic snapshot + per-request latency log), live counters `GET /__audit`, `backend/gas/test-results/frontend-e2e/` (synthetic photo PNGs + generator, read-back script). One-time campaign/QR tokens kept in gitignored `test-results/frontend-e2e/.campaign-token` / `.qr-token`, **never committed**.

## What ran

The owner directive: *"after test in 2. i want you to test all frontend see how them work."* Every authenticated route was opened as each role that can reach it, and every write flow was driven through the actual UI (forms, buttons, confirmation dialogs) — not API shortcuts — then independently re-read from Firestore. This is the frontend counterpart of the [#69 API pipeline](BACKEND_FIRESTORE_LIVE_API_SUITE_EVIDENCE_20261122.md) (72/72) and runs on the same [POC #2/#3 bridge](BACKEND_FIRESTORE_LIVE_POC2_POC3_EVIDENCE_20261122.md).

Accounts (all synthetic): `p6vc_e2e_sys` (SYSTEM_ADMIN), `p6vc_e2e_reg` (REGISTRATION_ADMIN), `p6vc_e2e_staff` (STAFF), `p6vc_e2e_owner` (OWNER), `p6vc_e2e_worker` (RETENTION_WORKER), plus `p6vc_e2e_new` created **through the admin/users UI** during this run.

## RBAC matrix — menu/pages each role can open (verified)

Derived from `router/index.js` `requiredPermissions` × `SessionService.js` role map; observed menus and `/app/forbidden` redirects matched. ✔ = opens, ✘ = hidden from menu / redirected to forbidden (no data disclosed).

| Page (route) | Required permission | sys | reg | staff | owner | worker |
|---|---|:--:|:--:|:--:|:--:|:--:|
| Dashboard (`dashboard`) | authenticated | ✔ | ✔ | ✔ | ✔ | ✔ |
| Connection test (`connection`) | authenticated | ✔ | ✔ | ✔ | ✔ | ✔ |
| Account security (`account/security`) | session.authenticated | ✔ | ✔ | ✔ | ✔ | ✔ |
| Vehicle search (`vehicles/search`) | vehicle.lookup | ✘ | ✔ | ✔ | ✘ | ✘ |
| Vehicle detail (`vehicles/detail/:id`) | vehicle.lookup | ✘ | ✔ | ✔ | ✘ | ✘ |
| Vehicle maintenance (`vehicles/maintenance/:id`) | vehicle.update | ✘ | ✔ | ✘ | ✘ | ✘ |
| QR resolve (`vehicles/qr`) | vehicle.lookup | ✘ | ✔ | ✔ | ✘ | ✘ |
| Registration intake (`registrations/new`) | vehicle.registration.approve | ✘ | ✔ | ✘ | ✘ | ✘ |
| Registration review (`registrations/review`) | vehicle.registration.approve | ✘ | ✔ | ✘ | ✘ | ✘ |
| Change review (`vehicles/changes/review`) | vehicle.change.approve | ✘ | ✔ | ✘ | ✘ | ✘ |
| My vehicles (`vehicles/mine`) | vehicle.change.submit | ✘ | ✘ | ✘ | ✔ | ✘ |
| Approved registry (`vehicles/registry`) | vehicle.list | ✔ | ✔ | ✘ | ✘ | ✘ |
| Users & roles (`admin/users`) | users.manage | ✔ | ✘ | ✘ | ✘ | ✘ |
| Organizations (`admin/organizations`) | organizations.read | ✔ | ✔ | ✔ | ✘ | ✘ |
| Campaigns (`admin/campaigns`) | campaigns.manage | ✔ | ✘ | ✘ | ✘ | ✘ |
| QR governance (`admin/qr`) | qr.manage | ✔ | ✔ | ✘ | ✘ | ✘ |
| System settings (`admin/settings`) | system.settings.read | ✔ | ✘ | ✘ | ✘ | ✘ |
| Retention approval (`admin/retention`) | retention.read | ✔ | ✔ | ✘ | ✘ | ✘ |
| Audit review (`admin/audit`) | audit.read | ✔ | ✘ | ✘ | ✘ | ✘ |

Server re-checks every call (defense in depth): the bridge logged **8 FORBIDDEN** responses for out-of-role attempts (e.g. worker→retention, staff→update, reg→campaigns.manage, role-scoped `references.registration`). The forbidden page renders "ไม่สามารถเปิดงานนี้ได้ / ไม่มีข้อมูลถูกเปิดเผย" with no data leak. STAFF correctly sees **no edit link** on vehicle detail (lacks `vehicle.update`).

## Full business pipeline through the UI (reg + sys + staff + owner)

1. **sys — Organizations:** created org "สถานีตำรวจทดสอบ E2E" via `admin/organizations` form (`organizations.create`).
2. **sys — Campaigns:** created an active registration campaign via `admin/campaigns` (`campaigns.create`); one-time token shown once with secrecy warning, stored only in gitignored file. (First attempt with a future `startsAt` correctly returned `CAMPAIGN_INVALID` — re-created with a current window.)
3. **reg — Intake (`registrations/new`):** uploaded **5 photos** (FRONT/REAR/LEFT/RIGHT/FRONT_ANGLE, synthetic valid PNGs) via `photos.upload` (public, returns photoId), filled plate `E2E9999` · TH-10 · SEDAN/SYNTHETIC/AUTOMATED · contact, submitted (`registrations.submit`, photos = exactly 5 {slot,photoId}). Reference mode = **LEGACY** (vc_reference_* unseeded in DEV) → org is a plain code input, free-text brand/model, no `referenceVersion` sent.
4. **reg — Review (`registrations/review`):** pending queue → detail → photo viewer (`registrations.photo` ×5) → **APPROVE** with the `platePhotoVerified` gate (`registrations.review`). Created vehicle `c25e9fca…`.
5. **reg — Search → Detail → Maintenance:** `vehicles.lookup` (plate+province) → `vehicles.detail` → `vehicles.update` color WHITE→**BLACK** (version 1→2, optimistic `expectedVersion`) → `vehicles.history` shows the change.
6. **reg — Registry / Change review:** `vehicles.list` shows the 1 approved vehicle; `changes.listPending` empty (no change requests).
7. **staff — QR resolve (`vehicles/qr`):** manual token entry (camera untestable headless) → `qr.resolve` → vehicle; detail shows contact, **edit link hidden** (correct).
8. **sys — QR governance (`admin/qr`):** `qr.replace` (new one-time token shown once) → `qr.revoke` (both tokens now revoked).
9. **owner — My vehicles / password change:** `vehicles.listMine` (empty — owner owns no vehicle yet); `auth.changePassword` → **all sessions revoked** → subsequent `auth.logout` returns `UNAUTHENTICATED` (expected) → UI redirects to `signin?reason=password-changed` → re-login with new password → `auth.session` restore → re-login. Must-change-password redirect to `account/security` verified.
10. **sys — Settings / Audit:** `system.config.update` (value persisted across reload) → `audit.query` (trail of the run's writes) → `audit.export` (JSON download).
11. **sys — User management (`admin/users`):** **created** `p6vc_e2e_new` via the create form (`users.create`) → toast "สร้างบัญชีแล้ว ผู้ใช้ต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบ"; then **suspended** it via the manage-account panel + confirmation dialog (`users.suspend`) → toast "ระงับบัญชีและเพิกถอนเซสชันแล้ว", row shows "ระงับการใช้งาน".
12. **worker — minimal menu:** dashboard/connection/account only; `admin/retention` → forbidden (no data disclosed).

## SSOT verification — API OK ≠ data proof (owner directive)

The bridge captures **every successful `:commit`** at the transport and independently re-reads each written/deleted doc through the **Node Firestore SDK** (a second, independent client implementation), decoded with a script-local decoder and compared field-by-field via canonical key-sorted deep-equal (`firestore-node-composition.mjs` `drainAudits()`).

| Audit metric (live `GET /__audit`, final) | Result |
|---|---|
| Writes independently read back | **225** |
| Deletes independently read back absent | 0 |
| **Audit failures** | **0** |
| Bridge requests dispatched | 107 |

**Explicit read-back of the UI-created account** (`test-results/frontend-e2e/readback-new-user.mjs`, direct SDK query, sanitized — hash/salt never printed):

- After `users.create`: `vc_users` exactly 1 match — `username_normalized=p6vc_e2e_new`, `display_name="E2E New User"`, `password_change_required=true`, `status=ACTIVE`, `org_id=""`; `password_hash`+`password_salt` present; `vc_user_roles` default `STAFF`/ACTIVE. Matches the UI toast.
- After `users.suspend`: same doc `status=SUSPENDED`, `updated_at` advanced. Matches the UI row + toast.

## Latency (per UI-triggered API dispatch, Node → Bangkok Firestore, warm indexes)

From the bridge per-request log (87 OK dispatches in the snapshot; same path as #69 — each dispatch includes its SA OAuth exchange + PBKDF2 for auth ops). Representative p50/max ms:

| Operation | n | p50 ms | max ms |
|---|---|---|---|
| auth.login | 9 | 2752 | 7384 |
| auth.session | 9 | 412 | 744 |
| auth.changePassword | 2 | 2894 | 3380 |
| photos.upload | 5 | 516 | 924 |
| registrations.submit | 1 | 2103 | 2103 |
| registrations.review | 1 | 3425 | 3425 |
| registrations.photo | 5 | 759 | 891 |
| vehicles.lookup | 1 | 1588 | 1588 |
| vehicles.detail | 5 | 1632 | 1843 |
| vehicles.update | 1 | 1092 | 1092 |
| vehicles.history | 5 | 485 | 728 |
| vehicles.list | 2 | 1230 | 1546 |
| qr.resolve | 1 | 1868 | 1868 |
| qr.replace | 1 | 2210 | 2210 |
| qr.revoke | 1 | 2657 | 2657 |
| organizations.create | 1 | 1544 | 1544 |
| campaigns.create | 2 | 921 | 1500 |
| system.config.update | 1 | 1319 | 1319 |
| audit.query | 1 | 919 | 919 |
| users.list | 1 | 1316 | 1316 |
| system.health | 9 | 0 | 0 |

Read-heavy list/detail ops ~0.4–1.8 s; write-heavy multi-table ops (review, QR replace/revoke, password change) ~2–3.4 s; auth dominated by PBKDF2 (150k iterations). **Node-path numbers** — GAS `UrlFetchApp` adds its own overhead; GAS-runtime Firestore mode still requires `PUSH_VEHICLE_GAS` + the backend flag, cutover gated on #55.

## Negative paths logged (all expected — not functional bugs)

13 non-OK dispatches in the snapshot, every one an intended negative or a self-inflicted probe:

- **FORBIDDEN ×8** — RBAC fail-closed (worker→retention, staff→update, reg→campaigns.manage, role-scoped references). Correct.
- **UNAUTHENTICATED ×2** — `auth.logout` after `auth.changePassword` revoked all sessions. Expected; UI handles gracefully.
- **CAMPAIGN_INVALID ×1** — first campaign had a future `startsAt`; re-created with a current window. Correct validation.
- **BAD_REQUEST ×2** — my own console fetch probes omitted `apiVersion:'v1'` (envelope gate). Harmless; fixed probes. Not a UI defect.

## Findings / follow-ups

- **Cosmetic timezone display inconsistency (non-blocking):** the session-expiry label rendered "08:0x" while the server/audit clock was "00:0x" (Bangkok). Likely a double-offset in a display formatter. **Recommend a follow-up ticket**; does not affect auth, expiry enforcement, or data. (Machine `TZ=Asia/Bangkok date` in Git Bash also shows a wrong value — broken local tzdata — so server ISO timestamps are the source of truth.)
- **C5 RETENTION_WORKER execution console not built** (#13 pending): worker has `retention.worker` but no dedicated execution screen yet; `retention.listExecutable`/`execute` are proven at the API layer (#69), not via a worker UI.
- **Camera QR scan untestable headless:** used the manual-token fallback (`qr.resolve`); physical-device camera acceptance remains an owner gate.

## Honest boundaries

- This exercised the **real application on live Firestore DEV via the local Node sync-fetch bridge** — **NOT the GAS V8 runtime**. The deployed GAS web app still runs **Sheets V50/0.9.2**; Firestore mode is merged-but-unwired and gated on `PUSH_VEHICLE_GAS` + #55. No GAS push happened in this run.
- **Screenshots unavailable** (in-app browser surface hidden → `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`); evidence is DOM extraction (`evaluate_script`/`take_snapshot`), console logs, and the independent bridge audit — per the browser-use boundary. Visual pixel acceptance is not claimed.
- Reference catalog mode = LEGACY (unseeded DEV) → free-text fields exercised; canonical `SearchableReferenceCombobox` path not exercised here.
- Suspended-login block and other auth negatives are covered by the #69 API suite (72/72); this run proved the suspend **write + read-back** through the UI.

## Reproduce

```bash
# 1. bridge (keep alive; NEVER run the API suite concurrently — shared DEV DB pre-clean)
#    from apps/vehicle-contact/backend/gas, key/project via gitignored .env
P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE node scripts/firestore-frontend-bridge.mjs
# 2. frontend dev server (localhost:5173); in browser localStorage:
#    p6vc-api-transport='worker', p6vc-worker-endpoint='http://127.0.0.1:5178/api/frontend'
# 3. synthetic photos for intake:
node test-results/frontend-e2e/make-photos.mjs
# 4. independent read-back of the UI-created user (sanitized):
P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE node test-results/frontend-e2e/readback-new-user.mjs
# 5. live counters:
curl -s http://127.0.0.1:5178/__audit
```

Frontend change under test: dev-only local-bridge endpoint allowance in `frontend/src/infrastructure/api/gas-api-client.js` (`DEV_LOCAL_BRIDGE_URL` + `import.meta.env.DEV`) — production transport unchanged. Offline: `npm test` pass, `npm run check` exit 0.

## Owner actions (unchanged gates)

- `PUSH_VEHICLE_GAS` per push — **no GAS push happened**; live runtime remains Sheets V50/0.9.2.
- #55 PDPA/security review, publication, ADR ratifications, QR physical-device acceptance remain human-only.
- Optional: open a follow-up ticket for the cosmetic session-expiry timezone display.