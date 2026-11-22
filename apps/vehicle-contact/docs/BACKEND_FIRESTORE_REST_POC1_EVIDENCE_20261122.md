# POC #1 — GAS V8 → Firestore REST + service-account OAuth proof (F3a de-risk)

**Date:** 2026-11-22 (Asia/Bangkok)
**Doc ID:** P6VC-BE-POC1-FIRESTORE-REST-001
**Slice:** POC #1, de-risks **F3a** (the real GAS REST gateway) before it is built. PM plan lane F, D-E1 Option 2 / [VC-ADR-019](DECISION_LOG.md).
**Status:** **OFFLINE PROOF DONE (10/10).** **LIVE GAS RUN #1 EXECUTED 2026-11-22 20:25 ICT: FAIL 5/8** — three real-API contract bugs (read-back key order, runQuery URL form, commit relative names) root-caused and **fixed in source**; see [incident doc](FIRESTORE_REST_LIVE_POC_INCIDENT_20261122.md) and §4.1. **LIVE GAS RE-RUN PENDING** a fresh owner `PUSH_VEHICLE_GAS` + editor Run (§6). The live runtime is **unchanged**: Sheets **V50 / 0.9.2** remains the system of record; the [F2 adapter](BACKEND_FIRESTORE_ADAPTER_F2_EVIDENCE_20261122.md) and this POC stay **bundled but UNWIRED**.
**Companion:** [F4 infra evidence](BACKEND_FIRESTORE_INFRA_F4_EVIDENCE_20261122.md) (project/SA/region/key), [F2 adapter evidence](BACKEND_FIRESTORE_ADAPTER_F2_EVIDENCE_20261122.md), [E1 migration design](E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121.md).

## 1. Why this POC exists (the honest gap)

The [F4 connectivity probe](BACKEND_FIRESTORE_INFRA_F4_EVIDENCE_20261122.md) passed **8/8**, but it ran on the **Node SDK** (`@google-cloud/firestore`, `preferRest:true`, ADC). That proves the *database, service account and credentials* work — it does **NOT** prove the **production GAS path**, which is a different runtime and a different auth mechanism:

| Concern | Node SDK probe (F4) | GAS production path (this POC) |
|---|---|---|
| Runtime | Node.js v24 | **GAS V8** (no Node APIs, no SDK) |
| Auth | ADC via `GOOGLE_APPLICATION_CREDENTIALS` | **Self-signed RS256 JWT** → OAuth token exchange |
| Signing | SDK internals | **`Utilities.computeRsaSha256Signature`** |
| HTTP | SDK gRPC/REST client | **`UrlFetchApp.fetch`** |
| Transport | Firestore SDK | **Firestore REST v1** (hand-built requests) |

**Nobody had proven that GAS V8 can actually sign a Google-acceptable JWT and reach Firestore over `UrlFetchApp`.** That is the single biggest technical unknown blocking F3a. This POC isolates and proves it with the smallest possible surface, so F3a is built on evidence rather than assumption.

## 2. What was built (GAS-compatible, no Node APIs)

- **Module:** [`src/infrastructure/persistence/firestore/FirestoreRestPoc.js`](../backend/gas/src/infrastructure/persistence/firestore/FirestoreRestPoc.js) — `runFirestoreRestPoc({utilities,urlFetchApp,clientEmail,privateKey,projectId,databaseId,clock})`. Self-contained: SA-OAuth JWT builder, Firestore typed-value codec, minimal REST ops (`PATCH`/`GET`/`runQuery`/`beginTransaction`/`commit`/`DELETE`), independent read-backs, sanitized result. **173 compiled lines**, no `import`/`export` in the `.gs`, no SDK/Node reference in `dist/`.
- **Editor entrypoint:** `pocFirestoreRestFromEditor()` exported from [`src/entrypoints/WebApp.js`](../backend/gas/src/entrypoints/WebApp.js). Trusted **GAS Editor ONLY**, never callable over `doGet`/`doPost`. Fail-closed gate `VEHICLE_FIRESTORE_POC_APPROVED=RUN_SYNTHETIC_FIRESTORE_POC`; reads the SA key from Script Property `VEHICLE_FIRESTORE_SA_KEY` (secret, never in source). `Logger.log` emits **sanitized steps/counters only** — no key, token or PII. Throws on non-PASS.
- **Offline test:** [`tests/firestore-rest-poc.test.mjs`](../backend/gas/tests/firestore-rest-poc.test.mjs) — wired into `npm test` / `npm run check`.

### The GAS production path (proven offline, pending live)

1. **JWT:** header `{alg:RS256,typ:JWT}`; claims `{iss:client_email, scope:'https://www.googleapis.com/auth/datastore', aud:'https://oauth2.googleapis.com/token', iat, exp:iat+3600}`. Signing input = `base64url(header).base64url(claims)`.
2. **Sign:** `Utilities.computeRsaSha256Signature(signingInput, privateKeyPem)` → byte array → `base64url` (padding stripped). JWT = `signingInput.signature`.
3. **Token exchange:** `UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {method:'post', contentType:'application/x-www-form-urlencoded', payload:'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=<JWT>'})` → `access_token` (kept in memory only).
4. **Firestore REST v1:** base `https://firestore.googleapis.com/v1/projects/{p}/databases/{d}/documents`, `Authorization: Bearer <token>`. Typed values `{stringValue|integerValue|doubleValue|booleanValue|nullValue|mapValue|arrayValue|timestampValue}`.

## 3. Offline proof — 10/10 PASS (real RSA, no network)

The offline test uses **real Node RSA** (`generateKeyPairSync`): fake `Utilities.computeRsaSha256Signature` signs with a real private key, and the fake token endpoint **cryptographically verifies** the RS256 signature with the public key. A fake in-memory Firestore REST server exercises every verb with independent read-backs. **After live run #1 (§4.1) the fake was tightened to enforce the real API contract** (nondeterministic key reordering on GET, parent-form-only `runQuery`, relative-name-only commit, relative `document.name` in query rows) — the original fake was more permissive than reality and hid three contract bugs.

| Test | Result | What it proves |
|---|---|---|
| POC-OFFLINE-01 | PASS | The JWT is a **cryptographically valid RS256 assertion** (signature verified; `iss`/`scope`/`aud`/`exp>iat` correct) |
| POC-OFFLINE-02 | PASS | Full REST path **8/8** with independent read-backs; correct verbs (PATCH/GET/POST/DELETE); **no residue** |
| POC-OFFLINE-03 | PASS | Typed-value codec round-trips string/int/bool/nested map/array |
| POC-OFFLINE-04 | PASS | `beginTransaction` → `commit` carries the tx id; write read back |
| POC-OFFLINE-05 | PASS | **Secrets never leak** into the returned/logged result (no token, no PEM) |
| POC-OFFLINE-06 | PASS | Token-exchange failure **stops before any Firestore call** |
| POC-OFFLINE-07 | PASS | **Read-back mismatch detected** (API OK ≠ data proof — owner directive) |
| POC-OFFLINE-08 | PASS | Transaction commit failure detected |
| POC-OFFLINE-09 | PASS | Config gate rejects a bad key **before any network call** |
| POC-OFFLINE-10 | PASS | Read-back deep-equal **survives Firestore key reordering** (top-level + nested); fake provably reorders |

**Full GAS check:** `npm run check` → build **58 `.gs` modules** (was 57; +1 POC), contract suite PASSED, `GAS-VM-03` confirms `pocFirestoreRestFromEditor` has a callable global GAS wrapper, **exit 0**, zero regressions. Verified **no `@google-cloud`/Node import leaks into `dist/`** — the POC bundles into GAS unchanged and is **not wired** into `Container.js` (default backend stays Sheets).

## 4. What ONLY the live GAS run can prove (irreducible unknown)

The offline proof validates **logic, request shapes, codec and JWT construction**. It cannot validate the **GAS service implementations themselves**:

- that **GAS `Utilities.computeRsaSha256Signature`** accepts the PKCS#8 SA PEM and produces a signature **Google's token endpoint actually accepts** (Node RSA ≠ GAS RSA);
- that **`UrlFetchApp`** reaches `oauth2.googleapis.com` + `firestore.googleapis.com` from the GAS egress path and the token is honored;
- that the **real Firestore DEV** persists/queries/commits the synthetic doc end-to-end via this hand-built REST client.

These are exactly the F3a blockers. **Until the live run passes, F3a is de-risked on paper, not on the GAS runtime.** This is stated honestly rather than claiming the POC is "done".

### 4.1 Live GAS run #1 (2026-11-22 20:25 ICT): FAIL 5/8 — root-caused and fixed

Run #1 (owner-authorized push; editor Run driven via OS-level input on the owner's visible browser) returned `passed:5, total:8`: CONFIG/TOKEN/WRITE/DELETE/DELETE_READ_BACK **ok**; READ_BACK `READ_BACK_MISMATCH`, QUERY `QUERY_HTTP_400`, TRANSACTION `COMMIT_HTTP_400`.

- **Proven live by run #1:** GAS `Utilities.computeRsaSha256Signature` RS256 JWT is accepted by Google's token endpoint; `UrlFetchApp` egress reaches oauth2 + Firestore; PATCH/GET/DELETE persist and clean up correctly. The irreducible runtime unknowns above are therefore **closed**.
- **The three failures were REST contract bugs**, reproduced and root-caused with a Node probe against Firestore DEV (real Google `INVALID_ARGUMENT` messages): (B1) order-sensitive `JSON.stringify` read-back compare vs Firestore's nondeterministic map-key order; (B2) collection-suffixed `…/documents/{coll}:runQuery` URL transcodes to `createDocument` — correct form is `…/documents:runQuery` with `structuredQuery.from`; (B3) `writes[].update.name` must be a **relative** resource name (`projects/…`), not an absolute URL (and query rows return relative names).
- **Fix:** `canon()` canonical deep-equal; parent-form runQuery + relative-name match; `relName()` for commit. Offline fake tightened to enforce these contracts (incl. the real 400s) + POC-OFFLINE-10. **Verification:** Node live-shape probe all-200 with read-backs and 404 cleanup; offline **10/10**; `npm test` exit 0; build 58 modules; `/exec` health still `0.9.2` (V50, unwired).
- **Remaining:** live GAS editor **re-run of the fixed source** — gated on a fresh owner `PUSH_VEHICLE_GAS` (§6). Full detail: [incident doc](FIRESTORE_REST_LIVE_POC_INCIDENT_20261122.md).

## 5. Boundaries — what this is NOT

- **NOT the production F3a gateway.** This is a throwaway proof. F3a adds the full [F2 store-port contract](../backend/gas/tests/store-port-contract.test.mjs) (`one/list/listNewest/insert/update/remove/withLock/sequence`), error mapping, retries, and **per-collection composite indexes** for combined `where+orderBy(_seq)`.
- **NOT cutover / backfill / wiring.** `Container.js` still injects `createSheetStore`; live runtime stays **Sheets V50 / 0.9.2**. F2 + POC remain unwired until **F3**.
- **NOT PDPA/security approval.** New-store **PDPA + security review ([#55](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/55))** remains a **human gate, OPEN** — not self-approvable by an assistant.
- **Synthetic DEV only.** One throwaway doc in `__p6vc_rest_poc`, deleted with read-back-verified cleanup. No real data, no `ENFORCED`, no destructive retention, no live Sheets mutation.

## 6. Live-run runbook (gated — owner actions)

The live proof requires the following, in order. **Step 1 is the binding per-push gate.**

1. **Owner types `PUSH_VEHICLE_GAS`** → assistant `clasp push` the source (adds the POC module + entrypoint; runtime dispatch unchanged). *No push happens without this exact phrase.* **Run #1 used one phrase; the fix re-push needs a NEW one — a prior phrase does not carry over.**
2. **Set GAS Script Properties** (Project Settings → Script Properties; additive, does not touch existing properties): **DONE for run #1** (all four set and verified; the SA key entered via a secret-safe loopback bridge, never echoed):
   - `VEHICLE_FIRESTORE_SA_KEY` = the **full SA key JSON** (secret — enters GAS's encrypted Script Properties store, **never source/log/git**; same key as `~/.p6vc/p6vc-firestore-dev-key.json`).
   - `VEHICLE_FIRESTORE_PROJECT_ID` = `mt-iam-core-2026`
   - `VEHICLE_FIRESTORE_DATABASE_ID` = `(default)`
   - `VEHICLE_FIRESTORE_POC_APPROVED` = `RUN_SYNTHETIC_FIRESTORE_POC`
   *Assistant can set these via the in-app browser GAS editor (owner session) after the push gate, or the owner sets them. The key is pasted only into the secure Script Properties UI.*
3. **Run `pocFirestoreRestFromEditor()`** in the GAS Editor (owner session via browser, or owner runs it). Read the sanitized `Logger.log` / return value. **Run #1 executed 2026-11-22 20:25 ICT → FAIL 5/8 (§4.1); re-run of the fixed source pending step 1.**
4. **Expected:** `{status:'PASS', tokenAcquired:true, passed:8, total:8, …}`. On any FAIL the function throws `FIRESTORE_REST_POC_FAILED:<reason>` and the sanitized step error identifies the failing seam (token vs REST vs read-back).
5. Assistant records the live result in this doc (update §3/§4), then proceeds to **F3a** only if the live path is green.

**After the POC:** remove `VEHICLE_FIRESTORE_POC_APPROVED` (re-arm the gate) and optionally clear `VEHICLE_FIRESTORE_SA_KEY` if the live gateway will use a different credential mechanism. The POC doc collection self-cleans.

## 7. SSOT lessons (bugs found + solutions)

- **Firestore REST verb URLs have NO `/` before the colon.** `…/documents:beginTransaction` and `…/documents:commit` append `:verb` directly to `/documents`, while `…/documents/{coll}:runQuery` and `…/documents/{coll}/{id}` use `/`. The first offline fake parsed every URL with a fixed `+1` slash offset and mis-routed `beginTransaction` to a 405. **Solution:** strip the base, then strip a *leading* `/` only if present, then match `:verb` suffixes. F3a's gateway must route these correctly.
- **Sanitized-step helper double-wrapped `note`.** Returning `{note}` from a step and spreading `{note:returnValue}` produced `{note:{note:…}}`. **Solution:** spread the returned object directly (`...(note||{})`). Minor, but it would have polluted the live evidence log.
- **`generateKeyPairSync` with `*Encoding` options returns PEM strings, not KeyObjects.** Calling `.export()` on the result throws. **Solution:** use the returned strings directly. (Test-only.)
- **Best practice reaffirmed:** every write is confirmed by an **independent read-back** (POC-04/06/08), and the offline suite includes a **deliberately corrupted read-back** (POC-OFFLINE-07) to prove the check actually catches divergence — honoring *"API OK ≠ data proof"*.
- **Live run #1 lessons (full detail in the [incident doc](FIRESTORE_REST_LIVE_POC_INCIDENT_20261122.md)):** (1) Firestore map-key order is nondeterministic — never order-sensitive compare; (2) `runQuery` verb goes on the `/documents` **parent**, collection inside `structuredQuery.from` (collection-suffixed URL silently routes to `createDocument` → 400); (3) body document names are **relative** (`projects/…`), URLs only for endpoints; (4) **offline fakes must enforce the real contract including its 400s** — a permissive fake encodes our assumptions and hides production bugs.

## 8. Reproduce (offline, autonomous)

```bash
# from apps/vehicle-contact/backend/gas
node --test tests/firestore-rest-poc.test.mjs   # → 10/10 pass
npm run check                                    # → build 58 modules + full suite, exit 0
```

No credentials or network needed for the offline proof (real RSA keypair is generated in-test). The **live** GAS run additionally needs §6 steps 1–3.