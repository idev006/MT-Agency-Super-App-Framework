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

Added **manual-only**, **account-specific** test source [`login-http-acceptance.mjs`](../backend/gas/scripts/login-http-acceptance.mjs) and workflow [`test-vehicle-login-http.yml`](../../../.github/workflows/test-vehicle-login-http.yml) with owner-confirmed target URL and `admin` as defaults.

1. Authorized owner adds existing **correct admin password** to repository Actions Secret `P6VC_HTTP_LOGIN_PASSWORD`; do not send the password, Script Property pepper, session tokens or password hash in chat or GitHub source.
2. Owner manually dispatches the workflow with exact confirmation `TEST_LOGIN_ON_APPROVED_SHEET`. This will cause authorized **login/session/audit writes** to the selected project datastore when credentials are correct; Logout revokes the created session.
3. Workflow performs GET/POST logical tests for health, missing payload, anonymous session denial, valid `admin` login, `SYSTEM_ADMIN` session, enforced first-password-change state, logout and revoked-session denial. It **does not query/modify vehicle/contact/QR records**.
4. Report real HTTP outcomes and error codes only; scripts never log passwords/tokens/hash or raw server bodies. Do not run wrong-password loops on the admin account (the application has rate limiting).
5. Review security exposure and rotate the already disclosed `VEHICLE_AUTH_PEPPER` with operational coordination; pepper rotation alone does not automatically revoke extant sessions. Do not reset the original admin or rewrite the database merely to get a synthetic runner passing.

**Status:** Target and test account **confirmed from Sheet**; successful real HTTP `auth.login` **NOT YET TESTED** because the correct password has not been supplied through a secure runner secret. Tests have not been run automatically by committing the workflow. Separate security/PDPA release gates remain unchanged.
