# P6VC Live API Automation

Status: canonical test design and executable workflow, 2026-11-21.

## One-command workflow

From the repository root:

```bash
npm --prefix apps/vehicle-contact/backend/gas run test:live
```

This always runs the credential-free stages. It also runs the authenticated stage when the gitignored `.env` or process environment supplies `P6VC_TEST_USERNAME`, `P6VC_TEST_PASSWORD`, and `P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV`.

Require all three stages explicitly:

```bash
npm --prefix apps/vehicle-contact/backend/gas run test:live:full
```

The full command fails closed when credentials or the write confirmation are absent. A missing optional authenticated stage produces `PASS_PUBLIC_ONLY`, never a claim that all operations passed.

## Stages and test cases

| Stage | Cases | Coverage | Mutations |
| --- | ---: | --- | --- |
| `PUBLIC_DIRECT_GAS` | 11 | Public health, API envelope, request correlation, bad version/payload/route, prototype route denial, anonymous protected-operation denial, invalid login DTO | None |
| `WORKER_FAIL_CLOSED` | 14 | Origin allowlist, operation allowlist, session shape, DTO field allowlist, request ID, size limit, content type, malformed JSON, HTTP method, CORS preflight, public health | None |
| `AUTHENTICATED_FULL_INVENTORY` | 72 expanded cases | All 56 inventory operations, positive and negative RBAC paths, registration/photo/approval lifecycle, idempotency, vehicle/contact/change/QR/audit/retention behavior, cleanup | Synthetic DEV records only |

A full successful run executes 97 recorded test cases in addition to supporting login and cleanup calls.

### Public direct-GAS cases

- `LIVE-01`/`LIVE-02`: GET and POST health return HTTP 200 and `ready`.
- `LIVE-03`/`LIVE-04`: unsupported API version and invalid payload are rejected.
- `LIVE-05`/`LIVE-06`: unknown and prototype-polluting routes are rejected.
- `LIVE-07`–`LIVE-09`: vehicle lookup, contact read and QR resolve require a session.
- `LIVE-10`: malformed login input returns `INVALID_REQUEST`.
- `LIVE-11`: a safe request ID is returned unchanged.

### Worker edge cases

- `WF-01`–`WF-06`: deny unknown origins, non-allowlisted operations, missing sessions, injected roles, unknown fields and invalid request IDs.
- `WF-07`–`WF-10`: enforce request size, JSON content type, valid JSON and POST-only access.
- `WF-13`/`WF-14`: reject extra envelope fields and unsupported versions.
- `WF-12`: CORS preflight returns the approved origin and POST support.
- `WF-11`: approved public health reaches GAS and returns the API envelope and CORS headers.

### Authenticated cases

- Authentication: admin and synthetic users, initial-login flag, password change, session, logout, invalid login, invalid Google token/link negatives.
- Authorization: admin-only `vehicles.list`, owner-only `vehicles.listMine`, worker-only `retention.listExecutable`, and staff denial checks.
- Administration: user create/list/update/role assignment/reset/suspend, organization create/list/update/disable, settings read/update, campaign create/list/validate/revoke.
- Registration: reference catalog, five photo uploads, submit plus idempotent replay, pending list, detail, photo read and approval.
- Vehicle lifecycle: lookup, detail, admin list, owner list, contact read/update, optimistic update, history, photo list/replace, change submit/list/review and cancellation.
- QR and audit: resolve, revoke, issue, replace, audit query and export.
- Retention safety: due/executable lists, missing job, non-approvable job and disabled execution. Destructive retention remains disabled.

## Safety and cleanup order

1. Run both credential-free preflight stages.
2. Stop before authenticated privileged writes if either stage fails.
3. Require protected test credentials and the exact synthetic-write gate.
4. Create only uniquely tagged synthetic users, organization, campaign, photos, registration and vehicle.
5. In `finally`, cancel an approved synthetic vehicle if it is still active, revoke the campaign, disable the organization, suspend synthetic users and log out the automation admin.
6. Record cleanup failures and fail the run; never hide them.
7. Persist sanitized reports after every test so an interrupted run leaves evidence.

No real customer data, production `ENFORCED` mode, live lockout test, real OIDC token, enabled destructive retention, credential, session token, raw response or PII is allowed in this workflow.

## Reports

All paths are relative to the repository root:

- `test-results/p6vc-live-api-suite.json` — aggregate status, source commit, stages, counts, operation coverage and cleanup.
- `test-results/p6vc-live-public-smoke.json` — 11 direct-GAS cases.
- `test-results/p6vc-live-worker-failclosed.json` — 14 Worker cases.
- `test-results/p6vc-live-owner-dev-regression.json` — 72 authenticated cases and cleanup evidence.

GitHub Actions also writes a sanitized Step Summary and uploads the reports as a seven-day artifact.

## Executed evidence — 2026-11-21

Command:

```bash
npm --prefix apps/vehicle-contact/backend/gas run test:live:full
```

Run window **22:01:34–22:10:30 Asia/Bangkok** against published GAS V48 / `0.9.1` and the deployed Worker. The 72-case authenticated inventory stage calls GAS directly; the Worker is verified independently by its 14 live edge cases and the offline gateway contract suite, so this is not a claim that all 56 operations were replayed through the Worker:

| Stage | Result |
| --- | --- |
| `PUBLIC_DIRECT_GAS` | 11/11 PASS |
| `WORKER_FAIL_CLOSED` | 14/14 PASS |
| `AUTHENTICATED_FULL_INVENTORY` | 72/72 PASS; all five roles exercised |
| Aggregate | **PASS — 97/97, 0 failed** |
| Operation coverage | **56/56, 0 missing** |
| Cleanup | **7/7 PASS**: campaign revoked, organization disabled, four synthetic users suspended, automation admin logged out |

Aggregate report: `test-results/p6vc-live-api-suite.json` (`secretsExposed:false`). The report's `sourceCommit` is `f14458d690662ce0908375a6e457b8e882158554`, the checked-out Git HEAD at execution; the new harness changes were still uncommitted in the working tree, so this field is not a claim that the report contains a clean-tree source hash.

An earlier credential-free run at 21:48–21:49 correctly returned `PASS_PUBLIC_ONLY`, 25/25 with `AUTHENTICATED_FULL_INVENTORY:SKIPPED_CREDENTIALS`. The later full result above supersedes that skipped stage. Neither result is production security, PDPA, UAT or release approval.

Offline `npm --prefix apps/vehicle-contact/backend/gas run check` also passed after the final source changes, including 250 RBAC matrix checks, compiled GAS AUTH 19/19, lifecycle 21/21 and display-error repair 4/4.

## Manual GitHub Actions run

Workflow: **P6VC Live Acceptance (manual only)** → mode `full-api-suite`.

The run is owner-only and main-only, and requires confirmation `RUN_FULL_API_SUITE`. Configure protected secrets `P6VC_TEST_USERNAME` and `P6VC_TEST_PASSWORD`; never place their values in the repository, workflow logs, issue or documentation.

Offline validation remains separate and live-free. Exhaustive RBAC and fault injection stay in the offline suites. Browser UAT, physical QR-camera checks, PDPA/security review and production release approval remain human gates.
