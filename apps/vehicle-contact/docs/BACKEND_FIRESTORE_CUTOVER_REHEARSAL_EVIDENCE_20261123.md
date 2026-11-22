# BACKEND — Firestore integration test + synthetic-DEV cutover rehearsal

- Doc ID: P6VC-BE-FS-REHEARSAL-001 · Date: 2026-11-23 (Asia/Bangkok)
- Status: **PASS — synthetic DEV only. NOT a production cutover.** Live runtime remains **Sheets V50 / 0.9.2**; no GAS push, no publication, no Script-Property flip, no real personal data.
- Trigger: owner instruction "เปลี่ยนเป็น Firestore แล้วทำ integrate test" (chat 2026-11-23). Executed in the safe autonomous scope: the real application on **Firestore DEV (Bangkok)** via the Node bridge + a live **Phase 0 → Phase 2** migration rehearsal on the current synthetic Sheets data.
- Design authority: [E1 §5](E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121.md) (VC-ADR-019) · Procedure: [FIRESTORE_CUTOVER_ROLLBACK_RUNBOOK](FIRESTORE_CUTOVER_ROLLBACK_RUNBOOK.md) · Gates: [#55 dossier](FIRESTORE_NEW_STORE_PDPA_SECURITY_REVIEW_55_20261123.md).
- Reports (gitignored, sanitized — counters/checksums only): `test-results/firestore-live-api-suite.json`, `test-results/firestore-backfill.json`, `test-results/snapshot.json`.

## 1. Integration suite re-run on merged `main` (`f8648c1`)

The **real application** (`Container → StoreSelector → FirestoreStore → F3a GAS REST gateway`) ran in Node over the keep-alive sync-fetch bridge, driven by the shared `createRegressionCases()` source. Gate `P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE`.

| Metric | Result |
|---|---|
| Tests | **72/72 PASS** |
| Inventory operations covered | **56/56** (0 missing) |
| Commits captured / writes read back / deletes read back absent | 322 / **302** / **4** |
| **Independent audit failures** | **0** |
| Final whole-store audit (SDK `count()` vs store-port `list`) | **25/25 match** |
| Cleanup read-back residue | **0** across 26 collections |
| Wall time (warm indexes) | 104 s |
| Latency per dispatch (n=91) | p50 **694.6 ms** · p95 **2782.7 ms** · max 3476.4 ms · mean 944 ms |

Every committed write was independently re-read through the Node Firestore SDK (a second client), decoded with a script-local decoder, and compared field-by-field (canonical key-sorted deep-equal); deletes must read back absent. **API `OK` ≠ data proof** (owner directive) honored throughout.

## 2. Phase 0 — canonical snapshot export (read-only)

Exported the **current live synthetic Sheets** SSOT via read-only `gviz` CSV in the logged-in Sheets session (runbook Phase 0 option a). A local loopback receiver (`127.0.0.1:5179`, gitignored helper) wrote the snapshot straight to `test-results/snapshot.json` so **secret-bearing values (password hashes, token digests, synthetic PII) never passed through the agent context** — only counters were returned.

- **25/25 tables**, **2,260 rows**, every header matched the schema mirror, 0 fetch failures.
- Marker `SYNTHETIC_DEV_BACKFILL`; text semantics preserved (no type coercion). Snapshot gitignored (1.05 MB), never committed.

## 3. Phase 2 — checksum backfill rehearsal + independent read-back

`node scripts/firestore-backfill.mjs --snapshot test-results/snapshot.json` (gate `P6VC_ALLOW_FIRESTORE_BACKFILL=RUN_FIRESTORE_BACKFILL_DEV`). Writes docs in primary row order (`_seq=index+1`), deletes extras, resets `__p6vc_seq` counters, then **independently reads back** every collection via the Node SDK: per-doc deep-equal + count + **sha256 checksum** + `_seq` parity. **First live backfill ever executed** (prior runs were offline-fake or gate-blocked).

| Table | Rows | match | seqParity | | Table | Rows | match | seqParity |
|---|---|---|---|---|---|---|---|---|
| vc_vehicles | 37 | ✓ | ✓ | | vc_registration_requests | 38 | ✓ | ✓ |
| vc_vehicle_contacts | 37 | ✓ | ✓ | | vc_change_requests | 6 | ✓ | ✓ |
| vc_qr_tokens | 59 | ✓ | ✓ | | vc_retention_jobs | 27 | ✓ | ✓ |
| vc_vehicle_photos | 185 | ✓ | ✓ | | vc_settings | 2 | ✓ | ✓ |
| vc_lookup_audit | 116 | ✓ | ✓ | | vc_photo_staging | 190 | ✓ | ✓ |
| vc_change_audit | 403 | ✓ | ✓ | | vc_idempotency | 38 | ✓ | ✓ |
| vc_users | 30 | ✓ | ✓ | | vc_operation_journal | 43 | ✓ | ✓ |
| vc_user_roles | 31 | ✓ | ✓ | | vc_migration_journal | 2 | ✓ | ✓ |
| vc_sessions | 168 | ✓ | ✓ | | vc_reference_values | 645 | ✓ | ✓ |
| vc_organizations | 11 | ✓ | ✓ | | vc_security_events | 180 | ✓ | ✓ |
| vc_campaigns | 12 | ✓ | ✓ | | vc_user_identities / vc_roles / vc_role_permissions / vc_user_permissions | 0 | ✓ | ✓ |

**Result: `status=PASS`, 25/25 `match=true`, 25/25 `seqParity=true`, `divergenceOpen=0`** (11 s). Empty role sheets are by design (frozen code catalog `ROLE_PERMISSIONS`).

**Independent audit-mode re-read** (`--audit`, never writes): `status=PASS`, **25/25 `match=true`**, `divergenceOpen=0` (4 s) — confirms the imported data is stable and checksum-identical to the Sheets source on a second independent pass.

## 4. Rehearsal cleanup

Removed all backfilled synthetic docs from Firestore DEV (gated helper), then read back zero: **deleted 2,285** (2,260 rows + 25 counter docs), **residue 0 across 26 collections**. Firestore DEV returned to its prior empty state; Sheets was never mutated (read-only export only).

## 5. What this proves — and honest boundaries

**Proves:** the F3b-2 migration mechanic works **live on Firestore DEV with the real current synthetic data** — canonical export → ordered checksum backfill → independent sha256 read-back → seq-parity → clean extras-delete/counter-reset, plus the full real API/use-case pipeline on Firestore (72/72). This de-risks runbook Phases 0 and 2 before any production cutover.

**Does NOT prove / NOT done:**
- **Node bridge ≠ GAS V8 runtime.** `UrlFetchApp` overhead and GAS-runtime Firestore mode are unmeasured here; that needs a GAS push.
- **Phases 1 and 3 NOT executed live:** forward/reverse **dual-write** and the **`VEHICLE_PERSISTENCE_BACKEND=firestore` selector flip on the live GAS deployment** require shipping F3a/F3b to GAS. **Live V50 does not contain F3a/F3b** (merged after the V50 push), so a production cutover requires `PUSH_VEHICLE_GAS` + owner publication. No Script Property was changed.
- **Live runtime is still Sheets V50 / 0.9.2.** This rehearsal touched only Firestore DEV (synthetic) and read-only Sheets.
- **Cross-store atomicity is not claimed** at any phase (SoR-first + journal + checksum audit + warm standby).
- `gviz` export carries **display-value semantics**; a production Phase 0 must confirm text fidelity for typed columns before a real cutover.
- **Real-data go-live remains BLOCKED** — see §6.

## 6. Owner instruction record + held compliance line (honest)

Owner stated (chat 2026-11-23): **"-PDPA real-data go-live gate // อนุมัติเสมอ -เปลี่ยนเป็น Firestore แล้วทำ integrate test"**.

Recorded honestly, **without marking any gate approved**:
- The blanket "อนุมัติเสมอ" (always approve) is **owner intent**, but it **does NOT satisfy the PDPA real-data go-live gate**. That gate requires **named legal-counsel + DPO sign-off** plus completed retention numbers, lawful basis, ROPA, notices, consent, cloud-transfer assessment and breach SOP ([release gate](PDPA_DATA_RETENTION_AND_RELEASE_GATE.md): "ฝ่ายกฎหมายและ DPO ลงนามทวนสอบผล"; "ร่างครบเพื่อเข้าสู่กระบวนการอนุมัติ ไม่ใช่หลักฐานการได้รับการอนุมัติ"). Per the PM plan hard rule **"None may be self-approved by an assistant"**, neither the assistant nor a blanket owner statement substitutes the formal compliance review. **Real-data go-live stays BLOCKED.**
- The system currently holds **only synthetic DEV fixtures** (ฑฆ1000–1009 + test entities); **no real citizen personal data exists or was processed**. The binding "ห้ามข้อมูลจริง" rule remains in force.
- The assistant therefore executed only the **synthetic-DEV** integration test + migration rehearsal (this doc), which is engineering verification within granted autonomy — **not** a production cutover and **not** real-data operation.
- `#55` new-store review and the production cutover gates remain **OPEN** (§8). This document is evidence, not an approval.

## 7. Reproduce

```bash
# from apps/vehicle-contact/backend/gas (key/project via gitignored .env, key OUTSIDE repo)
# 1) integration suite on Firestore DEV
P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE node scripts/firestore-live-api-suite.mjs
# 2) Phase 0 export: logged-in Sheets page → read-only gviz → loopback receiver → test-results/snapshot.json
#    (helper: test-results/snapshot-receiver.mjs; browser export mirrors sheets-data-audit.browser.js schema)
# 3) Phase 2 backfill + independent checksum read-back
P6VC_ALLOW_FIRESTORE_BACKFILL=RUN_FIRESTORE_BACKFILL_DEV node scripts/firestore-backfill.mjs --snapshot test-results/snapshot.json
P6VC_ALLOW_FIRESTORE_BACKFILL=RUN_FIRESTORE_BACKFILL_DEV node scripts/firestore-backfill.mjs --snapshot test-results/snapshot.json --audit
# 4) rehearsal cleanup (Firestore DEV → empty, read-back residue 0)
P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE node test-results/firestore-rehearsal-cleanup.mjs
```

## 8. Owner gates outstanding (unchanged — human-only)

- **`PUSH_VEHICLE_GAS`** exact phrase for the push that ships F3a/F3b to GAS (live V50 lacks them) — **not yet given**.
- **Publication** of the new GAS version (owner-executed, or `approve` for the clasp self-deploy path per V50 precedent).
- **#55 new-store PDPA/security sign-off** (named reviewer) for the synthetic-DEV engine cutover.
- **PDPA real-data go-live**: formal **legal + DPO** sign-off + completed compliance pack — blanket approval does not substitute.
- Script-Property flip (`VEHICLE_PERSISTENCE_BACKEND` / `VEHICLE_FIRESTORE_DUALWRITE`) + runbook Phases 1/3 + owner-set rollback window — only after the above.
- D3/D5/B3 + VC-ADR-014/015/017 ratifications, E3 four sign-offs, physical QR-device acceptance, SA-key rotation, production Firestore provisioning.