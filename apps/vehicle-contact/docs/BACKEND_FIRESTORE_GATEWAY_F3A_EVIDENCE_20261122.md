# F3a — real GAS Firestore REST gateway + backend selection flag (offline proof)

**Date:** 2026-11-22 (Asia/Bangkok)
**Doc ID:** P6VC-BE-F3A-GATEWAY-001
**Slice:** F3a of F3 ([#53](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/53)), D-E1 Option 2 / [VC-ADR-019](DECISION_LOG.md). Builds on [POC #1 live PASS 8/8](BACKEND_FIRESTORE_REST_POC1_EVIDENCE_20261122.md) and the [F2 adapter](BACKEND_FIRESTORE_ADAPTER_F2_EVIDENCE_20261122.md).
**Status:** **OFFLINE DONE.** 19 new tests pass; full `npm run check` **exit 0** (build **60 `.gs` modules**, 28 suite summaries all `fail 0`). **NOT pushed, NOT published, NOT wired live** — `VEHICLE_PERSISTENCE_BACKEND` is unset on the live project, so the runtime stays **Sheets V50 / 0.9.2**, byte-identical dispatch path. Dual-write / backfill / cutover / rollback = **F3b (next slice)**; live cutover remains gated.
**Companion:** [live-run-#1 incident (contract rules)](FIRESTORE_REST_LIVE_POC_INCIDENT_20261122.md), [F4 infra](BACKEND_FIRESTORE_INFRA_F4_EVIDENCE_20261122.md), [store-port contract](../backend/gas/tests/store-port-contract.test.mjs).

## 1. What was built

- **[`FirestoreRestGateway.js`](../backend/gas/src/infrastructure/persistence/firestore/FirestoreRestGateway.js)** — the production document-gateway the F2 adapter injects: `query(coll,{where,orderBy,limit})` + `runTransaction(fn)` with `tx.get/create/update/delete/query/runTransaction`. Transport = Firestore REST v1 over `UrlFetchApp` with service-account **RS256 JWT OAuth** (`Utilities.computeRsaSha256Signature`), the exact path POC #1 run #2 proved live. Access token cached until `expires_in − 60 s`. GAS-compatible: no Node/SDK API; `Utilities`/`UrlFetchApp` injected; PEM/token never logged, returned or embedded in errors.
- **[`StoreSelector.js`](../backend/gas/src/composition/StoreSelector.js)** — `createStoreForBackend({backend,props,services,clock})`: `sheets` (default) → `createSheetStore`; `firestore` → SA key from Script Property `VEHICLE_FIRESTORE_SA_KEY` → gateway → `createFirestoreStore`; **fail-closed** on unknown value (`UNKNOWN_PERSISTENCE_BACKEND:<v>`), missing key (`STORAGE_NOT_CONFIGURED`), malformed key (`INVALID_FIRESTORE_SA_KEY`) before any network call.
- **[`Container.js`](../backend/gas/src/composition/Container.js)** — runtime dispatch store now comes from the selector via Script Property **`VEHICLE_PERSISTENCE_BACKEND`** (unset ⇒ sheets). Only the runtime store is selected; schema/migration/seed maintenance paths stay Sheets-bound. Sessions/RBAC follow the selected store automatically.
- **Tests:** [`firestore-rest-gateway.test.mjs`](../backend/gas/tests/firestore-rest-gateway.test.mjs) (GW-01…10), [`firestore-store-rest-contract.test.mjs`](../backend/gas/tests/firestore-store-rest-contract.test.mjs) (identical store-port contract over the REST path), [`store-selector.test.mjs`](../backend/gas/tests/store-selector.test.mjs) (SEL-01…04 incl. Container-level dispatch traffic proof), shared contract-enforcing fake [`fake-firestore-rest-server.mjs`](../backend/gas/tests/fake-firestore-rest-server.mjs). Registered in `npm test`; composition guard [`api-wiring.test.mjs`](../backend/gas/tests/api-wiring.test.mjs) updated to assert the selector wiring.

## 2. REST mapping and transaction design

| Port call | REST v1 request | Contract rule applied |
|---|---|---|
| `query` | `POST …/documents:runQuery` `{structuredQuery:{from:[{collectionId}],where,orderBy,limit}}` | verb on the **parent**; collection inside `from`; single equality = `fieldFilter`, conjunction = `compositeFilter AND` |
| `tx.get` | `POST …/documents:batchGet` `{documents:[relative names],transaction}` | relative names; transactional read |
| `tx.create/update/delete` | local **write overlay** (read-your-writes), merged into one `POST …/documents:commit` | `writes[].update.name` / `writes[].delete` **relative**; `currentDocument:{exists:false}` on create, `{exists:true}` on update/delete |
| throw inside `fn` | `POST …/documents:rollback` (best effort) then rethrow | atomic: nothing committed |
| auth | `POST oauth2.googleapis.com/token` jwt-bearer assertion | RS256 via GAS `Utilities`; cached token |

- **Read-your-writes overlay:** server transactional reads return the tx snapshot, so the gateway overlays pending creates/updates/deletes on `tx.get` and `tx.query` (merge by id, re-filter, re-sort, re-limit) — mirroring the F2 fake semantics exactly and staying correct whether or not the server includes own pending writes.
- **Netting rule (bug B1, §5):** a doc created *and* deleted inside one tx produces **no write** — a `delete` with `exists:true` would 404 because the create never reached the server.
- **Error mapping:** non-2xx throws `Error('FIRESTORE_<status>')` with `.code = error.status` (`NOT_FOUND`, `ALREADY_EXISTS`, `ABORTED`, `FAILED_PRECONDITION`, …) so the adapter/use-cases can branch; index-missing `FAILED_PRECONDITION` surfaces untouched.
- **Ordering:** adapter-persisted `_seq` + `orderBy` (Firestore has no implicit row order). **`where + orderBy(_seq)` needs a per-collection composite index live** — provisioned at cutover (POC #2); offline fake sorts in memory.

## 3. Selection semantics (fail-closed)

| `VEHICLE_PERSISTENCE_BACKEND` | Behaviour |
|---|---|
| unset / `sheets` | Sheets adapter, exactly as V50 (zero Firestore traffic) |
| `firestore` + valid SA key props | REST gateway + Firestore adapter; Spreadsheet never opened |
| `firestore` without / with malformed key | throws before any store use or network call |
| anything else | `UNKNOWN_PERSISTENCE_BACKEND:<value>` |

SEL-04 proves at the **composition root**: `auth.login` dispatch on `sheets` opens the Spreadsheet and makes zero REST calls; on `firestore` it reaches REST (token + runQuery) and never opens the Spreadsheet; missing key yields a fail-closed `SERVICE_UNAVAILABLE` envelope.

## 4. Verification (offline, autonomous)

| Suite | Result |
|---|---|
| GW-01 config gate before network | PASS |
| GW-02 token cached, refreshed only near expiry | PASS |
| GW-03 parent-form runQuery + composite AND + orderBy + limit + decoded rows | PASS |
| GW-04 single `fieldFilter`; omitted where/orderBy/limit stay absent | PASS |
| GW-05 read-your-writes (get+query), merged create+update, netted create+delete, precondition-guarded relative-name commit | PASS |
| GW-06 throw ⇒ rollback, state untouched, no commit | PASS |
| GW-07 `ALREADY_EXISTS` / `NOT_FOUND` codes | PASS |
| GW-08 commit precondition race ⇒ `ALREADY_EXISTS`, winner not overwritten | PASS |
| GW-09 nested `runTransaction` inline, one begin/commit | PASS |
| GW-10 token failure stops before Firestore; no secret in results/errors | PASS |
| Store-port contract over adapter+REST gateway (identical suite to Sheets) | PASS |
| `_seq` ordering persists server-side across adapter instances; never leaks | PASS |
| `sequence()` commit/rollback over REST incl. counter not advanced by rolled-back tx | PASS |
| SEL-01…04 selection + Container dispatch traffic | PASS |
| Full `npm run check` | **exit 0**, 60 modules, 28 summaries `fail 0`, GAS-VM-00…03 pass |
| `dist/` leak scan | 0 `@google-cloud` / `node:` refs (`require(` matches are the bundle's own `P6VC_Runtime` registry loader) |

The fake server **enforces the real contract including its 400s** (parent-form-only runQuery, relative-name-only commit, reordered read keys, precondition failures) per the incident's mock-fidelity rule — which is exactly how B1 was caught offline.

## 5. Bugs found + solutions (SSOT)

- **B1 — create+delete in one transaction emitted an impossible delete.** The overlay collapsed the pair into a `delete` write with `currentDocument:{exists:true}`; the server 404s because the create was never committed. **Solution:** net the pair to no-op (drop the pending entry). Caught by GW-05 against the precondition-enforcing fake; general rule: *commit writes must describe net effects whose preconditions are satisfiable in write order*.
- **B2 — test-harness gaps, not product bugs:** the selector test's fake `Utilities` lacked `computeDigest/computeHmacSha256Signature/newBlob` (login hashes before touching the store), and the synthetic pepper was shorter than the product's ≥32-char gate (`AUTH_PEPPER_NOT_CONFIGURED`). Fixed in the fake/test only; the product gates behaved correctly (fail-closed).

## 6. Gates and boundaries (unchanged, human-only where marked)

- **No push / no publish / no live flag change in this slice.** Every GAS push still needs a fresh owner `PUSH_VEHICLE_GAS`; publication owner-approved; live cutover = F3b/F4 gates.
- **Composite indexes** per collection for `where+orderBy(_seq)` must exist before live Firestore reads (POC #2: index + latency at realistic scale).
- **Precondition status codes** (`ALREADY_EXISTS`/`NOT_FOUND` on commit) are single-document semantics in the fake; calibrate against live Firestore in the cutover rehearsal (POC #3).
- **[#55](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/55) new-store PDPA + security review = OPEN human gate**; production Firestore provisioning separate from DEV; no real data, no `ENFORCED`, no destructive retention.
- F3b (dual-write → backfill → read-back audit → cutover → rollback) is the next slice; Sheets stays SoR until then.

## 7. Reproduce

```bash
# from apps/vehicle-contact/backend/gas
node --test tests/firestore-rest-gateway.test.mjs tests/firestore-store-rest-contract.test.mjs tests/store-selector.test.mjs
npm run check   # build 60 modules + full suite, exit 0
```

No credentials or network needed offline (real RSA keypair generated in-test).