# E2 — Cross-role authorization regression + Worker fail-closed probes (2026-11-21)

**Slice:** E2 (production hardening, PM plan `PROJECT_MANAGEMENT_PLAN_20261121.md`)
**Scope:** prove the two authorization boundaries hold — (1) GAS server-authoritative RBAC across all 5 roles, (2) the deployed Cloudflare Worker `/api/frontend` edge denies every malformed / unauthorized / non-allowlisted request **before** it reaches GAS.
**Owner action required:** NONE for this slice. No credentials, no GAS push, no mutation. Live probes are credential-free and read-only.

---

## 1. What was delivered

| Artifact | Change |
| --- | --- |
| `tools/p6vc-api-test-console/worker.test.mjs` | +1 gateway regression test for the 3 newest allowlisted ops (`vehicles.listMine`, `changes.listMine`, `retention.listExecutable`): exact-DTO forwarding + 4 fail-closed negatives. Suite now **31 tests**. |
| `tools/p6vc-api-test-console/verify-live-worker-failclosed.mjs` | NEW credential-free live edge probe (14 cases) against the deployed Worker; writes redacted `test-results/p6vc-live-worker-failclosed.json`. |
| `.github/workflows/validate-p6vc.yml` | `node --check` syntax gate for the new probe (NOT live-executed in CI; live run is manual/authorized like `verify-live-gateway.mjs`). |

The offline cross-role RBAC regression (`apps/vehicle-contact/backend/gas/tests/actor-rbac-matrix.test.mjs`) already existed and is exhaustive; it was re-run green as E2 evidence (no source change needed — it derives from the API inventory, so it auto-covers new ops).

---

## 2. Bug found + solution (SSOT knowledge transfer)

**Bug — live-probe URL guard rejected the real Worker host.**
`verify-live-worker-failclosed.mjs` initially guarded the target with `/^https:\/\/[a-z0-9-]+\.workers\.dev\/api\/frontend$/`. The real host `p6vc-api-test-console.thaipoliceregion6.workers.dev` has **two** subdomain labels, so `[a-z0-9-]+` (no dot) failed the assertion and the script aborted before any probe.

**Solution:** allow dotted labels — `/^https:\/\/[a-z0-9.-]+\.workers\.dev\/api\/frontend$/`. Re-run → 14/14 PASS.

**Best practice:** a probe-target allowlist regex must match the *actual* deployment hostname shape (Cloudflare workers.dev hosts are `<worker>.<account-subdomain>.workers.dev`, i.e. multi-label). Validate the guard against the real URL before trusting it; an over-strict guard silently blocks the very evidence you need.

---

## 3. Best practices confirmed

- **Edge fail-closed is credential-free.** Origin lock, operation allowlist, DTO field/shape, session-shape, request-id, payload-size, content-type, JSON validity and HTTP-method denials all fire at the Worker **before** any GAS call. They need no secrets and cause no mutation. Only public read-only `system.health` reaches GAS (liveness). This lets the assistant prove production-edge hardening without owner credentials or a GAS re-push.
- **Allowlist-drift regression discipline.** Every newly allowlisted frontend op must have (a) a forwarding test asserting the exact payload reaches GAS unchanged, and (b) fail-closed negatives (missing session, injected `role`, unknown field, malformed token) asserting `fake.calls.length` stays at the valid-case count — i.e. invalid requests never reach GAS. The 3 C4/C5 scoped reads were allowlisted but previously untested at the edge; this slice closes that gap.
- **Synthetic shape-only token.** A non-secret `'a'.repeat(64)` passes the Worker session-SHAPE gate so DTO-field denial *ordering* can be proven (field validation precedes session validation) without ever holding a real credential.
- **Redacted, gitignored evidence.** The live report records only `id / status / http / errorCode` plus a `health=<status>` note — no payloads, tokens, usernames or PII. `test-results/` is gitignored; only the script + this doc are committed.
- **Server-authoritative RBAC.** The matrix asserts the *server session role*, never a client-supplied role/permission, governs access (MATRIX-02/04). FE permission gating is UX-only; GAS re-authorizes every call.

---

## 4. Test evidence

### 4a. Offline cross-role authorization regression (GAS)
`node --test tests/actor-rbac-matrix.test.mjs` → **5/5 PASS**
- MATRIX-00: inventory = 55 routes (54 DTOs + health); public ops exactly `auth.login, auth.googleLogin, campaigns.validate, photos.upload, registrations.submit`.
- MATRIX-01: anonymous denied at **49** protected operations with schema-valid payloads, **zero business writes**.
- MATRIX-02: **5 roles × 49 operations = 245 checks**; role-allowed = **78**, denied = **167**.
- MATRIX-03: public ops require a real business token/credential, not a fake role.
- MATRIX-04: client-supplied `role`/`permissions` in DTO → `INVALID_REQUEST`, no writes.

### 4b. Offline Worker gateway contract (Cloudflare)
`node --test worker.test.mjs` → **31/31 PASS, 0 fail** (includes the new scoped-reads regression: 3 ops forwarded with exact payload; missing-session / injected-role / unknown-field / bad-token all 403 and never reach GAS).

### 4c. LIVE Worker edge fail-closed (deployed production gateway)
`node verify-live-worker-failclosed.mjs` → **FINAL status PASS, 14/14, 0 failed**, ~3s.
Target: `https://p6vc-api-test-console.thaipoliceregion6.workers.dev/api/frontend`; allowed origin `https://idev006.github.io`.

| Case | Assertion | Result |
| --- | --- | --- |
| WF-01 | unknown origin → 403 `ORIGIN_NOT_ALLOWED` | PASS |
| WF-02 | non-allowlisted op (`vehicles.delete`) → 403 `OPERATION_NOT_ALLOWED` | PASS |
| WF-03 | protected op missing session → 403 `INVALID_SESSION_PAYLOAD` | PASS |
| WF-04 | injected `role` field → 403 `INVALID_OPERATION_PAYLOAD` | PASS |
| WF-05 | unknown payload field → 403 `INVALID_OPERATION_PAYLOAD` | PASS |
| WF-06 | unsafe request-id → 403 `INVALID_REQUEST_ID` | PASS |
| WF-07 | oversize non-media body → 413 `REQUEST_TOO_LARGE` | PASS |
| WF-08 | wrong content-type → 415 `JSON_REQUIRED` | PASS |
| WF-09 | malformed JSON → 400 `INVALID_JSON` | PASS |
| WF-10 | GET on `/api/frontend` → 405 `METHOD_NOT_ALLOWED` | PASS |
| WF-13 | extra envelope field → 403 `FIELDS_NOT_ALLOWED` | PASS |
| WF-14 | bad `apiVersion` → 403 `INVALID_ENVELOPE` | PASS |
| WF-12 | OPTIONS preflight → 204 + CORS origin/methods | PASS |
| WF-11 | public health through gateway → 200 `ok:true`, **health=ready** | PASS |

`health=ready` confirms GAS Backend **V39 / 0.9.0** is live and reachable through the Origin-locked Worker gateway. Report: `test-results/p6vc-live-worker-failclosed.json` (gitignored, redacted).

---

## 5. Production gate status

- **E2 offline regression:** GREEN (RBAC 245 checks + Worker 31 tests).
- **E2 live edge fail-closed:** GREEN (14/14 against the deployed Worker, no credentials).
- **Still owner-gated (unchanged):** authenticated live business E2E for C1–C4 (needs the 3 `.env` secret blanks), `PUSH_VEHICLE_GAS` re-push + publish for the C1 `changes.listPending` `proposedDelta` enhancement and B1/B4/B2 live probes, decisions D3–D5, VC-ADR-014/015 ratification, B3 mapping, E1 datastore decision, E3 PDPA/security/UAT/release sign-offs, and browser acceptance. C5 remains gated on D5+B3.