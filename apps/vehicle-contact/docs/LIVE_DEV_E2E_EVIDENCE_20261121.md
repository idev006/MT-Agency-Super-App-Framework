# P6 Vehicle Contact — Live DEV E2E evidence (A2 approval 10/10 + A3 full regression)

**Date:** 2026-11-21 (Asia/Bangkok) | **Scope:** live authenticated DEV E2E through the Cloudflare Worker gateway → published GAS Web App.
**Classification:** LIVE DEV SYNTHETIC EVIDENCE. Synthetic records only; **not** production security, PDPA, UAT or release approval. Credentials were supplied out-of-band by the Project Owner and used **only via environment variables** — never written to source, docs, Issues, logs or this report.

This closes milestone **M0 / slice A2** (approval journey 10/10) and **M1 / slice A3** (live E2E of the three 0.9.0 scoped operations + full 55-operation regression) in the [Project Management Plan](PROJECT_MANAGEMENT_PLAN_20261121.md). It is the live-authenticated counterpart of the source/CI evidence in [Backend 0.9.0 scoped operations](BACKEND_SCOPED_OPS_0_9_0_EVIDENCE_20261121.md).

## 1. Runtime baseline at time of run

| Component | State | Probe |
|---|---|---|
| GAS Web App | published **Version 37** — functionally **0.9.0** (3 scoped ops present) | `system.health` via Worker returned `backendVersion: "0.8.1"` (stale marker) |
| Health marker | **0.8.1** — V38 (marker fix, PR #91) pushed but **not yet published** by owner (slice A1) | functional 0.9.0 proven independently by the live regression below |
| Cloudflare Worker | assistant self-deployed; Origin-locked to `https://idev006.github.io`; `/api/frontend` envelope | all calls below went through the Worker, not GAS direct |
| Backend source | `main` @ `11093ca` (B1 #93 + B4 #94 merged); GAS source Version 38 from `3646e39` | B1/B4 source pushed in a later batch, awaiting next owner `PUSH_VEHICLE_GAS` |

**Marker-drift lesson reaffirmed:** health `backendVersion` is a hardcoded literal in `SystemGroup.js`, separate from `package.json`. V37 serves functional 0.9.0 yet health reads 0.8.1 until V38 is published. The permanent guard (`contract.test.mjs`: `health.backendVersion === package.json version`) is merged; **owner must publish V38** for the health probe to read 0.9.0. A behavior change must bump the health literal together with `package.json`, and a publication must be verified with **both** a health probe and a functional probe of a changed route.

## 2. A2 — approval journey E2E (10/10)

Harness: [`scripts/run-live-approval-e2e.mjs`](../backend/gas/scripts/run-live-approval-e2e.mjs) (owner-dev write guard, env-only credentials, sanitized report). Run window `08:09:44Z → 08:16:49Z` (~7 min, ~80 sequential Worker calls).

**Pre-run ground truth (read-only inspection):** 8 registrations `PENDING_APPROVAL` (`ฑฆ9903`–`ฑฆ9910`); 2 already `APPROVED` pre-fix (`ฑฆ9901`, `ฑฆ9902`) and **lookup-able** despite coerced `province_code`.

**Flow per pending request:** `registrations.detail` → `registrations.photo` (FRONT) → `registrations.review` (APPROVE, `platePhotoVerified:true`) → `vehicles.lookup` → `qr.resolve`. All 8 approved; each photo read returned the FRONT snapshot (`image/png`, base64 length 108), each lookup returned `contacts:1, photos:5`, each QR resolved to the matching `vehicleId`.

**Full original batch verified = 10/10** (pre-approved + newly approved), each `vehicles.lookup` found and a **fresh** `qr.replace` → `qr.resolve` returned `MATCH`:

| Plate | province_code (persisted) | lookup found | QR resolve |
|---|---|---|---|
| ฑฆ9901 | `10` (legacy coerced) | ✅ | MATCH |
| ฑฆ9902 | `50` (legacy coerced) | ✅ | MATCH |
| ฑฆ9903 | `30` | ✅ | MATCH |
| ฑฆ9904 | `40` | ✅ | MATCH |
| ฑฆ9905 | `20` | ✅ | MATCH |
| ฑฆ9906 | `11` | ✅ | MATCH |
| ฑฆ9907 | `12` | ✅ | MATCH |
| ฑฆ9908 | `13` | ✅ | MATCH |
| ฑฆ9909 | `14` | ✅ | MATCH |
| ฑฆ9910 | `15` | ✅ | MATCH |

**Negatives (both PASS):**

| Case | Expected | Actual |
|---|---|---|
| Re-review an already-approved request | `INVALID_REQUEST_STATE` | `INVALID_REQUEST_STATE` ✅ |
| Photo from a foreign request snapshot | `PHOTO_NOT_FOUND` | `PHOTO_NOT_FOUND` ✅ |

Session logged out (`revoked:true`). Result: **`A2_APPROVAL_E2E_PASS_10_OF_10`**.

**Finding — legacy coerced province needs no data repair for lookup:** `ฑฆ9901`/`ฑฆ9902` were written before the text-preserving fix (PR #86), so `province_code` persisted as a number (`10`/`50`). The tolerant read (PR #87) makes `vehicles.lookup` resolve them correctly. The original pre-fix QR tokens were lost, so verification used `qr.replace` to mint a fresh token and `qr.resolve` to confirm — **no destructive data repair was required**. Best practice: text-preserving per-cell writes prevent new coercion; tolerant reads absorb legacy coerced rows; never assume a numeric-looking text column survived `USER_ENTERED` unchanged.

## 3. A3 — full live regression (70/70, 55/55 operations)

Harness: [`scripts/run-live-owner-dev-regression.mjs`](../backend/gas/scripts/run-live-owner-dev-regression.mjs) (GAS direct, owner-dev write guard, env-only credentials). Final report:

```
FINAL {"status":"PASS","tests":70,"passed":70,"failed":0,"covered":55,"missing":0,"cleanupFailed":0}
```

- **55/55** inventory operations covered, **0 missing** (54 DTO ops + `system.health`).
- All five roles exercised with real sessions: SYSTEM_ADMIN, REGISTRATION_ADMIN, STAFF, OWNER, RETENTION_WORKER — create → assignRoles → login → `mustChangePassword` → changePassword → re-login.
- Full lifecycle: organizations, campaigns (create/validate/revoke), 5-slot photo upload, registration submit + idempotent replay, listPending/detail/photo/review, vehicles lookup/detail/update/history/listMine/cancel, contacts read/update, changes submit/listMine/listPending/review, QR resolve/revoke/issue/replace, photos list/replace, audit query/export, retention listDue/listExecutable/jobStatus + negatives.
- **Three 0.9.0 scoped ops proven live with real sessions:** `vehicles.listMine` (OWNER), `changes.listMine` (OWNER), `retention.listExecutable` (RETENTION_WORKER), plus **FORBIDDEN negatives** (STAFF denied `vehicles.listMine` and `retention.listExecutable`).
- Destructive retention still gated: `retention.execute` → `RETENTION_EXECUTION_DISABLED`; `retention.approve` on a missing job → `RETENTION_NOT_APPROVABLE`.
- **Cleanup all PASS:** campaign revoked, organization disabled, four synthetic users suspended, automation admin logged out. Report `secretsExposed:false`; no passwords, session tokens or raw QR tokens in the report.

## 4. Gateway contract observations (best practice for E2E harnesses)

- Worker `/api/frontend` requires `requestId` matching `/^[A-Za-z0-9_-]{8,80}$/` (a short id like `"probe"` → `INVALID_REQUEST_ID`); Origin must be the locked frontend origin; public ops (`auth.login`, `system.health`) must **not** carry a `sessionToken`.
- `audit.query` `limit` max is **100** (`200` → `INVALID_LIMIT`). Capture pre-approved batch rows from the audit window **before** new writes push them out.
- GAS direct `curl -L` converts POST→GET on the 302 auth redirect and loses the body (HTML auth wall); the Worker `fetch` path (`content-type: text/plain`, `redirect:follow`, `accept: application/json`) is the reliable probe.
- **Sheets is not an RDBMS (owner directive):** lookup/detail/QR resolve each use a single bounded snapshot with in-memory filtering — **no cross-sheet join**. The live run confirms the approval→lookup→QR journey completes within real-world latency at DEV scale; an indexed store is still required before production volume.

## 5. Security hygiene

- Credentials used **only** via env (`P6VC_ADMIN_USER`/`P6VC_ADMIN_PASS` for A2; `P6VC_TEST_USERNAME`/`P6VC_TEST_PASSWORD` for A3). No credential value appears in any committed file, this doc, or any Issue/comment.
- `.tmp/` (scratch harnesses + results) and `test-results/` (sanitized reports) are **gitignored** (`.gitignore` updated in this slice). Session tokens and QR tokens were memory-only; reports contain synthetic plates, province codes, `vehicleId` hashes and pass/fail flags only.
- Both committed harnesses require the explicit `P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV` guard and create/suspend synthetic records only.

## 6. Reproduce

```bash
# A2 — approval journey via Worker (env-only; guard required)
P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV \
P6VC_WORKER_FRONTEND_URL=https://<worker>/api/frontend \
P6VC_ADMIN_USER=<env> P6VC_ADMIN_PASS=<env> \
node apps/vehicle-contact/backend/gas/scripts/run-live-approval-e2e.mjs

# A3 — full 55-op regression via GAS direct (env-only; guard required)
P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV \
P6VC_GAS_EXEC_URL=https://script.google.com/macros/s/<id>/exec \
P6VC_TEST_USERNAME=<env> P6VC_TEST_PASSWORD=<env> \
node apps/vehicle-contact/backend/gas/scripts/run-live-owner-dev-regression.mjs
```

Reports land in gitignored `test-results/`. Never paste credential values into the command line history, files or logs.

## 7. Remaining gates (owner / human)

- **A1 — publish Web App Version 38** so `system.health` reads `0.9.0` (V37 is already functionally 0.9.0; only the label is stale). Assistant then re-probes health.
- **Browser gallery acceptance** on the synthetic requests (owner signs in to the frontend; capture sanitized browser evidence) — not run here.
- **GAS source push of B1/B4** batched, awaiting next owner `PUSH_VEHICLE_GAS`.
- **Decisions D3–D5** (phase priority, Google identity timing, destructive-retention enable) and **security ratification of VC-ADR-014/015** remain open.
- Frontend slices C1–C5 (`my-vehicles`, change-review, worker console, unified detail) remain NOT_WIRED.
- ENFORCED catalog mode and production security/PDPA/UAT/release approval remain separately gated.