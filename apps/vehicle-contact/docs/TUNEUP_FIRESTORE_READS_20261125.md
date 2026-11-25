# Tune-up: Firestore reads and unnecessary parts (2026-11-25)

The owner asked two things on 2026-11-25:
- "ทำไมถึงมีการใช้งานมากนัก" — why billing showed 302,023 Firestore reads (Bangkok).
- "query + filter ที่ Firestore เพื่อ ... ประหยัดค่าใช้จ่าย หรือไม่" — whether the system queries and filters at Firestore to save cost.

Then: "ถึงเวลาต้อง tuneup หรือตัดส่วนที่ไม่จำเป็นออก" — tune up and remove what is not needed.

Backend 0.9.26. Stacked on D2 (0.9.25).

## 1. Diagnosis (evidence, not guesses)

Collection sizes, from a read-only COUNT aggregation (`scripts/firestore-collection-counts.mjs`):

| Collection | Docs | Collection | Docs |
|---|---:|---|---:|
| vc_change_audit | 1,146 | vc_user_roles | 183 |
| vc_photo_staging | 749 | vc_users | 182 |
| vc_reference_values | 645 | vc_registration_requests | 113 |
| vc_lookup_audit | 341 | vc_qr_tokens | 102 |
| vc_vehicle_photos | 330 | vc_vehicles | 66 |
| vc_operation_journal | 327 | vc_organizations | 63 |
| vc_security_events | 322 | vc_campaigns | 55 |
| vc_sessions | 320 | | |

Firestore bills one read per document returned, and at least one per query.

Code audit of every `store.list(...)` call found these hot paths reading whole collections:

| Operation | What it read per call | Who calls it |
|---|---|---|
| `references.registration`, and every registration submit / approve (`assertRegistration`) | all 645 reference rows + all 63 organizations ≈ **708** | registration forms, vehicle edit, approvals |
| `audit.query` / `audit.export` | both audit trails in full ≈ **1,487**, growing on every lookup and change | audit page |
| `vehicles.lookup` (STAFF hot path) | **all vehicles**, then filtered in memory | every plate search |
| duplicate-plate check (approve / update) | all vehicles | approve, edit |
| `vehicles.list` (registry) | all vehicles, sliced to one page | registry page |
| `vehicles.listMine`, `changes.listMine`, `retention.dueJobs` | whole collection, filtered in memory | owner pages, retention |
| photo upload limit | every staged photo of the campaign | each intake upload |

Also found on Cloud Run:
- No cache existed (deliberately, so sessions can be revoked at once).
- The **Firestore access token was minted on every request**: an RSA signature plus a metadata-server round trip. This costs CPU (Cloud Run bills CPU-seconds) and latency, not Firestore reads.

The test runs also contributed: the 108-case live suite with DATA_PROOF ran about 10 times this session. Each run adds residue, and that residue made the full reads above grow.

**Honest answer to the owner's question:** before this tune-up, equality lookups were already pushed to Firestore. These were sessions, QR, Vehicle 360 and contacts/photos per vehicle, backed by 20 composite indexes. The list and audit pages, plate lookup and reference data were not pushed down. The D2 filters (users / organizations / campaigns) also filter in memory. That is acceptable at their size (tens to hundreds of rows), but it does not save reads.

## 2. Design

| ID | Change | Rule kept |
|---|---|---|
| R1 | `count` on the store and gateway (`:runAggregationQuery`, about 1 read per 1,000 entries) and `readMany` kind `count`. `pageWindow` / `pageOf` / `readPage` read only `page × pageSize` rows plus one COUNT, in **one parallel round**. Equality queries for plate lookup, duplicate checks, `listMine`, `changes.listMine` and `dueJobs`. | Same paginate contract (`items/total/page/pageSize/totalPages`; legacy `limit`); same ordering |
| R2 | Reference rows memoized per process for **5 min on Cloud Run only**. Organizations and the enforcement setting stay **live**, and only ACTIVE organizations are read. | A disabled organization is refused immediately. Reference rows change only through the offline seed tool. GAS keeps reading every time. |
| R3 | Access token kept per process on Cloud Run (`tokenCache`, separate from the session cache) | Sessions are still never cached; logout and revocation stay immediate |
| C1 | Removed the editor-only Firestore POCs (`FirestoreRestPoc.js`, `FirestoreCrudPoc.js`, two editor functions, their tests). `VEHICLE_FIRESTORE_POC_APPROVED` moves to "retired" so the config inspector flags it if it is still set. | `contract.test` asserts they are gone |

There are 7 new composite indexes in `contracts/firestore-indexes.v1.json` (27 in total). They are applied with `ensure-firestore-indexes.mjs`, which only adds and never deletes.

## 3. Read budgets (offline proof, `tests/tuneup-reads.test.mjs`)

The fake server bills like Firestore: a query costs max(1, docs returned) and a COUNT costs 1 per 1,000 entries.

| Case | Before | After (budget asserted) |
|---|---:|---:|
| audit page 1 (1,200 events) | 1,200 | ≤ 22 |
| vehicles.list page 2 (300 vehicles) | 300 | ≤ 21 |
| vehicles.lookup (300 vehicles) | 300 + view | ≤ 12 |
| vehicles.listMine | 300 | ≤ 3 |
| COUNT of 2,500 rows | 2,500 | 3 |
| references.registration, repeated within 5 min (Cloud Run) | 708 each | about 63 (organizations live) |
| access-token mints for 3 requests (Cloud Run) | 3 | 1 |

## 4. Not changed (and why)

- **Session check, about 4 reads per request.** This is kept on purpose. A cross-instance session cache would delay revocation (VC-ADR-030/033).
- **users / organizations / campaigns lists (D2).** These are in-memory filters over small collections, at most about 430 reads per admin page view. Push down when they grow.
- **`retention.executableJobs`.** This is a rare worker call on 56 rows. Two statuses would need a merge order, so it is left as is.

## 5. Findings that need an owner decision (not done here)

1. **Test residue.** All of it is synthetic DEV data, but it inflates every remaining full read and the audit trail. Cleaning it is a deletion, so it needs explicit owner approval and a dry-run list first.
2. **`vc_photo_staging` keeps 749 rows (vs 330 vehicle photos).** Abandoned uploads are never cleaned, in Firestore or in Drive. This needs a retention rule under PDPA (for example, delete unclaimed staging after N days). That is a policy decision.
3. **Access log grows on every view** (owner decision VC-ADR-036). If cost matters later, the log can be sampled or folded into daily aggregates.

## 6. Verification plan

1. Offline: backend `npm run check` (all suites + TUNE-01..06), and the SSOT gates.
2. Live, after owner approval:
   - indexes 27/27 READY;
   - deploy GAS and Cloud Run 0.9.26;
   - live chain with DATA_PROOF (freshness checked);
   - browser check of the audit, registry and lookup pages.
3. Cost: compare the billing "Cloud Firestore Read Ops Bangkok" line over the next days against the 302,023 baseline. Run fewer full live suites.
