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
