# BACKEND — Firestore live POC #2/#3 evidence (Node sync bridge → real gateway → live Firestore DEV)

- Date: 2026-11-22 (Asia/Bangkok)
- Status: **PASS** (live run, exit 0, 290 s) — report `test-results/firestore-live-contract.json` (gitignored, sanitized)
- Scope: POC #2 (real GAS `FirestoreRestGateway` + `FirestoreStore` driven from Node against live Firestore through a synchronous fetch bridge) and POC #3 (precondition/error calibration on the live API), plus F1 store-port contract on live data and a latency benchmark.
- Environment: project `mt-iam-core-2026`, database `(default)`, region `asia-southeast3` (Bangkok), SA `p6vc-firestore-dev` (roles `datastore.user` + `datastore.indexAdmin`), key outside repo (`~/.p6vc/…`, referenced via gitignored `.env`).
- Gates: `P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE` required; synthetic data only; pre-clean + post-clean read-back residue = 0. **No GAS push, no production touch.**

## Honest boundary

This run exercises the **real application gateway/store code** but over a **Node fetch transport**, not GAS `UrlFetchApp`. It proves protocol correctness, precondition semantics, index behavior and Node→Bangkok latency. It does **not** measure GAS-runtime overhead; wiring Firestore inside live GAS still requires `PUSH_VEHICLE_GAS` + the backend-selection flag, and cutover remains gated on #55 (PDPA/security human gate). Live Sheets runtime is unchanged (V50 / 0.9.2).

## Results

| Check | Result |
|---|---|
| Connectivity (OAuth token + runQuery + auth capture) | PASS |
| POC #3 calibration (below) | PASS — matches offline fake assumptions |
| F1 store-port contract on live Firestore (all 8 methods) | PASS |
| Composite index auto-provisioning (`vc_users` status ASC + `_seq` DESC) | PASS (CREATING → READY) |
| Latency benchmark N=15 per op (below) | recorded |
| Cleanup read-back (`vc_users` residue, counter docs) | PASS — residue 0, none remaining |

### POC #3 — live precondition truths

| Operation | Precondition | HTTP | gRPC status |
|---|---|---|---|
| create (`update` + `currentDocument.exists:false`) on **present** doc | exists:false | 409 | `ALREADY_EXISTS` |
| update (`exists:true`) on **absent** doc | exists:true | 404 | `NOT_FOUND` |
| delete (`exists:true`) on **absent** doc | exists:true | 404 | `NOT_FOUND` |
| duplicate create inside transaction | — | — | `ALREADY_EXISTS` |

These confirm the offline fake (`tests/fake-firestore-rest-server.mjs`) models real semantics; the store's DUPLICATE_KEY / NOT_FOUND mapping is therefore trustworthy.

### Latency (Node → Bangkok Firestore, warm keep-alive connections, ms)

| Op | n | p50 | p95 | max | mean |
|---|---|---|---|---|---|
| coldInsertFirst | 1 | 219.9 | — | 219.9 | 219.9 |
| insert | 14 | 248.3 | 421.2 | 421.2 | 258.2 |
| one | 15 | 34.3 | 54.0 | 54.0 | 36.6 |
| listFiltered | 15 | 42.4 | 81.6 | 81.6 | 47.8 |
| listNewestFiltered | 15 | 95.3 | **254603.1*** | **254603.1*** | 17790.6* |
| update | 15 | 400.9 | 857.8 | 857.8 | 439.7 |
| remove | 15 | 388.0 | 797.9 | 797.9 | 416.5 |

\* **Outlier annotation (mandatory):** the `listNewestFiltered` max ≈ 254.6 s is **index-build wait**, not query latency — the first DESC-ordered query hit `FAILED_PRECONDITION` while the composite index was still building and the transport-level backoff retried until serving caught up. Steady-state p50 is 95.3 ms. Writes cost ~3 round trips (`beginTransaction` + `batchGet` + `commit`), hence 250–440 ms vs 34–42 ms reads. Cold first insert 219.9 ms includes TLS/auth warm-up.

## Bugs found → root causes → fixes (SSOT knowledge transfer)

1. **Sync bridge hung on the 2nd call.** Hardening (error handlers, no `unref`) did not fix it. Root cause: the bridge **worker's event loop went idle**, so `Atomics.waitAsync` notifications were never delivered between calls. Fix: keep the worker loop alive with `setInterval(()=>{},1000)`; add crash/exit → wake-with-failure paths so a dead worker can never strand the main thread (`scripts/node-firestore-bridge.mjs`). Best practice: any `Atomics.waitAsync` consumer must own a live event loop; treat worker death as a first-class failure, not a hang.
2. **`:runQuery` errors are a stream array.** Live missing-index errors arrive as HTTP 400 with body `[{error:{code,status,message}}]`, while `:commit`/`:batchGet` return a bare `{error:{…}}`. The gateway read `parsed.error` → undefined → threw `FIRESTORE_HTTP_400` with no gRPC status, so the provisioner's `FAILED_PRECONDITION` retry never fired. Fix: normalize both shapes in `FirestoreRestGateway.call()` (`Array.isArray(parsed) ? parsed.find(x=>x&&x.error) : parsed`); regression **GW-11** added with `strictIndexes` fake returning the stream-array shape (gateway tests 11/11). Best practice: never assume one error envelope across REST verbs; capture raw live bodies as evidence.
3. **Composite index matching never succeeded.** Firestore appends an implicit trailing `__name__ ASC` field to every composite index. Strict spec comparison against our explicit fields never matched. Fix: filter `__name__` out before comparing (`explicit()` in `scripts/firestore-index-provisioner.mjs`).
4. **Index list READY ≠ query-serving ready.** The admin index list reported READY while `runQuery` still answered "index currently building". Fix: transport-level bounded backoff that re-issues the failed query after ensuring the index, covering both wrapped and per-dispatch unwrapped stores. Budget started at 24 × 5 s (120 s); the first full API-pipeline run showed 4 operations exhausting it (serving lag up to ~254 s measured in the POC bench), so it was enlarged to **60 × 5 s (300 s)**. Also tolerate 409 `ALREADY_EXISTS` on index create (idempotent provisioning), and surface 401/403 as `INDEX_PERMISSION_DENIED`.
5. **IAM gap:** auto-provisioning needs `roles/datastore.indexAdmin` in addition to `datastore.user`. Granted via Cloud Console (owner-authorized browser access); **reload + row read-back verified** before the PASS run.

## Reproduce

```bash
# from apps/vehicle-contact/backend/gas (key path/project via gitignored .env)
P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE \
  node --test scripts/firestore-live-contract.mjs
```

Runner: `scripts/firestore-live-contract.mjs` (HTTP_ERROR event capture, pre-clean, calibration, live F1 contract via `runStorePortContract`, latency bench, cleanup asserts). Offline guards: `tests/firestore-rest-gateway.test.mjs` (GW-11), `tests/store-port-contract.test.mjs` (Sheets + in-memory adapters, 2/2).

## Links

- [F1 store port](BACKEND_FIRESTORE_ADAPTER_F2_EVIDENCE_20261122.md) · [F3a gateway](BACKEND_FIRESTORE_GATEWAY_F3A_EVIDENCE_20261122.md) · [F4 infra](BACKEND_FIRESTORE_INFRA_F4_EVIDENCE_20261122.md) · [POC #1 + incident](BACKEND_FIRESTORE_REST_POC1_EVIDENCE_20261122.md) · [Cutover runbook](FIRESTORE_CUTOVER_ROLLBACK_RUNBOOK.md)

## Owner actions (unchanged gates)

- `PUSH_VEHICLE_GAS` (per push) before any GAS source push/deploy — **not requested or performed by this POC**.
- #55 PDPA/security review, publication, ADR ratifications remain human-only.