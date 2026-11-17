# Synthetic staging bootstrap — P6 Vehicle Contact

**Editor-only.** Never put passwords, tokens, API pepper, or spreadsheet IDs into the GitHub repository.

1. Run a reviewed additive migration into a synthetic **staging** spreadsheet first. No real vehicle/contact PII.
2. Configure GAS Script Properties:
   - `VEHICLE_SHEET_ID` — staging spreadsheet ID
   - `VEHICLE_AUTH_PEPPER` — high-entropy secret string (at least 32 characters, keep private)
   - `VEHICLE_BOOTSTRAP_STAGING_APPROVED=true` — explicit one-time staging approval
   - `VEHICLE_BOOTSTRAP_USERNAME` — initial admin username (lowercase)
   - `VEHICLE_BOOTSTRAP_TEMP_PASSWORD` — strong temporary password, at least 12 characters
   - `VEHICLE_BOOTSTRAP_IDLE_MINUTES` — approved explicit number between 1 and 480
3. Authorized developer runs `bootstrapVehicleAdminFromEditor()` in Apps Script Editor.
4. Bootstrap refuses to run when any user already exists. It writes the admin with `SYSTEM_ADMIN` role and password-change-required status, and creates the idle timeout setting. Temporary password and approval property are deleted after successful provisioning.
5. This procedure cannot be invoked through public `doGet`/`doPost`. It is not production release approval.

Protected API ingress remains disabled unless `VEHICLE_API_ENABLED=true` is separately set after security review and staging tests. Google OIDC also requires `VEHICLE_GOOGLE_CLIENT_ID`. Media APIs require `VEHICLE_PHOTOS_FOLDER_ID`. The destructive retention worker requires an additional `VEHICLE_RETENTION_EXECUTE_ENABLED=true` and a separately authorized worker role.

## GAS password hashing performance fix (2026-11-17)

Earlier Version 7 attempted 150,000 PBKDF2-HMAC-SHA256 iterations via 150,000 calls to the Apps Script `Utilities` service and could exceed the per-execution runtime. `infrastructure/security/Pbkdf2.js` now performs the inner iterations in GAS V8 JavaScript; the hash format remains `pbkdf2-sha256$150000$salt$hash`. Standard SHA-256 PBKDF2 output is checked against Node's `crypto.pbkdf2Sync`, including a 150,000-round Unicode vector and verification of the full `createGasSecurity` adapter.

**This is CI evidence, not a measured GAS runtime benchmark or a production security certification.** If staging bootstrap timed out before user creation, confirm `vc_users` and `vc_user_roles` state first. Never blindly clear partial rows or rotate the pepper. Rebuild and manually re-run the existing source-push Workflow after this fix is merged; Editor executions use latest pushed source, while published `/exec` deployments require independent version update. Do not send temporary passwords or `VEHICLE_AUTH_PEPPER` to chat, logs or GitHub.

## Synthetic GAS hash benchmark (after deploying optimized source)

Once the source commit containing `HashDiagnostics.js` has been pushed to GAS, authorized Editor users can run **`benchmarkVehiclePasswordHashFromEditor()`**. This function computes and verifies a fixed synthetic password in memory using the configured server-side `VEHICLE_AUTH_PEPPER` and reports only `hashMillis`, `verifyMillis`, the algorithm, the iteration count, and a `verified` boolean. It creates **no** `vc_users`, `vc_user_roles` or session row, and never logs the verifier or secret.

The initial `admin` / `SYSTEM_ADMIN` bootstrap was **completed successfully** before this fix. **Never rerun** `bootstrapVehicleAdminFromEditor()` on that Spreadsheet; it must remain one-time. Keep the business API feature flag disabled until the separate approved staging tests.
