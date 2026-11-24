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
