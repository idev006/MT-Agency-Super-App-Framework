# Incident — Firestore REST live POC run #1: three real-API contract bugs (FAIL 5/8)

**Date:** 2026-11-22 (Asia/Bangkok)
**Doc ID:** P6VC-BE-POC1-INC-001
**Slice:** POC #1 ([#65](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/65)), follow-up to [#129](https://github.com/idev006/MT-Agency-Super-App-Framework/pull/129).
**Status:** **CLOSED — fixed and live-verified.** Offline suite **10/10**, live-shape probe against Firestore DEV **green**, `npm test` exit 0, build 58 modules; **live GAS editor run #2 (2026-11-22 20:57 ICT) PASS 8/8** on the fixed source, gate re-armed ([evidence §4.2](BACKEND_FIRESTORE_REST_POC1_EVIDENCE_20261122.md)).
**Companion:** [POC #1 evidence](BACKEND_FIRESTORE_REST_POC1_EVIDENCE_20261122.md) (§4.1 live run #1), [F4 infra evidence](BACKEND_FIRESTORE_INFRA_F4_EVIDENCE_20261122.md).

## 1. What happened

The first **live GAS V8 editor run** of `pocFirestoreRestFromEditor()` (2026-11-22 20:25 ICT, owner-authorized push; editor driven via OS-level input on the owner's visible browser) returned `status:'FAIL', passed:5, total:8`. Sanitized steps (no key/token/PII in the log):

| Step | Result | Error / note |
|---|---|---|
| POC-01.CONFIG | ok | project=mt-iam-core-2026 db=(default) |
| POC-02.TOKEN | ok | SA OAuth JWT(RS256) → access token OK |
| POC-03.WRITE | ok | PATCH synthetic doc created |
| POC-04.READ_BACK | **fail** | `READ_BACK_MISMATCH` |
| POC-05.QUERY | **fail** | `QUERY_HTTP_400` |
| POC-06.TRANSACTION | **fail** | `COMMIT_HTTP_400` |
| POC-07.DELETE | ok | doc deleted |
| POC-08.DELETE_READ_BACK | ok | 404, no residue |

**What run #1 already proved live** (the irreducible GAS unknowns from evidence §4): GAS `Utilities.computeRsaSha256Signature` produces a JWT Google's token endpoint accepts; `UrlFetchApp` reaches `oauth2.googleapis.com` and `firestore.googleapis.com`; PATCH/GET/DELETE work end-to-end. The three failures are **request/response contract bugs**, not runtime/auth bugs.

## 2. Root causes (real API error messages, reproduced with a Node probe on Firestore DEV)

A throwaway Node probe (same SA key, synthetic doc only, outside the repo) replayed the exact request bodies and captured Google's `INVALID_ARGUMENT` messages:

- **B1 — order-sensitive read-back compare.** POC-04 compared `JSON.stringify(decoded) === JSON.stringify(written)`. Firestore returns map keys in **nondeterministic order** — three probe runs returned three different orders (`createdAt,marker,seq,tags,payload,pocId`, `createdAt,pocId,marker,payload,seq,tags`, `marker,seq,pocId,createdAt,payload,tags`), and nested maps reorder too. Deep-equal data therefore "mismatched". **Solution:** canonical (recursively key-sorted) comparison, `canon()`, before stringify.
- **B2 — collection-suffixed `runQuery` URL.** `POST …/documents/{coll}:runQuery` is **not** the runQuery route: Google transcodes it to `createDocument` (body parsed as a `Document`), hence `400 Invalid JSON payload received. Unknown name "structuredQuery" at 'document': Cannot find field.` **Solution:** `POST …/documents:runQuery` (the documents **parent**) with the collection inside `structuredQuery.from:[{collectionId}]`. Verified 200 with `limit` as plain number, as `{value:n}` wrapper, and omitted.
- **B3 — absolute URL in `writes[].update.name`.** Commit rejected the full `https://firestore.googleapis.com/v1/projects/…` name: `400 Document name "https://…" lacks "projects" at index 0.` Body document names are **relative resource names** (`projects/{p}/databases/{d}/documents/{coll}/{id}`); only endpoint URLs are absolute. The same rule applies to reading results: `runQuery` rows carry relative `document.name`, so the found-check must compare against the relative name. **Solution:** `relName()` helper used for commit `update.name` and the query match.

## 3. Fix (source + tests)

- [`FirestoreRestPoc.js`](../backend/gas/src/infrastructure/persistence/firestore/FirestoreRestPoc.js): `canon()` order-independent deep-equal (POC-04); `base+':runQuery'` + relative-name match (POC-05); `relName()` in commit `update.name` (POC-06).
- [`firestore-rest-poc.test.mjs`](../backend/gas/tests/firestore-rest-poc.test.mjs): the offline fake now **enforces the real contract** instead of echoing our assumptions — GET returns recursively reordered keys; `runQuery` accepts only the parent form (collection-suffixed URL → the real 400 message); commit rejects non-`projects/` names with the real 400 message; query rows carry relative names; `limit` accepts number or wrapper. New **POC-OFFLINE-10** asserts the fake reorders keys and read-back still passes; POC-OFFLINE-02 asserts parent-form runQuery URL and relative commit name.

## 4. Why offline 9/9 missed all three (the mock lesson)

The original fake stored and echoed fields **in insertion order**, accepted **any** runQuery URL suffix, and accepted **full-URL** document names. It encoded *our assumptions* about the API, not the API's contract — so it could never fail on these seams. **Rule:** an offline fake must enforce the real contract **including its 400s** (negative space), and be calibrated against a live probe whenever one is available. This is the same class of lesson as the Sheets `USER_ENTERED` coercion incident ([GAS_NUMBERFORMAT_DISPLAY_CORRUPTION_INCIDENT](GAS_NUMBERFORMAT_DISPLAY_CORRUPTION_INCIDENT_20261121.md)): fakes that are more permissive than reality hide production bugs.

## 5. Verification

- **Node live-shape probe (Firestore DEV, synthetic only):** WRITE 200 → READ canonical deep-equal `true` → runQuery 200 `rows=1 found=true` (all three limit forms) → beginTransaction 200 → commit 200 (`writeResults`+`commitTime`) → DELETE 200 → GET 404. **No residue.**
- **Offline:** `node --test tests/firestore-rest-poc.test.mjs` → **10/10**; full `npm test` → **exit 0**; `npm run build` → 58 `.gs` modules, no deployment performed.
- **Live runtime unchanged:** `/exec` health `ready`, `backendVersion 0.9.2` (published V50). F2 adapter + POC remain **unwired**.
- **Live GAS editor run #2 of the fixed source (2026-11-22 20:57 ICT): PASS 8/8** — owner-authorized clasp push ("Pushed 59 files", 20:53 ICT), editor Run via OS input on the owner's visible browser; returned `{status:'PASS', tokenAcquired:true, passed:8, total:8}`; `/exec` health unchanged `ready/0.9.2`; `VEHICLE_FIRESTORE_POC_APPROVED` removed afterwards (save read-back verified). Detail: [evidence §4.2](BACKEND_FIRESTORE_REST_POC1_EVIDENCE_20261122.md).

## 6. Rules for the F3a gateway (best practices distilled)

1. **Relative resource names in bodies** (`writes[].update.name`, `writes[].delete`, query `document.name` comparisons); absolute URLs only for endpoints.
2. **Verb-on-parent URLs:** `…/documents:runQuery`, `…/documents:beginTransaction`, `…/documents:commit`; collection selectors live inside `structuredQuery.from`.
3. **Never order-sensitive compare** of Firestore documents; canonical/deep equality only.
4. **Independent read-back after every write** (kept from POC design; owner directive "API OK ≠ data proof").
5. **Fakes enforce real 400 contracts**; add negative shape tests whenever a live probe reveals a seam.
6. **Live POC before building the gateway** — this incident is exactly the risk the POC lane exists to surface early.

## 7. Gates and boundaries (unchanged)

Synthetic DEV data only; no real data, no `ENFORCED`; private key/token never logged, returned or committed; new-store **PDPA + security review [#55](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/55) remains a human gate, OPEN**; publication stays owner-controlled; **every GAS push waits for a fresh owner `PUSH_VEHICLE_GAS`**. Re-run PASSed (run #2): `VEHICLE_FIRESTORE_POC_APPROVED` removed (re-arm read-back verified), result recorded in the evidence doc §4.2; **F3a unblocked for offline build**.