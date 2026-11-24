# P6VC — SSOT-verified automated test suite design (backend + API engine)

**Date:** 2026-11-24 · **Owner direction:** "ทุกอย่างอย่าเชื่อ api รายงาน ให้ไปตรวจสอบที่ SSOT เช่น ฐานข้อมูล และแหล่งเก็บไฟล์ (เช่น ภาพ)" · "โปรแกรมถ้าทำงานไม่ถูกต้อง ไม่มีประสิทธิภาพก็เป็นเพียงขยะ".
Extends [TEST_AUTOMATION_INTEGRATION_DESIGN_20261123.md](TEST_AUTOMATION_INTEGRATION_DESIGN_20261123.md) (G1–G8, VC-ADR-024).

## 1. Principles (binding)

1. **API OK is never proof.** Every write scenario is verified by an independent read of the SSOTs: **Firestore** (data) and **Google Drive** (photo files). The verifier uses its own credentials and code path, never the API.
2. **Correctness before speed.** A scenario fails on any data mismatch, even when every API call returned OK. The G7 incident is the proof case: 4/4 OK responses, but the request row had been deleted.
3. **Concurrency is first-class.** Firestore has no locking here (`withLock` is a no-op). Every multi-write use case gets a live race scenario.
4. **Synthetic DEV only.** Exact env gates, sanitized reports (ids/counters/codes only) in gitignored `test-results/`, cleanup through the API lifecycle, and residue checked in the SSOT.
5. **Resilient runners.** A client-side network drop must not be confused with a product defect. The run records `NO_RESPONSE` separately and states it in the report.

## 2. Layers

| Layer | What | Where | SSOT check | State |
|---|---|---|---|---|
| L0 Contract | envelope, routes, inventory 56 ops, permission map, bundle shape, no-Sheets bundle | offline | — | DONE |
| L1 Use-case | 5-role acceptance, journals, failures, atomic commit, strict-index fake, race interleavings (G7-RACE-01) | offline (harness + fake REST) | fake store read-back | DONE |
| L2 Compiled bundle | real `dist/*.gs` in a VM: login → protected op → logout → token rejected | offline VM + fake Firestore | fake read-back | DONE |
| L3 Live inventory | 56/56 ops × 5 roles (G6, 103 cases) | live GAS + Worker | **Firestore DATA_PROOF** | DONE |
| L4 Live file proof | each photo `storage_ref` exists in Drive, is not trashed, right folder/MIME/size; orphan inventory | GAS editor `verifyDrivePhotosFromEditor` (owner session, DriveApp) | **Drive** | **DONE (2026-11-24, evidence §5.12)** |
| L5 Live concurrency | C1 same-key submit · C2 approve race · C3 same plate · C4 approve-vs-reject · C5 quota at capacity · C6 change-request version race | live | Firestore | C1–C5 PASS on V61 (2 defects found + fixed); C6 NEW |
| L6 Live security negatives | RBAC deny sample per role · revoked/logged-out token · password change revokes other sessions · suspended user · QR revoked token | live | Firestore (sessions/QR status) | S1–S5 PASS on V61 |
| L7 Resilience | runner retry/`NO_RESPONSE` classification; GAS 6-min limit behaviour | runners | — | NEW |
| L8 Performance | per-op latency budget + store round-trip regression tests | live + offline | — | DONE (p50/p95 guard, round tests) |
| L9 FE E2E | after the UI/UX redesign: every page × role, checked against Firestore + Drive | browser | Firestore + Drive | after step 3 |

## 3. Test case catalog (new or suspected)

| ID | Scenario | Pass rule (SSOT) | Why I suspect it |
|---|---|---|---|
| C1 | 4× identical submit, same key | 1 request, 1 idempotency row, quota +1, 5 photos CLAIMED, all OK responses carry the same id | **FAILED live on V59 → fixed in 0.9.10 (#164)** |
| C2 | 3× concurrent APPROVE | 1 vehicle, 1 active QR, 5 photos, 1 contact, 1 APPLIED journal; losers see `INVALID_REQUEST_STATE` | relies on create preconditions |
| C3 | same plate, 2 keys, concurrent | observed: 2 pending (known limit) | approval of the 2nd must be blocked (C3b) |
| C3b | approve both pendings from C3 | exactly 1 ACTIVE vehicle for the plate; 2nd → `DUPLICATE_VEHICLE` | duplicate check reads vehicles non-atomically |
| C4 | APPROVE ∥ REJECT same request | final state consistent: either (APPROVED + vehicle) or (REJECTED + no vehicle) | **suspected inconsistency**: no precondition on the request status |
| C5 | N submits, different keys, campaign at capacity-1 | `submitted_count` ≤ max; accepted requests = count delta | read-modify-write quota |
| C6 | 2× change approval on one vehicle version | one wins; vehicle `version` +1 exactly once | optimistic version check |
| S1 | each role calls 3 forbidden ops | `FORBIDDEN`/`UNAUTHENTICATED`; no new rows in Firestore | live deny proof (G4) |
| S2 | logout then reuse token | `UNAUTHENTICATED`; session REVOKED in Firestore | — |
| S3 | change password | other sessions of the user REVOKED in Firestore | uses `revokeUser` |
| S4 | QR revoke then resolve | resolve denied; QR status REVOKED | — |
| S5 | lookup/detail | exactly one `vc_lookup_audit` row per call | audit is a write on a read path |
| D1 | approved vehicle photos | 5 Drive files exist, not trashed, MIME `image/*`, content matches the upload | **untested today** |
| D2 | upload then never submit | staged Drive files are tracked (orphan inventory) | storage leak |
| D3 | `photos.replace` | new file exists; old file trashed or kept as documented | untested |

## 4. Execution plan

1. **Deploy 0.9.10** (owner `PUSH_VEHICLE_GAS`), then G6 + re-run G7. C1 must pass.
2. Extend the G7 runner with C3b, C4, C5, C6 and the security negatives S1–S5 (tooling only; no deploy).
3. After the owner enables the Drive API and shares the folder: add the D1–D3 Drive proof stage to G6.
4. Record every run in `BACKEND_FIRESTORE_LIVE_CUTOVER_EVIDENCE_20261123.md`. Every defect gets a fix, a regression test that fails on the old code, a redeploy and a live re-proof.

## 5. Owner actions

- Type `PUSH_VEHICLE_GAS` for 0.9.10 (G7 fix).
- **Enable "Google Drive API"** in the Firestore GCP project, then **share the photos folder (Viewer)** with the service-account email from the DEV key. Without these two steps the Drive SSOT check (L4) cannot run independently.
