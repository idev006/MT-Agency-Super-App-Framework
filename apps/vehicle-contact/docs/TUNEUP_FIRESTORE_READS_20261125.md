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

## 7. Live evidence (2026-11-25)

**Releases:**
- 0.9.25 (D2): GAS V75 + Cloud Run.
- 0.9.26 (this tune-up): GAS V76 + Cloud Run.
- 0.9.27 (Cloud Run `fetchAll` + profiler fix, #209): GAS V77 + Cloud Run.

**Live chain.** Each release passed 108/108, with DATA_PROOF 7/7. DATA_PROOF `startedAt` was checked to be at or after the suite `startedAt`.

| Release | Suite p50 |
|---|---:|
| 0.9.25 | 754 ms |
| 0.9.26 | 593 ms |
| 0.9.27 | 389 ms |

**Indexes:** 27/27 READY (7 added, add-only).

**Residue purge** (owner-approved, `scripts/purge-synthetic-residue.mjs`, #208):
- 2,483 synthetic Firestore docs were deleted from the dry-run plan the owner confirmed, with 0 skipped.
- An independent COUNT recount matched the plan's "kept" numbers exactly, and a new dry run listed 0.
- A smoke test after the purge passed: login, every list page, audit, references, retention, logout.
- The 349 Drive files are **not** deleted yet. They need the GAS-side trash step.

**Found while verifying 0.9.26, fixed in 0.9.27:**
- Cloud Run had no `UrlFetchApp.fetchAll`, so every "one parallel round" ran sequentially.
- The request profiler crashed on Cloud Run (every `prof_*` request returned `OPERATION_FAILED`).

**Live read shape on 0.9.27, from the profiler** (`prof_*`, synthetic admin; call kinds only, no data). The first round of every operation is the session check: 1 query, then user + roles + permissions in one parallel round.

| Operation | After the session check | Server ms |
|---|---|---:|
| audit.query (page 1) | `fetchAll[runQuery, runQuery, count, count]`: two windows + two COUNTs, one round | 41 |
| vehicles.list (page 1) | `fetchAll[runQuery, count]` | 44 |
| vehicles.lookup | one equality `runQuery` + the access-log `commit` | 48 |
| references.registration (memo warm) | `fetchAll[runQuery, runQuery]`: organizations + setting only; the 645 reference rows come from the memo | — |
| users.list | `fetchAll[roles, users, organizations]`: full reads of small collections (D2, by design) | 61 |

**Client latency** (Cloud Run direct, median of 5, second warm run):

| Operation | 0.9.26 | 0.9.27 |
|---|---:|---:|
| users.list | 165 | 177 |
| audit.query | 163 | 97 |
| vehicles.list | 105 | 62 |
| vehicles.lookup | 116 | 73 |
| references.registration | 166 | 102 |
| campaigns.list | 138 | 77 |

The first run right after the deploy was slower while instances warmed up. Client timings include internet round trips and vary between runs.

**Cost.** Confirm on billing ("Cloud Firestore Read Ops Bangkok") over the next days against the 302,023 baseline.

## 8. T2: Firestore efficiency, phase 2 (owner "Start T2", 2026-11-25, BE 0.9.29)

Billing facts this phase relies on:
- Firestore bills per document read, written or deleted.
- A projection / field mask cuts bytes and latency but **not** reads.
- `offset` still bills every skipped document.
- COUNT is about 1 read per 1,000 index entries.
- The `(default)` database has a daily free quota; named databases do not.

| Item | Change | Effect |
|---|---|---|
| T2-1 session check | Login writes the roles + permissions snapshot into the session (`access_json`). The check reads the session + the user (still live). Every role, status or password change already revokes the user's sessions, so a snapshot cannot outlive a change. Older sessions fall back to the live read. | 4 → **2 reads per request** (T2-01..03) |
| T2-2 TTL | `FirestoreStore` writes the timestamp `expire_at` on sessions (expiry + 1 day), idempotency (30 days), security events (90 days) and the operation journal (180 days). It survives transactional updates and is hidden from reads like `_seq`. Audit trails are excluded (PDPA). | Expired rows are deleted by Firestore: no read, no job (T2-04) |
| T2-3 index exemptions | Long text fields that are never queried keep no single-field index. These are the application/delta/result/detail JSON fields, the audit summary, password hash/salt, the campaign token and the session snapshot. | Less storage, cheaper writes |
| T2-2/3 as code | `contracts/firestore-field-config.v1.json` + `scripts/ensure-firestore-field-config.mjs`: add-only, gated, dry run by default, waits until each change is live | T2-05 |
| T2-4 FE cache | Already in place: the registration reference catalog is cached per user and tab in sessionStorage (one call per tab session). The server memo (R2) covers repeated calls. | No change needed |
| T2-4 budget alert | Owner sets it in GCP Billing → Budgets & alerts | Owner action |
| T2-5 cursor paging | Deferred. Page *n* still reads n × pageSize rows, which is cheap at the current size (audit page 5 = 50 reads). Switch to `startAfter` when collections grow or the page count passes about 20. | Revisit when data grows |
