# P6VC — Server-side performance profile (V69 / 0.9.19)

**Owner direction:** "จับเวลาฝั่ง server ก่อน" — measure before deciding between more GAS tuning and plan B.
**Method:** `requestId` `prof_*` requests return `serverTiming`, which holds durations and counts only. There are 5 calls per operation, all warm (session and token in cache), and medians are reported. **Client** = full round trip from Thailand through GAS directly; **server** = time inside the GAS execution.

## 1. Results (median ms)

| Operation | Client | Server | Outside server (GAS platform + network) | Firestore (in server) | Firestore detail |
|---|---|---|---|---|---|
| `system.health` (no DB) | 2,125 | — | — | 0 | — |
| `auth.session` | 1,913 | 142 | **1,743** | 0 | cache hit, no DB call |
| `registrations.listPending` | 2,266 | 476 | **1,731** | 319 | 1 query |
| `users.list` | 2,959 | 904 | **1,696** | 675 | 2 queries in parallel |
| `vehicles.detail` | 4,635 | 2,395 | **2,117** | 2,051 | query 324 → parallel round of 8 queries + 1 commit: **1,717** |
| `vehicles.lookup` | 5,197 | 2,565 | **2,195** | 2,338 | query 366 → parallel round of 8 queries + 1 commit: **1,818** |
| `vehicles.photo` | 6,105 | 4,095 | **2,073** | 2,062 | 2 queries in parallel 394 → **commit 1,546** (+ Drive 918) |

Our own code is small: compose 40–80, authorize 44–72 (session snapshot hit), cache 37–104, Script Properties 34–55.

## 2. Findings

1. **GAS platform plus network costs about 1.7–2.2 s on every call, before and after our code.** `system.health`, which never touches the database, takes 2.1 s. This cannot be reduced inside GAS.
2. **Firestore is in `asia-southeast3` (Bangkok), while GAS runs in Google's US data centres.** Each query from GAS takes **320–370 ms**. The same query from Thailand takes **48–100 ms**.
3. **A single write (commit) from GAS takes about 1.5 s.** That is the one append-only access-audit row on lookup, detail and photo. Folding it into the read round (0.9.18) could not help: a parallel round lasts as long as its slowest member, which is this commit.
4. Drive photo read: about 0.9 s.
5. The caches work: `authorize` ≈ 50 ms and no Firestore call for the session (was 2.6–3.4 s per call before 0.9.17).

## 3. What is still possible inside GAS

The best case for lookup is about **3.3 s**: 2.2 s platform + 0.37 s query + about 0.7 s parallel reads. Even that requires removing the audit write from the request path, which GAS cannot do asynchronously.

Moving Firestore to a US region would cut the per-query cost, but it moves Thai personal data abroad. That is a PDPA / data-residency decision for the owner and the DPO, not a tuning step.

## 4. Projection for plan B (API outside GAS, close to the data)

| Item | GAS today | Bangkok-near runtime (projected from §1, finding 2) |
|---|---|---|
| Platform overhead | 1.7–2.2 s | about 0.05–0.2 s |
| Query | 320–370 ms | about 50–100 ms |
| Lookup end to end | about 5.2 s | **about 0.4–0.8 s** (projection, to be confirmed by a spike) |

**Recommendation:**
- Move the **officer read path** first: lookup, detail and QR resolve, with the access-audit write.
- Do this behind the existing Worker contract, with a measured spike before committing to the full migration.
- Keep GAS for admin and lower-traffic operations until then.

## 5. Result: Firestore moved next to GAS (2026-11-25, owner direction)

Owner: "สร้างฐานข้อมูลใหม่ โดยให้ไปอยู่ที่เดียวกับ GAS หรือใกล้เคียง ดำเนินการได้". **Synthetic DEV only**: a US location for real personal data still needs the DPO / legal-counsel decision (#55 unchanged).

**What was done:**
- Created Firestore `p6vc-us` (Native, Standard, region **us-east1**, restrictive rules) in the Cloud Console.
- Copied `(default)` → `p6vc-us` with [copy-firestore-database.mjs](../backend/gas/scripts/copy-firestore-database.mjs) (gate `P6VC_ALLOW_DB_COPY`; refuses a missing or non-empty target; create-only writes; tests `DBCOPY-01..03`).
  - Result `PASS`: 4,061 documents, 26/26 collections with equal counts, 16/16 composite indexes `READY`.
- The owner set Script Property `VEHICLE_FIRESTORE_DATABASE_ID=p6vc-us`.
  - SSOT check: one login created a session in `p6vc-us` (189 → 190) and none in `(default)` (189 → 189).
- **Rollback:** set the property back. `(default)` is untouched and still holds the pre-switch data.

**Correctness on `p6vc-us` (V69 / 0.9.19, local read-back with `FIRESTORE_DATABASE_ID=p6vc-us`):**
- G6: **104/104** (HEALTH_VERSION_MATCH, PUBLIC_SMOKE, FULL_SUITE_WITH_DATA_PROOF).
- SSOT scenarios: **9/9** (C3b, C4, C5, C6, S1–S5).
- Cleanup failures: 0.

**Speed (same profile script as §1, medians of 5, ms):**

| Operation | Client before (Bangkok DB) | Client after (`p6vc-us`) | Server after | Firestore time after |
|---|---|---|---|---|
| `vehicles.lookup` | 5,200 | **2,588** | 891 | 693 (2 rounds) |
| `vehicles.detail` | 4,087 (V67) | **2,790** | 730 | 609 |
| `registrations.listPending` | 2,137 (V67) | **2,086** | 204 | 84 |
| `vehicles.photo` | 7,027 (V67) | **3,105** | 1,345 | 275 (+ Drive) |
| `users.list` | 7,058 (V67) | **2,034** | 343 | 184 |
| `auth.session` | about 1,900 | 1,843 | 95 (cache) | 0 |

- Single query: 320–370 ms → **77–128 ms**. Single commit: about 1.5 s → **144–187 ms**.
- G6 latency: p50 5,252–5,916 → **2,571 ms**; p95 13,793–14,942 → **5,997 ms**.
- **What is left:** about 1.7 s per call is GAS platform and network overhead (health alone takes 2.1 s). Only plan B (§4) removes it.
