# BACKEND — Full automated API/use-case pipeline on LIVE Firestore DEV (#69)

- Date: 2026-11-22 (Asia/Bangkok)
- Status: **PASS — 72/72 tests, 56/56 inventory operations covered, 0 audit failures, cleanup residue 0** (final run 181 s, exit 0)
- Report: `test-results/firestore-live-api-suite.json` (gitignored, sanitized — counters/field-names only, never values)
- Environment: project `mt-iam-core-2026`, database `(default)`, Bangkok `asia-southeast3`; synthetic data only; gate `P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE`.

## What ran

The **REAL application** — `Container → StoreSelector → FirestoreStore → F3a GAS REST gateway` — executed in Node over the keep-alive sync-fetch bridge ([POC #2/#3 evidence](BACKEND_FIRESTORE_LIVE_POC2_POC3_EVIDENCE_20261122.md)), driven by `createRegressionCases()` — the **same single case source** as the live GAS HTTP regression (`run-live-owner-dev-regression.mjs`). Full workflow: health → auth (invalid login, session, Google negatives) → config → 4 role actors (create/assignRoles/list/update/resetPassword/changePassword) → org → campaign → references → 5 photo slots → registration submit + idempotency replay → pending queue → detail/photo → review APPROVE → vehicle lookup/detail/photos/contacts/history/update → change submit/review → QR issue/resolve/replace/revoke → photo replace → audit query/export → cancel → retention (listDue/listExecutable/RBAC negative/jobStatus/approve negative/execute-disabled negative) → restore/cleanup. RBAC FORBIDDEN negatives included per role.

## SSOT verification — API OK ≠ data proof (owner directive)

Every successful `:commit` was captured at the transport and **independently re-read through the Node Firestore SDK** (a second, independent client implementation), decoded with a script-local decoder (not the gateway's), and compared field-by-field via canonical key-sorted deep-equal; deletes must read back absent. Pending audits coalesce per docPath (keep LAST commit) so rapid successive writes to the same doc (e.g. `_seq` counters) are checked against their final state.

| Audit metric | Result |
|---|---|
| Commits captured | 322 |
| Writes independently read back | 302 |
| Deletes independently read back absent | 4 |
| **Audit failures** | **0** |
| Final whole-store audit (SDK `count()` vs store-port `list` per table) | **25/25 match** |
| Cleanup (all 26 collections incl. counters) read-back residue | **0** |

Bootstrap (admin + settings) was itself written through the real store port and audited before any test ran.

## Latency (per full API dispatch, Node → Bangkok Firestore, warm indexes)

Honest interpretation: each dispatch includes the **per-dispatch SA OAuth token exchange** (89 exchanges / 91 dispatches — the real GAS Container creates a dispatcher per request, so this is GAS-parity behavior, not an artifact) and all store round trips. PBKDF2 (150k iterations) dominates auth ops. Raw Firestore op latency is much lower (POC #2: reads p50 34–95 ms, writes 248–401 ms).

| Operation | n | p50 ms | p95 ms | max ms |
|---|---|---|---|---|
| system.health | 1 | 0.4 | — | 0.4 |
| auth.login | 11 | 2333.6 | 2733.5 | 2733.5 |
| auth.session | 5 | 558.3 | 768.7 | 768.7 |
| auth.changePassword | 4 | 4248.1 | 5929.8 | 5929.8 |
| users.create | 4 | 2867.0 | 4804.5 | 4804.5 |
| users.assignRoles | 4 | 2105.9 | 3396.5 | 3396.5 |
| registrations.submit (incl. replay) | 2 | 921.9 | 4870.0 | 4870.0 |
| registrations.review | 1 | 6816.9 | — | 6816.9 |
| vehicles.lookup | 1 | 1732.7 | — | 1732.7 |
| vehicles.list | 2 | 251.0 | 469.9 | 469.9 |
| vehicles.listMine | 2 | 210.4 | 469.8 | 469.8 |
| changes.listPending | 1 | 1014.6 | — | 1014.6 |
| audit.query | 1 | 482.1 | — | 482.1 |
| audit.export | 1 | 442.9 | — | 442.9 |
| campaigns.validate | 1 | 134.8 | — | 134.8 |
| retention.listExecutable | 2 | 187.5 | 807.8 | 807.8 |
| **__all dispatches** | **91** | **1287.5** | **4278.3** | **6816.9** |

Full per-op table in the JSON report. Read-heavy list/audit ops land at ~0.2–1.2 s end-to-end; write-heavy multi-table ops (review = registration + vehicle + contacts + photos + QR + audit rows) at ~3–7 s. **These are Node-path numbers**; GAS `UrlFetchApp` adds its own overhead — GAS-runtime Firestore mode still requires `PUSH_VEHICLE_GAS` + the backend flag, and cutover stays gated on #55.

## Run history — bugs found → fixes (SSOT)

1. **Run #1 (659 s): FAIL 6/72, but 0 audit failures + residue 0.**
   - 4 ops (`users.assignRoles.reg`, `changes.listPending`, `audit.query`, `audit.export`) → `OPERATION_FAILED` after ~120 s: the index **serving lag after READY exceeded the 24×5 s retry budget** (POC #2 had measured up to ~254 s). Fix: budget enlarged to **60×5 s = 300 s** in `firestore-index-provisioner.mjs` (transport + wrapped-store paths).
   - 2 retention tests → `SESSION_IDLE_EXPIRED`: cold index builds stretched the run to 47 min; the worker actor's session (created early, used last) idled past the 30-minute timeout. Fix: **refresh the worker session immediately before the retention block** in the shared case factory (harmless for the fast GAS runner).
2. **Concurrency incident (self-inflicted, recorded as a rule):** a second suite run was launched while run #1 was still building indexes; its pre-clean wiped run #1's live state → cascading `campaignToken` TypeError. **Rule: NEVER run the API suite and the frontend bridge (or two suites) concurrently — they share one DEV DB and pre-clean it.** Also hardened the case factory: upstream-state resolution moved INSIDE the submit test so an earlier failure records a test FAIL instead of aborting the whole run.
3. **Run #2 (181 s, warm indexes): PASS 72/72**, 0 audit failures, 25/25 count match, residue 0.

## Reproduce

```bash
# from apps/vehicle-contact/backend/gas (key/project via gitignored .env)
P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE node scripts/firestore-live-api-suite.mjs
```

Scripts: `firestore-live-api-suite.mjs` (pipeline + latency + final audit + cleanup), `firestore-node-composition.mjs` (real Container + independent SDK auditor + HTTP-error visibility), `run-live-owner-dev-regression.mjs` (`createRegressionCases`, shared with live GAS runner; offline guard `tests/live-owner-dev-runner.test.mjs` 7/7). Offline: `npm test` pass, `npm run check` exit 0, gateway 11/11.

## Owner actions (unchanged gates)

- `PUSH_VEHICLE_GAS` per push — **no GAS push happened**; live runtime remains Sheets V50/0.9.2.
- #55 PDPA/security review, publication, ADR ratifications remain human-only.