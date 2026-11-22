# #55 — New-store PDPA & security review: Firestore (decision-ready dossier)

- Doc ID: P6VC-SEC-55-FIRESTORE-001 · Date: 2026-11-23 (Asia/Bangkok)
- Status: **ENGINEERING MAPPING READY FOR HUMAN REVIEW — NOT an approval.** No legal/DPO sign-off, no PII-processing authorization, no cutover approval is implied by this document (mirrors [PDPA_REVIEW_CHECKLIST](PDPA_REVIEW_CHECKLIST.md) + [PDPA_DATA_RETENTION_AND_RELEASE_GATE](PDPA_DATA_RETENTION_AND_RELEASE_GATE.md): "ร่างครบเพื่อเข้าสู่กระบวนการอนุมัติ ไม่ใช่หลักฐานการได้รับการอนุมัติ").
- Scope: review of **Firestore as the new system-of-record engine** (D-E1 Option 2 / VC-ADR-019), delta on the existing Sheets-era PDPA pack. Authoritative procedure: [FIRESTORE_CUTOVER_ROLLBACK_RUNBOOK](FIRESTORE_CUTOVER_ROLLBACK_RUNBOOK.md).
- Reviewers (human, NOT self-approvable): Owner / security reviewer for the new-store engineering review; **formal legal + DPO sign-off additionally required for ANY real-person-data go-live** (separate gate below).

## 0. Two distinct gates — do not conflate

| Gate | What it authorizes | State |
|---|---|---|
| **#55 new-store review** (this doc) | Firestore is an acceptable store engine; cutover of the **synthetic DEV** deployment | Engineering mapping ready; awaiting human sign-off |
| **PDPA real-data go-live** ([release gate](PDPA_DATA_RETENTION_AND_RELEASE_GATE.md)) | Processing **real citizen personal data** in production | **NOT ready** — pack preliminary; legal/DPO unsigned; retention numbers, lawful basis, ROPA, notices, consent, cloud-transfer assessment, breach SOP all open. Owner binding rule "ห้ามข้อมูลจริง" also in force. |

**A synthetic-DEV engine cutover does NOT authorize real-data operation.** Real-data production is a separate, heavier, currently-unmet gate.

## 1. New-store security/PDPA mapping (Firestore specifics + evidence)

| Concern | Firestore posture | Evidence / status |
|---|---|---|
| Data residency | `(default)` Standard/Native **asia-southeast3 (Bangkok)** — in-country for PDPA residency | [#128 infra](BACKEND_FIRESTORE_INFRA_F4_EVIDENCE_20261122.md); provisioned via owner-authorized Cloud Console |
| Encryption at rest | Google-managed encryption (default) | #128 |
| Access control / least privilege | SA `p6vc-firestore-dev@mt-iam-core-2026` role **datastore.user** (+ **datastore.indexAdmin** for composite-index provisioning); restrictive security rules | #128 IAM read-back verified; indexAdmin granted 2026-11-22 |
| Credentials handling | JSON key **OUTSIDE repo** `~/.p6vc/p6vc-firestore-dev-key.json` via gitignored `.env`; NEVER committed/printed; runtime uses **REST + SA OAuth (RS256 JWT)** via UrlFetchApp, client SDK NOT in GAS bundle | #128 + [POC #1](BACKEND_FIRESTORE_REST_POC1_EVIDENCE_20261122.md); `@google-cloud/firestore` is a Node-only devDependency |
| Credential rotation | **OPEN — owner gate** (SA key rotation + vault sharing policy) | not done |
| AuthN / action-level AuthZ | App-layer, **store-agnostic**: server-side session + per-op permission re-check; PBKDF2 150k; QR opaque; phone shown only after login+authorization | [#70 E2E](FRONTEND_FIRESTORE_E2E_EVIDENCE_20261123.md): RBAC matrix verified, **8 FORBIDDEN fail-closed** negatives; [#69 suite](BACKEND_FIRESTORE_LIVE_API_SUITE_EVIDENCE_20261122.md) RBAC negatives |
| Audit / access logs | `vc_operation_journal` (durable B2b) + `audit.query`/`audit.export` work on Firestore | #69 + #70 (audit trail + export verified live) |
| Retention / legal_hold | Retention ops (`listDue/listExecutable/approve/execute/jobStatus`) exercised on Firestore; **destructive retention DISABLED**; `execute`-disabled negative passes; D5 enable decision pending | #69 retention block; [C5 console BLOCKED on D5+B3](CURRENT_DELIVERY_STATUS.md) |
| Data-subject deletion | Firestore `remove` + backfill extras-delete + retention path; per-doc read-back proves deletion | #69 (4 deletes read back absent); **deletion SOP for real data still open** |
| Retention schedule numbers | **OPEN** — [release gate](PDPA_DATA_RETENTION_AND_RELEASE_GATE.md) table still "[กำหนด]" / "[ ]" approver | not approved (D5) |
| Cloud transfer / processor assessment | GCP Bangkok, SA OAuth, REST over TLS; formal cross-border/processor assessment **OPEN** | release gate checkbox open |
| Cross-store atomicity | **NOT claimed**; guarantee = SoR-first + divergence journal + sha256 checksum read-back + warm standby (reverse dual-write) | [runbook §4](FIRESTORE_CUTOVER_ROLLBACK_RUNBOOK.md); F3b offline DW 14/14 + BF 8/8 |
| Independent data-proof (SSOT) | Every committed write re-read via a second SDK client, canonical field-by-field; deletes absent | #69: **302 write read-backs, 0 failures, 25/25 count match, residue 0**; #70: **225 write read-backs, 0 failures** |
| Anonymous / direct-URL bypass, rate-limit, enumeration | App/Worker-layer controls (E2 fail-closed); **must be re-evidenced for real-data production** per [security baseline](GAS_SECURITY_AND_PRIVACY.md) | E2 Worker fail-closed pass; real-data negative evidence OPEN |

## 2. Live DEV verification supporting this review

- [#69 full API/use-case pipeline](BACKEND_FIRESTORE_LIVE_API_SUITE_EVIDENCE_20261122.md): real application on live Firestore DEV (Bangkok) — **PASS 72/72, 56/56 ops**, 0 audit failures, cleanup residue 0; per-op latency report.
- [#70 frontend E2E](FRONTEND_FIRESTORE_E2E_EVIDENCE_20261123.md): every page, all 5 roles + a UI-created account, full business pipeline; 0 audit failures; RBAC verified; console clean.
- [POC #2/#3](BACKEND_FIRESTORE_LIVE_POC2_POC3_EVIDENCE_20261122.md): composite indexes auto-provisioned + precondition calibration (create-on-present 409, update/delete-on-absent 404) — runbook §2 POC gates **DONE**.
- Honest boundary: verified via the **local Node bridge ≠ GAS V8 runtime**. GAS-runtime Firestore mode requires the push below; live runtime today is **Sheets V50/0.9.2**.

## 3. Cutover gate checklist (runbook §2) — what remains

- [x] POC #2 composite indexes + latency — DONE (#135)
- [x] POC #3 precondition calibration — DONE (#135)
- [x] Credentials in gitignored `.env`, key outside repo — DONE (#128)
- [ ] **#55 new-store human sign-off** (this dossier) — Owner/security reviewer
- [ ] **GAS push gate** — owner types `PUSH_VEHICLE_GAS`. **Live V50 does NOT contain F3a/F3b** (StoreSelector flag + real REST gateway + dual-write/backfill merged in #132/#133/#134 AFTER V50 was pushed). The cutover push must ship F3a/F3b source.
- [ ] **Publication** — owner-executed (clasp update-deployment to the Worker-facing pinned deployment; manifest must carry `webapp:{executeAs:USER_DEPLOYING,access:ANYONE_ANONYMOUS}`)
- [ ] Snapshot export path chosen (runbook Phase 0)
- [ ] **Real-data authorization + full PDPA legal/DPO go-live** — ONLY if cutover will process real personal data (currently forbidden; see §0)

## 4. Execution outline once gates clear (synthetic DEV; runbook §3)

Phase 0 snapshot export (read-only) → Phase 1 forward dual-write (`VEHICLE_FIRESTORE_DUALWRITE=true`, backend stays sheets) + suite + independent audit, repair OPEN divergences → Phase 2 quiesced-window checksum backfill (`firestore-backfill.mjs`, require PASS/match/seqParity) → Phase 3 set `VEHICLE_PERSISTENCE_BACKEND=firestore` keep dual-write (Sheets warm) + full suite + RBAC + read-back of BOTH stores + monitor p95/quota/divergence for owner-set window → clear dual-write → Firestore-only. **Rollback = flag flip to `sheets`** (warm standby loses no committed write). Every phase verifies persisted data, not API responses.

## 5. Sign-off (human-only — assistant may NOT self-approve)

| Role | Name | Decision (approve / reject / conditions) | Date | Signature |
|---|---|---|---|---|
| Owner / security reviewer (#55 new-store, synthetic DEV) | ____ | ____ | ____ | ____ |
| Legal counsel (real-data go-live ONLY) | ____ | ____ | ____ | ____ |
| DPO (real-data go-live ONLY) | ____ | ____ | ____ | ____ |

**Open items blocking real-data production:** formal legal/DPO sign-off; approved retention numbers (D5); lawful basis per activity; ROPA certification; privacy notices posted; consent + withdrawal channel; cloud-transfer/processor assessment; breach + data-subject-rights SOP; anonymous/direct-URL/rate-limit/enumeration negative evidence; production Firestore provisioning (separate from DEV); SA-key rotation; owner real-data authorization lifting "ห้ามข้อมูลจริง".