# P6 Vehicle Contact — Owner-Confirmed Login Test Target Reconciliation

**Date:** 2026-11-18 Asia/Bangkok  
**Scope:** Exact owner-provided Phase 1 Database; read-only metadata/selected-cell verification via connected Google Sheets.  
**Target Sheet:** [P6 Vehicle Contact — Phase 1 Database](https://docs.google.com/spreadsheets/d/17uVyxgLkWoMrqUhgRVZQFp6EFs4oWb6lw2FPKogDqEE/edit). This is the owner's explicitly selected test target, **not** the previously used separate Editor synthetic sandbox.

## Verified observed facts

| Check | Direct observation | Limit |
| --- | --- | --- |
| Spreadsheet | Exact supplied file ID accessible; title `P6 Vehicle Contact — Phase 1 Database` | Sheet access does not prove current GAS deployment configuration or state |
| Tabs | 24 native sheets present | Did not validate all rows/schemas in this pass |
| `vc_users` | One populated username in bounded B2:B20: `admin` | Cannot infer original temporary password |
| `vc_users` status | `ACTIVE`; `password_change_required=TRUE` | Flag is from Sheet, not a successful HTTP login |
| `vc_user_roles` | One active `SYSTEM_ADMIN` assignment | Role/resource authorization not tested by successful HTTP |
| `vc_sessions` | No populated status in bounded D2:D15 | Does not prove absence of older rows outside checked range |
| `vc_settings` | `idle_timeout_minutes=30` | Script runtime still requires verification |
| `vc_users.password_hash` | Present, format `pbkdf2-sha256$150000$<32 hex salt>$<64 hex digest>` | Structural validity only; password is unknown and was never read or disclosed |

## Reconciliation of previous HTTP failure

[Run 44127658157, attempt 3](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44127658157) deliberately attempted a synthetic user `test_sysadmin` and stopped after that login failed. The exact owner-selected database has only `admin` in the checked users range, so the test account **did not exist there**. This is a **test fixture mismatch**, **not proof of a defective `auth.login` implementation**.

The feature flag appeared enabled from live HTTP validation routing, but the actual running version and Script Properties must still be operator-verified. The owner explicitly identified this Sheet as the requested target; do not silently replace it with the earlier synthetic sandbox.

## Secure next-step test implementation

Added **manual-only**, **account-specific** test source [`login-http-acceptance.mjs`](../backend/gas/scripts/login-http-acceptance.mjs), now invoked by the `single-admin-login` mode in [`p6vc-live-acceptance.yml`](../../../.github/workflows/p6vc-live-acceptance.yml), with `admin` fixed by the workflow; the privileged mode remains owner-only and main-only.

1. Authorized owner adds existing **correct admin password** to repository Actions Secret `P6VC_HTTP_LOGIN_PASSWORD`; do not send the password, Script Property pepper, session tokens or password hash in chat or GitHub source.
2. Owner (`idev006`) manually dispatches the workflow from the `main` branch with the sole input confirmation `TEST_LOGIN_ON_APPROVED_SHEET`. The workflow explicitly FAILS if the actor, ref or confirmation differs. The target /exec and username `admin` are pinned in YAML to prevent accidental credential exfiltration to an alternate GAS Web App. Successful login creates **session/security-event writes** to the selected project datastore; Logout revokes the created session.
3. Workflow performs GET/POST logical tests for health, missing payload, anonymous session denial, valid `admin` login, `SYSTEM_ADMIN` session, enforced first-password-change state, logout and revoked-session denial. It **does not query/modify vehicle/contact/QR records**.
4. Report real HTTP outcomes and error codes only; scripts never log passwords/tokens/hash or raw server bodies. Do not run wrong-password loops on the admin account (the application has rate limiting).
5. Review security exposure and rotate the already disclosed `VEHICLE_AUTH_PEPPER` with operational coordination; pepper rotation alone does not automatically revoke extant sessions. Do not reset the original admin or rewrite the database merely to get a synthetic runner passing.

**Status:** Target and test account **confirmed from Sheet**; successful real HTTP `auth.login` **NOT YET TESTED** because the correct password has not been supplied through a secure runner secret. **Workflow safety update:** commit `b5d493b` restricts target URL and dispatch owner/branch; no Workflow dispatch or Google login has occurred. Tests have not been run automatically by committing the workflow. Separate security/PDPA release gates remain unchanged.

## Real manual login attempts (2026-11-18, Bangkok time)

The owner manually dispatched the original commit `72df8e6a47cccb829441dd20aba2d49c3ace2f69` twice before the restricted target/owner workflow change was applied. Sources: [Run #1](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44136273370) job `134226558511`, [Run #2](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44136808594) job `134228468244`. Both failed at exactly the same assertion.

| Case | Run #1 | Run #2 |
| --- | --- | --- |
| LOGIN-01.HEALTH | PASS (1584 ms) | PASS (1873 ms) |
| LOGIN-02.INVALID_EMPTY_PAYLOAD | PASS (1449 ms) | PASS (1849 ms) |
| LOGIN-03.UNAUTHENTICATED_SESSION | PASS (2020 ms) | PASS (1802 ms) |
| LOGIN-04.VALID_CREDENTIALS | **FAIL (5402 ms)**: `LOGIN_DENIED_INVALID_CREDENTIALS` | **FAIL (5411 ms)**: `LOGIN_DENIED_INVALID_CREDENTIALS` |
| LOGIN-05..08 | NOT RUN | NOT RUN |

The `P6VC_HTTP_LOGIN_PASSWORD` environment variable was present in both runs, shown masked (`***`) by GitHub. This proves **a secret was supplied**, not that the correct password was supplied. The GAS HTTP API reached its login logic and returned the same generic rejection in both attempts. There was **no successful login or authorized session**. Two failed attempts were made against the same username; the app rate-limit design allows six failures over 15 minutes, so avoid repeated guesses/retries. No login token/secret or personal data was printed.

**Differential diagnosis, not yet proven:** actual bootstrap temporary password does not match configured Actions secret (copy/paste, whitespace, another secret), or stored hash/provider compatibility bug. The code inspection of `IdentityOperations.login`, `GasSecurity.verifyPassword` and `BootstrapAdmin` shows that `password_change_required=true` should **not** prevent correct initial login; it affects follow-up protected operations. Pepper supplies entropy to new salt/token generation in this current implementation; existing password verification uses the stored PBKDF2 salt and hash, so rotating pepper alone is not a fix for this failure.

**Next safe diagnostic:** Owner verifies locally, without posting password, that the repository secret is the **exact password originally supplied to `VEHICLE_BOOTSTRAP_TEMP_PASSWORD`**, including case/symbols/no stray whitespace. If uncertain, follow a separately approved credential reset path; do not repeat `bootstrapVehicleAdminFromEditor` on populated tables, inspect/expose stored hashes, or brute-force the existing account. After any reset, invalidate sessions as appropriate. Re-run the **pinned-target manual-only** workflow only once after confirmed corrective action, not speculatively. If it still fails, collect sanitized API error and independent GAS cryptographic compatibility evidence before further login attempts.

**Acceptance:** `HTTP_LOGIN_FAIL_INVALID_CREDENTIALS`; 3 of 4 executed checks PASS, 1 FAIL; **8 total defined, remaining 4 not run**. This is not a production release or IAM certification.

## Offline PBKDF2 credential-verification comparison (2026-11-18)

With the owner's explicitly supplied **test-only** candidate password, an offline standard-library `PBKDF2-HMAC-SHA256` verification was performed against the existing `admin` row's stored hash in the owner-selected Spreadsheet: SHA-256, 150,000 iterations, stored hex salt and derived key. **Result: NOT MATCH.** Neither the candidate password nor the stored verifier was logged, committed, or sent to the live HTTP endpoint. No account row, existing session, or Script Property was changed during this check.

This independently explains the expected `INVALID_CREDENTIALS` when that candidate is used, but does not establish what the GitHub Action Secret currently contains and cannot rule out separate runtime bugs. The active `admin` hash **does not correspond to this provided candidate**. Do not keep retrying login or execute bootstrap again on a populated database. Next action is an explicitly approved one-time account credential reset through a trusted Editor-only procedure: issue a freshly salted PBKDF2 hash, retain `password_change_required=true`, revoke old sessions, perform read-back format checks and then run a single secured manual HTTP login test. Ensure no password/pepper/hash is committed in code, Actions logs, screenshots, or Issues. **No credential reset was performed in this comparison.**
