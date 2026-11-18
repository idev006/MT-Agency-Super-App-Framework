# P6 Vehicle Contact — Live Owner Development Regression

**Date:** 2026-11-18 Asia/Bangkok

**Database:** Owner-confirmed `P6 Vehicle Contact — Phase 1 Database` (`17uVyxgLkWoMrqUhgRVZQFp6EFs4oWb6lw2FPKogDqEE`)

**Drive folder:** Owner-confirmed project folder (`1bqnA4Ih_mki0xmHwp8A7r14UYuw8m22G`)
**Runner:** `backend/gas/scripts/run-live-owner-dev-regression.mjs`

## Observed live facts

- Codex called the GAS Web App directly; Cloudflare was not required for the main regression path.
- Contract baseline reached all 50 inventory operations: HTTP 200 for 50/50 envelopes, with one public Health success, 11 anonymous `UNAUTHENTICATED`, and 38 empty-payload `INVALID_REQUEST` responses.
- Correctly interpreted deployed credentials produced a direct GAS login, `SYSTEM_ADMIN` session, and `mustChangePassword:true`.
- Cloudflare Authentication Suite independently passed 8/8 against the same GAS target.
- A synthetic four-role lifecycle ran against the owner-confirmed development database: `REGISTRATION_ADMIN`, `STAFF`, `OWNER`, and `RETENTION_WORKER`.
- Live positive paths included System settings, Users, Organizations, Campaigns, five photo slots, Registration submission/idempotency/review, Vehicle lookup/detail/update/history/cancel, Contacts, Changes, QR revoke/issue/replace/resolve, Photo list/replace, Audit query/export, and Retention reads.
- Expected negative paths included invalid Google tokens, missing Retention job approval, and disabled destructive Retention execution.
- Synthetic fixture rows are intentionally retained as development evidence. Created users were suspended, Organization disabled, Campaign revoked, Vehicle cancelled, and fixture sessions revoked.
- A dedicated `p6vc_automation_admin` test identity is used for live regression. The permanent runner never changes or resets the human/bootstrap `admin` credential.
- The permanent runner completed against the owner-selected GAS with **63/63 tests PASS**, **50/50 inventory operations covered**, and **7/7 cleanup actions PASS**.
- Post-run identity verification confirmed `admin` remained `SYSTEM_ADMIN` with `mustChangePassword:true`; the automation identity remained `SYSTEM_ADMIN` with `mustChangePassword:false`. Both verification sessions were logged out.

## Oracle corrections found during the first live run

The first ad-hoc runner exposed test-oracle defects, not backend defects:

- `vehicles.update` returns `{vehicleId, version}`, not `updated:true`.
- `changes.review` returns `status:"APPROVE"`, not `status:"APPROVED"`.
- Invalid Google token adapters return `OPERATION_FAILED` at the public controller boundary.
- A missing `retention_days` setting needs a valid development value before vehicle cancellation can schedule retention.

The permanent runner encodes the corrected expectations.

## Running again

Set secrets only in the process environment, then execute from repository root:

```powershell
$env:P6VC_GAS_EXEC_URL = "https://script.google.com/macros/s/AKfycby15c-Aux2za0BuedeIYni8-tc6rkf9ZVNmw-6ZMTgPvG9SvFjuQVSzNoMouiMhqTmxrA/exec"
$env:P6VC_TEST_USERNAME = "p6vc_automation_admin"
$env:P6VC_TEST_PASSWORD = "<development password>"
$env:P6VC_ALLOW_OWNER_DEV_WRITES = "RUN_SYNTHETIC_OWNER_DEV"
node apps/vehicle-contact/backend/gas/scripts/run-live-owner-dev-regression.mjs
```

The sanitized result is checkpointed after every test and cleanup action to `test-results/p6vc-live-owner-dev-regression.json`. `SIGINT` and `SIGTERM` abort the active HTTP request and proceed through idempotent cleanup. Credentials, session tokens, raw API payloads, and raw backend responses are excluded.

## Current gate

| Gate | Result |
|---|---|
| Direct GAS connectivity | PASS |
| API inventory routing | LIVE PASS 50/50 reached |
| Direct admin Login/Session | LIVE PASS |
| Cloudflare Auth Suite | LIVE PASS 8/8 |
| Synthetic business lifecycle | LIVE PASS with corrected test oracles |
| Permanent live runner | LIVE PASS 63/63 tests, 50/50 operations, cleanup 7/7 |
| Reusable runner static safety tests | UNIT PASS 4/4 |
| Full backend build and test suite | PASS (`npm run check`, exit 0) |
| Destructive Retention execution | EXPECTED BLOCKED by runtime flag |
| Production release | NOT ASSESSED |

This is development evidence only. It does not certify production privacy, capacity, recovery, or release readiness.
