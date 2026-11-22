# Firestore cutover & rollback runbook (F3b-3)

**Doc ID:** P6VC-OPS-F3B3-CUTOVER-001 · **Date:** 2026-11-22 (Asia/Bangkok)
**Status:** PROCEDURE READY — every live phase below is **gated**; none may be self-approved (PM plan hard rule). DEV synthetic data only until production gates pass.
**Design authority:** [E1 §5](E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121.md) (D-E1 Option 2 / VC-ADR-019) · **Code:** [F3b-1 dual-write](BACKEND_FIRESTORE_DUALWRITE_F3B1_EVIDENCE_20261122.md), [F3a gateway/selector](BACKEND_FIRESTORE_GATEWAY_F3A_EVIDENCE_20261122.md), backfill engine `backend/gas/scripts/firestore-backfill-engine.mjs` + gated runner `firestore-backfill.mjs`.

## 1. Flag semantics (composition root, Script Properties)

| `VEHICLE_PERSISTENCE_BACKEND` | `VEHICLE_FIRESTORE_DUALWRITE` | Effective store |
|---|---|---|
| unset / `sheets` | unset / not `true` | Sheets only (**live default today**) |
| unset / `sheets` | `true` | Sheets SoR + Firestore shadow (forward dual-write) |
| `firestore` | `true` | Firestore SoR + **Sheets shadow kept warm** (reverse dual-write, rollback window, E1 §5.5) |
| `firestore` | unset / not `true` | Firestore only (mirroring retired) |

Divergence always journals to the **primary's** `vc_operation_journal` (`operation='dualwrite.divergence'`, `status='OPEN'`). Missing shadow credentials fail closed (`STORAGE_NOT_CONFIGURED`). Direction follows the primary — rollback is a flag flip, not a code change.

## 2. Prerequisite gates (ALL required before Phase 1)

- [ ] **#55 new-store PDPA + security review** — human sign-off (data residency Bangkok `asia-southeast3` provisioned; retention/legal_hold semantics re-verified on Firestore).
- [ ] **POC #2 — composite indexes + latency:** every `list/listNewest` with a filter issues `where(field==)+orderBy(_seq)` → needs a composite index per (collection, filter-field, direction). Derive the index set from use-case filters, deploy to DEV, measure p95; record evidence. Unindexed queries fail with FAILED_PRECONDITION — the adapter surfaces the error (fail-closed, no silent scan).
- [ ] **POC #3 — precondition calibration:** confirm live commit behavior for `currentDocument.exists:true` on absent docs (fake assumes 404 NOT_FOUND) and `exists:false` on present docs (409 ALREADY_EXISTS); calibrate gateway error mapping if the live shape differs.
- [ ] **GAS push gate:** owner types `PUSH_VEHICLE_GAS` for the push that ships F3a/F3b code; **publication stays owner-executed**.
- [ ] Snapshot export path chosen (Phase 0) and credentials in gitignored `.env` (key outside repo, `~/.p6vc/`).

## 3. Phases

### Phase 0 — canonical snapshot export (read-only)
Export every in-scope table from Sheets **in row order** to `backend/gas/test-results/snapshot.json` (gitignored):
`{ "marker":"SYNTHETIC_DEV_BACKFILL", "tables": { "<table>":[ {canonical columns…} ] } }`.
Options: (a) browser gviz raw export in the logged-in Sheets session (extends the read-only audit script; values stay local, never committed); (b) editor maintenance export function (requires a gated push). Text semantics preserved — no type coercion. Include `vc_operation_journal` so OPEN divergences are counted.

### Phase 1 — forward dual-write (Sheets stays SoR)
1. Set `VEHICLE_FIRESTORE_DUALWRITE=true` (SA key props already retained from POC #1). Backend stays `sheets`.
2. Run the live API suite. **Verify against persisted data, not API responses** (owner directive): independent Sheets gviz audit + `node scripts/firestore-backfill.mjs --snapshot … --audit` (gate `P6VC_ALLOW_FIRESTORE_BACKFILL=RUN_FIRESTORE_BACKFILL_DEV`).
3. Check `divergenceOpen` in the report; every OPEN entry must be repaired (Phase 2) before cutover.
**Abort criterion:** any SoR write loss, journal growth without explanation, or p95 regression → clear the flag (instant return to Sheets-only).

### Phase 2 — checksum backfill in a QUIESCED window
1. Stop write traffic (DEV: synthetic only; no real users). Concurrent writes during backfill invalidate the read-back compare.
2. `node scripts/firestore-backfill.mjs --snapshot test-results/snapshot.json` — writes docs in primary row order (`_seq=index+1`), deletes extras, resets `__p6vc_seq` counters, then **independently reads back** every collection: per-doc deep-equal + count + sha256 checksum + `_seq` parity. Report: `test-results/firestore-backfill.json` (counters/checksums only).
3. Require `status=PASS`, all `match=true`, `seqParity=true`. Re-run Phase 1 audit until `divergenceOpen=0`.
4. Mark repaired journal entries `REPAIRED` (editor maintenance update; gated push if a new function is needed). Never delete journal rows.

### Phase 3 — cutover (reads+writes to Firestore, Sheets warm)
1. Set `VEHICLE_PERSISTENCE_BACKEND=firestore`, **keep** `VEHICLE_FIRESTORE_DUALWRITE=true` → reverse dual-write keeps Sheets current for rollback.
2. Full live suite + RBAC matrix + fail-closed probes against Firestore; independent read-back audit of BOTH stores after the suite (API OK ≠ data proof).
3. Monitor p95 + quota + divergence journal for the agreed rollback window (owner sets duration; carried from E1 Option-1 monitoring discipline).
4. After the window: clear `VEHICLE_FIRESTORE_DUALWRITE` → Firestore-only. Sheets retained read-only for maintenance/audit until owner approves decommission.

### Rollback (any time during the window)
1. Set `VEHICLE_PERSISTENCE_BACKEND=sheets` (keep dual-write flag → Firestore becomes shadow again). Because reverse dual-write kept Sheets warm, **no committed write is lost**.
2. Reconcile: compare divergence journals both directions; if any OPEN entry touches Sheets, re-export snapshot from Firestore (reverse export) and repair via the backfill engine's audit mode + targeted editor repair.
3. Re-run the live suite + independent Sheets audit; record the incident + resolution as an SSOT doc (owner bug-knowledge directive).

## 4. Honest boundaries

- Cross-store atomicity is **not claimed** at any phase; the guarantee is SoR-first + journal + checksum audit + warm standby.
- The backfill engine targets Firestore; a Firestore→Sheets reverse import (rollback repair beyond warm-standby) is a separate gated tool if ever needed.
- Production volume caps, retention enforcement and the volume/latency cutover-review threshold remain owner decisions (E1 §4/§6).
- Nothing in this runbook has been executed live. Current runtime: Sheets V50/0.9.2, no dual-write flag set.