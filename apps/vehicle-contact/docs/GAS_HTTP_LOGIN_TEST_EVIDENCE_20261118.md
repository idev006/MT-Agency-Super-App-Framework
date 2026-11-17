# P6 Vehicle Contact — Live HTTP Login Acceptance Evidence (2026-11-18)

**Evidence date/time:** 2026-11-18 00:07 Asia/Bangkok (2026-11-17 17:07 UTC)  
**Target:** existing owner-supplied GAS `/exec` deployment; **NOT verified as isolated staging**.  
**GitHub Actions:** [run 44127658157, attempt 3](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44127658157), job `134216398199`, conclusion `success`  
**Test source SHA:** `20b388737651337d2933a563223b06f56bb0c208`, branch `test/p6vc-live-http-e2e-20261117`  
**Runner:** `backend/gas/scripts/verify-live-gateway.mjs`  
**Evidence type:** Real external GitHub-hosted Node.js HTTPS GET/POST to the configured GAS URL. Synthetic-only request data; no live PII or credential secrets printed.

## Actual observed result

| Test | Evidence | Outcome |
| --- | --- | --- |
| LIVE-01..LIVE-10 | Health, input rejection, unknown routes, request correlation and oversized payload guards | **10 PASS** |
| LIVE-11.AUTH_GATE_STATUS | Empty-credential `auth.login` returned the *enabled-dispatch* validation code `INVALID_REQUEST` (deduced from runner branching, not direct Script Properties read) | **PASS — gateway path reachable** |
| LIVE-12.PROTECTED_GATE_STATUS | Unauthenticated `vehicles.lookup` rejected with expected `UNAUTHENTICATED` (deduced from same branch and PASS assertion) | **PASS — one unauthenticated denial** |
| LIVE-13.SYNTHETIC_SYSADMIN_LOGIN | Known test-only `test_sysadmin` credential did not receive successful auth envelope; script printed `FAIL ... logical ok` | **FAIL — sandbox identity not proved** |
| Subsequent synthetic authenticated role/resource/lookup and mutation tests | Safety guard terminated test sequence before these calls | **NOT EXECUTED** |

**Runner final:** `{"status":"BLOCKED_STAGING_IDENTITY_MISMATCH","pass":12,"failed":1,"blocked":1}`. The GitHub workflow itself concluded **success** because the test runner correctly treats this as a guarded **environment blocker**, not an assertion that login was accepted. Do **not** report "13/13 PASS" or an authenticated end-to-end success.

**Comparison to 2026-11-17 attempts:** Previously `auth.login` and protected dispatcher returned `SERVICE_UNAVAILABLE`; the new response strongly suggests that protected dispatch is now enabled or its initialization/route configuration changed. **No direct evidence establishes the value of `VEHICLE_API_ENABLED` or which spreadsheet is attached.** Public /exec is not automatically safe for real personal data merely because one anonymous lookup was denied.

## Security and environment interpretation

- The synthetic account may not exist in the current target, its hash/pepper may differ, or deployed version/property/data source may not match the isolated Editor test. A genuine login implementation defect remains possible but **not yet demonstrated**.
- No further credential guessing or write tests are authorized on this ambiguous target. Avoid repeated bad-password probes because a six-failure/15-minute account throttle exists.
- Verify in the **Google Apps Script Editor** (without logging secrets): actual Script Project ID, Deploy → Manage deployments version/ID, `VEHICLE_API_ENABLED` enabled state, existence of `VEHICLE_AUTH_PEPPER` **only**, workbook identifier against the known isolated synthetic sandbox, and media folder isolation. Do not copy pepper/password/session token to GitHub, chat or logs.
- For real acceptance create/use a **different Google Apps Script Script Project**, not merely an additional deployment in the same project; GAS Script Properties are shared across deployments of a project. Use only synthetic identities and dummy vehicle data.
- Unless owner independently confirms the currently public endpoint is truly sandbox-only and permitted, treat enabled protected dispatch on the original business-data project as a **security review item** and keep real PII operations out of scope. Owner should restore disabled feature gate if that existing endpoint is attached to business data and lacks an approved ingress boundary.
- Do not attempt frontend production integration or live-data release.

## Required next acceptance

1. Operator proves a dedicated synthetic Script Project and its *own* Web App `/exec`, exact deployment version, isolated 24-tab workbook, synthetic media and non-sensitive configuration fingerprint.
2. Run the **existing manual-only** HTTP acceptance workflow with that dedicated staging URL; authenticate `test_sysadmin` and `test_staff` and assert the fixed synthetic vehicle fingerprint before any writes.
3. Record actual login/session/RBAC responses, wrong-password handling without enumeration, session expiration/revocation, role restrictions and cross-environment denial. If failed, preserve sanitized error codes and server diagnostics without credentials.
4. Escalate provider/PDPA/security approvals separately. **Editor 19/19 and 21/21 PASS remain valid in their narrow scope, but are not HTTP Acceptance.**

**Status:** `LOGIN_HTTP_BLOCKED_ENVIRONMENT_IDENTITY_UNVERIFIED`. Review required by Backend + Security + QA before rerun.
