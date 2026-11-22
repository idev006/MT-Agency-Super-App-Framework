# F3b-1 — Dual-write wrapper + divergence journal (offline evidence)

**Doc ID:** P6VC-BE-F3B1-DUALWRITE-001 · **Date:** 2026-11-22 (Asia/Bangkok)
**Status:** OFFLINE DONE — code + tests merged to source; **NOT pushed to GAS, NOT enabled live.** Runtime stays Sheets V50/0.9.2; no Script Property changed.
**Slice:** F3b-1 of F3 (#53), per [E1 design §5.3](E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121.md) (owner-ratified D-E1 Option 2 / VC-ADR-019).
**Companions:** [F2 adapter](BACKEND_FIRESTORE_ADAPTER_F2_EVIDENCE_20261122.md) · [F3a gateway + selection](BACKEND_FIRESTORE_GATEWAY_F3A_EVIDENCE_20261122.md) · [F4 infra](BACKEND_FIRESTORE_INFRA_F4_EVIDENCE_20261122.md)

## 1. What was built

[DualWriteStore.js](../backend/gas/src/infrastructure/persistence/firestore/DualWriteStore.js) — `createDualWriteStore({primary,secondary,journal,clock})` implements the SAME 8-method store port:

| Port method | Behavior |
|---|---|
| `one` / `list` / `listNewest` / `withLock` | **Primary only** (Sheets = system of record). The shadow is never queried on a read path. |
| `insert` / `update` / `remove` | Primary write first; result returned unchanged. Then **best-effort mirror** to the Firestore shadow. Shadow failure → divergence journal entry; the user operation still succeeds. |
| `sequence(fn)` | `fn` runs on a **capturing proxy** over the primary transaction (reads delegate; writes log `[op,args]` in order). After the primary commits, the log is **replayed to the shadow in capture order**. Primary throw → nothing mirrored, nothing journaled. |

**Divergence journal binding (no schema change):** the production journal writes the existing `vc_operation_journal` table via the primary store — `operation='dualwrite.divergence'`, `entity_id='<table>:<pk-or-filter-json>'`, `status='OPEN'`, `actor_id='SYSTEM'`, `detail_json={op,args,error}`, `created_at`, `event_id=Utilities.getUuid()`. OPEN entries are repaired by the F3b-2 checksum backfill + independent read-back audit before cutover.

**Honest boundary — cross-store atomicity is NOT claimed.** Sheets and Firestore cannot share a transaction. The design is deliberately: SoR write always wins → shadow best-effort → journal divergence → **audit/backfill is the safety net** (it detects divergence even if journaling itself fails; a journal failure is swallowed so it can never break a SoR write). This matches E1 §5.3 "dual-write journal phase … reconcile mismatches before cutover".

## 2. Selection flag ([StoreSelector.js](../backend/gas/src/composition/StoreSelector.js))

| `VEHICLE_PERSISTENCE_BACKEND` | `VEHICLE_FIRESTORE_DUALWRITE` | Result |
|---|---|---|
| unset / `sheets` | unset / not `true` | Plain SheetStore — **live default, zero REST traffic** |
| unset / `sheets` | `true` + SA key | DualWriteStore(Sheets primary, Firestore shadow, journal→primary `vc_operation_journal`) |
| unset / `sheets` | `true`, **no SA key** | **Fail-closed `STORAGE_NOT_CONFIGURED`** (never silently skips the shadow) |
| `firestore` | `true` | **Reverse dual-write** (F3b-2 correction): Firestore primary + Sheets shadow kept warm for the rollback window (E1 §5.5); journal→primary |
| `firestore` | unset / not `true` | Plain FirestoreStore — mirroring retired |
| unknown | any | `UNKNOWN_PERSISTENCE_BACKEND:<v>` (unchanged from F3a) |

> **Correction (F3b-2, same source tree):** the original F3b-1 selector retired the flag at `backend=firestore`. That would stop Sheets writes at cutover and lose data on rollback, contradicting E1 §5.5 ("keep Sheets writes for rollback window"). The flag now means "mirror to the standby engine"; direction follows the primary. DW-10 updated (cleared flag retires mirroring) and DW-12 added (reverse dual-write warms Sheets; reverse divergence journals to the Firestore primary). See [F3b-2 evidence](BACKEND_FIRESTORE_BACKFILL_F3B2_EVIDENCE_20261122.md) and the [cutover/rollback runbook](FIRESTORE_CUTOVER_ROLLBACK_RUNBOOK.md).

Only the runtime dispatch store is wrapped; schema/migration/seed maintenance paths stay Sheets-bound.

## 3. Bugs found & fixed (SSOT knowledge directive)

- **B1 — `SheetStore.sequence(fn)` calls `fn()` with NO transaction argument** (FirestoreStore passes a tx-scoped store). A capturing proxy that assumed a tx object crashed on reads inside `fn` when the primary was Sheets. **Fix:** proxy falls back to `primary` when no tx is supplied (`const base=tx||primary`). Regression test DW-08. **Best practice:** adapter-agnostic wrappers must probe each engine's `sequence` calling convention, not assume the richer one.
- **B2 (design decision, recorded):** journal-record failure inside the mirror catch is swallowed — failing the user operation *after* the SoR committed would be worse than an unjournaled divergence, and the independent backfill read-back audit still detects it (owner verification directive: API OK ≠ data proof). DW-07 pins this behavior.

## 4. Test matrix — [dual-write.test.mjs](../backend/gas/tests/dual-write.test.mjs) (11 new + 2 imported contract = 13/13)

| ID | Proof |
|---|---|
| DW-01 | Reads + `withLock` never touch the shadow (request/token counters frozen) |
| DW-02 | insert/update/remove mirror; shadow canonical fields deep-equal SoR; primary results returned |
| DW-03 | Shadow 503 → journal OPEN entry (op/entity/error/detail); SoR write + result survive |
| DW-04 | `sequence` replays only AFTER primary commit (shadow empty inside fn), in capture order (`_seq` 1,2); read-your-writes on primary tx |
| DW-05 | Primary sequence throw → zero shadow traffic, zero journal |
| DW-06 | Shadow failure mid-replay → divergence journaled; primary commit + result intact |
| DW-07 | Journal failure swallowed; SoR write unaffected (audit backstop) |
| DW-08 | Sheets-primary `sequence` (no tx arg) captures + replays (B1 regression) |
| DW-09 | Selector dual-write mode writes BOTH stores; divergence lands in `vc_operation_journal` sheet (SYSTEM actor, event_id); missing key fail-closed; flag unset → zero REST |
| DW-10 | **Container dispatch** (`auth.login`) in dual-write mode reaches both stores (failed-attempt event in Sheets AND mirrored doc); cleared flag at `backend=firestore` retires mirroring (Sheets opens frozen) |
| DW-11 | Wrapper passes the **identical F1 store-port contract** (`runStorePortContract`) with a healthy shadow — drop-in guarantee preserved |

**Full GAS `npm run check`: EXIT 0** — 213/213 node-test assertions, 0 failures across all suites; bundle **61 .gs modules** (+1 DualWriteStore); GAS-VM-00…03 editor-VM probes PASS; api-wiring guard extended with `createDualWriteStore` + `VEHICLE_FIRESTORE_DUALWRITE`.

## 5. Known limitations / carried gates (NOT self-approved)

1. **`_seq` ordering parity:** the shadow's monotonic counter reflects *mirror arrival order*, which equals primary order only while no divergence occurred. After any OPEN divergence, ordering can drift → **F3b-2 backfill re-seeds collections in primary order** and the read-back audit verifies counts + checksums before cutover.
2. **Live dual-write is gated:** requires `PUSH_VEHICLE_GAS` (per-push owner phrase), Script Properties (`VEHICLE_FIRESTORE_DUALWRITE=true` + SA key already retained from POC #1), **#55 new-store PDPA/security human gate**, and POC #2 composite-index/latency proof for multi-field filters.
3. **Update/remove on a diverged shadow** throw NOT_FOUND → journaled (not silently skipped); repair is backfill/audit, exactly per E1 §5.3.
4. Cutover/rollback procedure = **F3b-3 runbook** (next slice); backfill + independent Firestore read-back audit tool = **F3b-2** (Node SDK, independent of the GAS gateway, per owner verification directive).

## 6. Reproduce

```bash
cd apps/vehicle-contact/backend/gas
node --test tests/dual-write.test.mjs   # 13/13
npm run check                           # EXIT 0, 213/213, 61 modules
```

No credentials, no network, no GAS push. Live runtime untouched (V50/0.9.2, Sheets SoR).