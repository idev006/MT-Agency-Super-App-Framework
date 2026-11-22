# F3b-2/F3b-3 — Checksum backfill + independent read-back audit + reverse dual-write + cutover runbook (offline evidence)

**Doc ID:** P6VC-BE-F3B2-BACKFILL-001 · **Date:** 2026-11-22 (Asia/Bangkok)
**Status:** OFFLINE DONE — **NOT executed live, NOT pushed to GAS.** Runtime stays Sheets V50/0.9.2; no Script Property changed.
**Slice:** F3b-2 + F3b-3 of F3 (#53), [E1 design §5.4–5.6](E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121.md). Completes the F3b code surface; live execution remains gated ([runbook](FIRESTORE_CUTOVER_ROLLBACK_RUNBOOK.md)).

## 1. Backfill engine + gated runner

- [firestore-backfill-engine.mjs](../backend/gas/scripts/firestore-backfill-engine.mjs) — `runBackfill({db,snapshot,mode})`, injected db (Node SDK live, contract-faithful fake offline):
  - **Fail-closed validation before any write:** DEV marker `SYNTHETIC_DEV_BACKFILL`, known tables, primary key present/unique, required fields, mode ∈ {backfill, audit}.
  - **Checksum discipline (reused from seed apply):** sha256 over rows sorted by primary key, each row canonicalized with sorted keys — type-sensitive, text-preserving.
  - **Primary-order reseed:** `_seq=index+1` in snapshot (Sheets row) order; extras deleted; `__p6vc_seq` counter reset to row count so dual-write ordering continuity is restored after divergence repair.
  - **Independent read-back audit (owner directive: API OK ≠ data proof):** re-reads every collection from the store — per-doc deep-equal, counts, missing/extras, recomputed checksum, `_seq` parity. Write results are never trusted. `audit` mode performs zero writes (used after live suites).
  - **Batching:** ≤500 ops per commit (Firestore limit).
  - Reports OPEN `dualwrite.divergence` count from the snapshot journal; sanitized report (counters + checksums only) to gitignored `test-results/firestore-backfill.json`.
- [firestore-backfill.mjs](../backend/gas/scripts/firestore-backfill.mjs) — live runner, double-gated: env phrase `P6VC_ALLOW_FIRESTORE_BACKFILL=RUN_FIRESTORE_BACKFILL_DEV` **and** snapshot marker; credential file must live outside the repo; Node SDK `preferRest:true` — **independent of the GAS REST gateway**. No secret/row content ever printed.

## 2. Reverse dual-write (rollback-window correction)

E1 §5.5 requires "keep Sheets writes for rollback window". The original F3b-1 selector retired the dual-write flag at `backend=firestore`, which would stop Sheets writes at cutover and **lose data on rollback**. Corrected in [StoreSelector.js](../backend/gas/src/composition/StoreSelector.js): the flag now mirrors to the **standby engine**, direction follows the primary — `firestore` + flag → Firestore SoR + warm Sheets shadow; divergence journals to the primary. Rollback = flip `VEHICLE_PERSISTENCE_BACKEND=sheets`; no committed write is lost. [F3b-1 evidence](BACKEND_FIRESTORE_DUALWRITE_F3B1_EVIDENCE_20261122.md) carries the correction note (SSOT honesty).

## 3. Test matrix — [firestore-backfill.test.mjs](../backend/gas/tests/firestore-backfill.test.mjs) (8/8) + dual-write additions

| ID | Proof |
|---|---|
| BF-01 | Backfill writes `_seq` in snapshot order, resets counter, read-back checksums match source |
| BF-02 | Audit mode: zero writes/commits, independent verification |
| BF-03 | Divergence repair: stale doc overwritten, extra deleted, counter reset |
| BF-04 | Tampered persisted data → read-back FAIL (checksum mismatch) — write success never trusted |
| BF-05 | Invalid snapshots (unknown table, empty/duplicate/missing pk, missing required, missing marker, bad mode) fail closed with **zero writes** |
| BF-06 | 1200 rows → ≥3 batches, all ≤500 ops |
| BF-07 | OPEN divergence counted from snapshot journal (REPAIRED/APPLIED excluded) |
| BF-08 | Live runner exits 1 `BLOCKED_CONFIG` without the gate phrase (spawned subprocess, no network) |
| DW-10 (updated) | Cleared flag retires mirroring at cutover |
| DW-12 (new) | **Reverse dual-write** Container dispatch warms Sheets after cutover; shadow outage → primary write survives + divergence journaled to the **Firestore primary** |

**Full GAS `npm run check`: EXIT 0** (see §5); SSOT validators 0 errors.

## 4. Cutover/rollback runbook (F3b-3)

[FIRESTORE_CUTOVER_ROLLBACK_RUNBOOK.md](FIRESTORE_CUTOVER_ROLLBACK_RUNBOOK.md): flag semantics, prerequisite gates (#55 PDPA/security, POC #2 composite indexes + p95, POC #3 precondition calibration, per-push `PUSH_VEHICLE_GAS`, owner publication), Phase 0 snapshot export → Phase 1 forward dual-write + dual-store audits → Phase 2 quiesced-window checksum backfill → Phase 3 cutover with warm Sheets + monitoring window → rollback procedure. Abort criteria and honest boundaries (no cross-store atomicity claim; reverse Firestore→Sheets import is a separate gated tool if ever needed).

## 5. Verification

```bash
cd apps/vehicle-contact/backend/gas
node --test tests/firestore-backfill.test.mjs   # 8/8
node --test tests/dual-write.test.mjs           # 14/14 (12 DW + 2 imported contract)
npm run check                                   # EXIT 0
```

## 6. Gates still OPEN (not self-approved)

#55 new-store PDPA/security · POC #2 composite indexes/latency · POC #3 live precondition calibration · `PUSH_VEHICLE_GAS` per push · publication owner-executed · production provisioning + volume caps (E1 §6) · pepper rotation decision.