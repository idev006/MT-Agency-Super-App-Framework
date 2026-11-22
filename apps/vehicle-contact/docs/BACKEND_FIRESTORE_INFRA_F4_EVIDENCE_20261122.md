# F4 (infra slice) — Firestore DEV provisioning + service account + connectivity read-back proof

**Date:** 2026-11-22 (Asia/Bangkok)
**Doc ID:** P6VC-BE-F4-INFRA-001
**Slice:** F4 infrastructure provisioning (PM plan lane F, D-E1 Option 2 / [VC-ADR-019](DECISION_LOG.md)). **DEV infra PROVISIONED + connectivity VERIFIED.** This is *not* cutover, *not* backfill, *not* migration approval. The Google Sheets adapter remains the live system of record (**V50 / 0.9.2**, runtime-identical to V49); the [F2 Firestore adapter](BACKEND_FIRESTORE_ADAPTER_F2_EVIDENCE_20261122.md) stays **bundled but UNWIRED** until F3.
**Authorization:** owner explicitly authorized browser Cloud Console provisioning — *"คุณสามารถเปิด browser แล้วเข้าไปที่ could console ได้เลย ผมเปิดบิลไว้แล้ว"* (billing already enabled by owner). Region/project decided by owner: **Bangkok `asia-southeast3`** / project **MT-IAM**.
**Companion:** [E1 datastore migration design](E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121.md), [F2 adapter evidence](BACKEND_FIRESTORE_ADAPTER_F2_EVIDENCE_20261122.md), [Firestore physical mapping](FIRESTORE_PHYSICAL_MAPPING_20261122.md), [F1 store-port contract](../backend/gas/tests/store-port-contract.test.mjs).

## 1. What this slice delivers

Live GCP/Firestore **DEV** infrastructure for the swappable Firestore "black box", plus an end-to-end **connectivity read-back proof** that the provisioned database, least-privilege service account and credentials actually persist data correctly. Per the owner's binding verification directive — *"ทุกครั้งที่คุณ call API ต้องดูผลด้วยว่าข้อมูลลงฐานข้อมูลถูกต้องมั้ย / API OK ≠ data proof"* — every write in the probe is confirmed by an **independent read-back**, not by the write call's return value alone.

No real data, no `ENFORCED` mode, no destructive retention, no schema mutation of the live Sheets system. The probe writes/reads/deletes a single throwaway synthetic document in a dedicated `__p6vc_connectivity_probe` collection and verifies cleanup leaves no residue.

## 2. Provisioned resources (read-back verified)

| Resource | Value | Read-back method |
|---|---|---|
| GCP project | `mt-iam-core-2026` (display **MT-IAM**, number `46858005337`) | Console project selector |
| Billing | **MT-IAM-Billing** (`016662-2AA52D-737263`) — enabled by owner | Billing account linked before DB creation |
| Firestore database | `(default)` — **Standard** edition, **Native** mode | Databases list row read-back |
| Region | **`asia-southeast3` (Bangkok)** — in-country for PDPA residency | Databases list row read-back |
| Security rules | **Restrictive** (deny-all-by-default; service-account REST bypasses rules) | Create-dialog selection + DB settings |
| Encryption | **Google-managed** | Databases list row read-back |
| Service account | `p6vc-firestore-dev@mt-iam-core-2026.iam.gserviceaccount.com` | Service-accounts list row (Enabled) |
| SA unique / OAuth2 client ID | `101844114672390509403` | SA details page |
| IAM role | **Cloud Datastore User** (`roles/datastore.user`) — least-privilege data read/write | **IAM page → View by principals** read-back |
| Key | JSON, `private_key_id` `ff6ea088664e153530ed289861e84b88de15b72c` | Keys list + downloaded-file metadata parse |

**Region honesty correction:** an earlier assistant statement claimed Google had no Thai Firestore region and offered Singapore. The create-database dialog showed **`asia-southeast3` (Bangkok) exists and is enabled**. The assistant stopped, corrected the owner explicitly, and re-asked; the owner chose Bangkok. No provisioning proceeded on the decision made with wrong information.

**Role-grant read-back lesson:** after the create-service-account wizard, a snackbar read *"No change - principal already exists on the policy"*, which could be misread as a failed grant. The authoritative **IAM page (View by principals)** read-back confirmed the principal `p6vc-firestore-dev@…` holds **Cloud Datastore User**. The persisted policy — not the transient snackbar — is the source of truth.

## 3. Credential handling (secret hygiene)

- The JSON key was downloaded by the in-app browser to a GUID `.tmp` file in `Downloads`, identified by parsing **non-secret metadata only** (`type`, `project_id`, `private_key_id`, `client_email`, presence of `private_key`). The private key material was **never printed** to chat or logs.
- The file was **moved OUTSIDE the repo** to `C:\Users\66996\.p6vc\p6vc-firestore-dev-key.json`; the `Downloads` copy was removed (verified gone).
- Referenced from the **gitignored** root `.env` via `GOOGLE_APPLICATION_CREDENTIALS` (forward-slash path), plus `FIRESTORE_PROJECT_ID=mt-iam-core-2026` and `FIRESTORE_DATABASE_ID=(default)`.
- `.env.example` (committed team schema SSOT) documents the new keys, the outside-repo secret rule, the least-privilege SA, and the fail-closed probe gate — **no secret values**.
- `git status` confirmed **no key/secret file** is tracked or staged. The key is shared with the team only via the owner's secure vault, never via git/chat/screenshots.

## 4. SDK + connectivity probe

- **SDK:** `@google-cloud/firestore@9.4.1` added as a **devDependency** of `backend/gas`. It is a **Node-only** local probe/backfill tool. Verified **no `src/` file imports it**, so the GAS bundle is unaffected — the GAS runtime reaches Firestore via **REST + service-account OAuth (`UrlFetchApp`)**, not this SDK.
- **Probe:** [`scripts/firestore-connectivity-probe.mjs`](../backend/gas/scripts/firestore-connectivity-probe.mjs). Fail-closed gate `P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE`. Validates the credential file exists **outside the repo** and its `project_id` matches before any network call. Uses REST transport (`preferRest: true`) + ADC. Sanitized report → gitignored `test-results/firestore-connectivity-probe.json`.

**Executed result: 8/8 PASS, 0 FAIL** (project `mt-iam-core-2026`, db `(default)`):

| Step | Result | Read-back proof |
|---|---|---|
| FS-01.CONFIG | PASS | Creds outside repo, `project_id` match, key present |
| FS-02.CLIENT_INIT | PASS | REST + ADC client constructed |
| FS-03.WRITE | PASS | Synthetic doc `set()` |
| FS-04.READ_BACK | PASS | **Independent `get()` deep-equal** to written doc |
| FS-05.QUERY_LIST | PASS | Single-field equality + `orderBy` (auto-index) return the doc; `seq` readable |
| FS-06.UPDATE_READ_BACK | PASS | Independent `get()` confirms changed `seq`/nested field; unrelated field intact |
| FS-07.DELETE | PASS | Synthetic doc deleted |
| FS-08.DELETE_READ_BACK | PASS | Independent `get()` `exists=false` — **no cleanup residue** |

A best-effort `finally` cleanup guarantees no probe document is left behind even on failure.

**Composite-index note (honest scope):** the adapter's combined `where(field == value)` + `orderBy(_seq)` pattern requires a **per-collection composite index** (Firestore auto-indexes single fields only). The first probe run surfaced this as `FS-05 … requires an index`; the connectivity probe was scoped to **single-field** queries (auto-indexed) to prove the read/query path without conflating it with index provisioning. Composite indexes for the **real table collections** are provisioned during **F4 cutover**, not on this throwaway probe collection.

## 5. Boundaries — what this is NOT

- **NOT cutover / backfill / migration approval.** Live runtime stays **Sheets V50 / 0.9.2**; `Container.js` still injects `createSheetStore`. F2 remains unwired until **F3** (`VEHICLE_PERSISTENCE_BACKEND=sheets|firestore` + dual-write/backfill/cutover/rollback).
- **NOT PDPA/security approval.** The new-store **PDPA + security review ([#55](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/55))** remains a **human gate, OPEN** — not self-approvable by an assistant.
- **Synthetic DEV only.** No real data, no `ENFORCED`, no destructive retention, no live Sheets schema mutation.
- Firestore migration is a **SEPARATE project**, not part of the 48h Sheets production-readiness target.

## 6. Owner / human action items

1. **#55 — new-store PDPA + security review** of the Firestore DEV store (human sign-off; data-residency Bangkok chosen, restrictive rules, least-privilege SA documented above as inputs).
2. **Credential rotation + secure sharing policy** for the service-account key (owner vault; team distribution outside git/chat).
3. **Production Firestore provisioning decision** (separate from this DEV infra; billing/region/SA for production).
4. **F3 sequencing ratification** (dual-write → backfill → cutover → rollback) and **composite-index provisioning** per real collection at cutover.
5. Existing outstanding human gates unchanged: PDPA/security/UAT/release sign-offs, ADR ratifications (D3/D5/B3, VC-ADR-014/015/017), QR device acceptance, browser/business acceptance.

## 7. Reproduce

```bash
# from apps/vehicle-contact/backend/gas (loads gitignored root .env)
P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE \
  node scripts/firestore-connectivity-probe.mjs
# → FINAL {"status":"PASS","pass":8,"failed":0,...}; report in test-results/ (gitignored)
```

Requires `GOOGLE_APPLICATION_CREDENTIALS` (outside-repo SA key), `FIRESTORE_PROJECT_ID`, `FIRESTORE_DATABASE_ID` in `.env`, and `npm i` (SDK devDependency). Synthetic DEV only; the probe never touches real tables.