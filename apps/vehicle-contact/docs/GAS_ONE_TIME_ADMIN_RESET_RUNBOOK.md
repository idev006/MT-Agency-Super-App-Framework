# P6 Vehicle Contact — One-Time Admin Password Reset (Editor Only)

**Document ID:** P6VC-RESET-001  
**Approval:** Project Owner approved implementation on 2026-11-18 (Asia/Bangkok).  
**Status:** CODE FOR REVIEW / NOT EXECUTED ON OWNER'S DATABASE.  
**Scope:** Recover the existing `admin` account only; no schema migration, user recreation or vehicle/contact operation.

## 1. Security boundaries

- `inspectVehicleAdminResetFromEditor()`: read-only preflight, intentionally **does not edit Google Sheets**.
- `resetVehicleAdminPasswordFromEditor()`: privileged mutation **only in the trusted Apps Script Editor**, not `doGet`/`doPost`; it requires a second, explicit approval flag.
- Targets only the existing `admin` row with matching user ID, `ACTIVE` state and active `SYSTEM_ADMIN` role. Never sets a new user ID or creates additional accounts.
- The current Script Property `VEHICLE_SHEET_ID` **must match** a separately supplied `VEHICLE_ADMIN_RESET_EXPECTED_SHEET_ID`; this is a target-confirmation gate.
- A separately verified, accessible **private backup copy** of the native Google Sheets workbook is mandatory before reset. This implementation does **not** create a backup or alter Drive permissions.
- New temporary password is input solely via GAS Script Properties, never via GitHub, chat, URL, logging or HTTP. Use a **fresh unique password not previously exposed in chat**; 16–128 characters, uppercase/lowercase/digit/symbol, no leading/trailing whitespace.
- On apply, build and self-verify the salted PBKDF2-SHA256 hash **before** Sheet writes; then acquire a Script Lock, re-check identity/target/approval, mark an irreversible state, revoke existing active sessions, replace only the password fields, preserve forced-password-change, and append redacted audit.
- After a started apply attempt, the password and approval properties are deleted. State remains `DONE:<timestamp>` or `RECOVERY_REQUIRED:<timestamp>`; either state blocks blind retry. The operation is **not ACID transactional**: a mid-flight GAS crash can leave partial writes. `RECOVERY_REQUIRED` must be investigated manually.
- No private password/hash, user ID, backup file ID, session token or pepper is printed by these Editor entrypoints.
- Deploying source with `clasp push` is distinct from republishing a versioned `/exec`; always verify which source/version each surface uses.

## 2. Pre-conditions — operator-owned (no application writes yet)

1. Verify the correct GAS Script Project, connected Sheet and a named authorized maintainer. The owner-selected workbook is **P6 Vehicle Contact — Phase 1 Database**. Do **not** repoint `VEHICLE_SHEET_ID` to another workbook.
2. Inspect `vc_users` first: existing `admin` account ID in column `A` (copy privately from its row), username `admin`, role `SYSTEM_ADMIN`. Do not put the user ID into chat/GitHub.
3. Make a private, owner-accessible Google Drive backup copy of the entire workbook. Confirm it is a native Google Sheet, located in a restricted folder with no anyone-link sharing, and record the copy's **file ID** privately. The reset function only validates that a distinct native Sheet backup is accessible, not its snapshot contents or ACL: operator verification of these remains mandatory.
4. Obtain reviewed and merged source for `AdminPasswordReset.js`, `WebApp.js` and the GAS build entrypoint registry. Run CI synthetic tests, manually push the source to the correct GAS Script Project using existing controlled deployment procedure. **No GitHub code commit automatically runs/reset accounts**.
5. In GAS **Project Settings → Script Properties**, set the following operator-specific values. DO NOT set the approval property yet:

| Script Property | Required value |
| --- | --- |
| `VEHICLE_ADMIN_RESET_EXPECTED_SHEET_ID` | Exactly the **existing** `VEHICLE_SHEET_ID` value (double-check) |
| `VEHICLE_ADMIN_RESET_EXPECTED_USER_ID` | Exact existing `admin` user ID from `vc_users` column A |
| `VEHICLE_ADMIN_RESET_BACKUP_FILE_ID` | ID of the operator-verified restricted Google Sheets backup copy |
| `VEHICLE_ADMIN_RESET_NEW_PASSWORD` | Fresh, unique strong temporary password (16–128 chars); **not** the test password disclosed earlier |
| `VEHICLE_ADMIN_RESET_APPROVAL` | **Leave unset until after successful preflight** |
| `VEHICLE_ADMIN_RESET_STATE` | **Must be absent before first run**; do not manually clear a state left by an earlier attempt |

6. Do not alter `VEHICLE_AUTH_PEPPER` while troubleshooting this reset. Previously disclosed pepper needs a separately reviewed rotation and session impact plan; changing it by itself does not solve a mismatched stored password hash.

## 3. Read-only preflight

In GAS Editor, select and run `inspectVehicleAdminResetFromEditor()`.

Expected sanitized result (illustrative, not a claimed actual run):

```json
{
  "status": "READY_FOR_EXPLICIT_EDITOR_RESET",
  "account": "admin",
  "role": "SYSTEM_ADMIN",
  "sessionsToRevoke": 0,
  "backupVerified": true,
  "credentialsExposed": false,
  "dataModified": false
}
```

`sessionsToRevoke` is the actual count and may differ. If an error occurs, do not proceed. Verify exact account, role, backup and Script Properties; do not delete/replace workbook rows.

## 4. Owner-authorized apply (changes existing admin auth fields)

**This is a separate owner approval gate for execution, after code review/preflight.**

1. In Script Properties, set `VEHICLE_ADMIN_RESET_APPROVAL` to exactly `RESET_ADMIN_ONCE`.
2. In GAS Editor, select **`resetVehicleAdminPasswordFromEditor()`** and Run **once** under the authorized owner identity.
3. Inspect sanitized result for `status:"DONE"`, `mustChangePassword:true`, `auditRecorded:true`, and actual `sessionsRevoked` count. Do not manually retry on timeout/failure.
4. Verify `VEHICLE_ADMIN_RESET_STATE` begins with `DONE:`. The temporary `NEW_PASSWORD` and `APPROVAL` properties should be automatically removed. If state starts with `RECOVERY_REQUIRED:` or execution times out, immediately inspect the target row, session statuses and audit record without rerunning.
5. The username, `user_id`, role and existing vehicle/contact rows must be unchanged.

## 5. HTTP acceptance after successful reset

1. Set GitHub Actions repository secret `P6VC_HTTP_LOGIN_PASSWORD` to the **new** temporary password. Never paste it into an Issue, PR, chat, CI log or source file.
2. Check that the published /exec is the expected reviewed version and protected API test is authorized. Account-lockout policy may reject further attempts for 15 minutes after prior failed logins.
3. Owner manually runs [single-account HTTP login acceptance workflow](../../../.github/workflows/test-vehicle-login-http.yml), with confirmation `TEST_LOGIN_ON_APPROVED_SHEET`. The runner verifies login, session, `SYSTEM_ADMIN` role, forced password change flag, logout and revoked-session denial. Do **not** rerun repeatedly if login fails.
4. After verified success, remove the GitHub Actions password secret if it is no longer needed. Do not mark broader business API/PDPA gates as PASS from login alone.
5. Once secure first-login UX is available, complete the mandatory password change. The temporary password should not become the long-term administrative credential.

## 6. Rollback and failure response

- `DONE` means the operation recorded completion. If HTTP login still fails, **do not** rerun reset; investigate deployment version, GAS auth service, stored hash verification and timing with sanitized evidence.
- `RECOVERY_REQUIRED` means **possibly partial writes**. Lock out automatic retries, review private backup and the existing `admin` row plus sessions and audit; decide a controlled recovery action with the owner, Security and QA.
- Never rerun `bootstrapVehicleAdminFromEditor()` on a populated database. Never manually clear `VEHICLE_ADMIN_RESET_STATE` or edit password hashes in Sheets.
- If first attempt stops before any write, the approval/password properties may remain pending; handle them privately and clear if abandoning. Do not publish screenshots with secrets.

**Acceptance reporting:** exact source commit, GAS Script ID/deployment version (redacted as appropriate), Editor function result, GitHub CI run, /exec HTTP run, reviewer and explicit release gate status. Tests with fake Sheets do not prove real GAS execution.
