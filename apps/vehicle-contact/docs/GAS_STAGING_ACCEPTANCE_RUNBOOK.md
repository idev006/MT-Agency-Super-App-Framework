# P6 Vehicle Contact — GAS Staging Acceptance Operator Runbook
**Source:** isolated user-owned synthetic sandbox, not production.  
**Test Spreadsheet:** [P6VC Backend Acceptance Test Sandbox](https://docs.google.com/spreadsheets/d/1kmUaBUC8slFICGLzxpNEUBsU87Sf-tnfe32AUs208As/edit)  
**Target GAS project:** [P6VC Apps Script Editor](https://script.google.com/d/1hgszMzlCLe5snPx7NY5fj-esZIIJDhXtiitTCXpgQRQKgqkBSXJyPvJX/edit)

### 1. Deploy source code (manual only, only after this acceptance PR is merged)
1. Open [Deploy P6 Vehicle Contact GAS (manual only)](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/workflows/deploy-vehicle-gas.yml).
2. Select `main`, type confirmation `PUSH_VEHICLE_GAS`, and click **Run workflow**. Expect Build/Test PASS and source push/version creation. Confirm script ID and backup source: `clasp push --force` replaces that GAS project's source.
3. The workflow **does not update `/exec` Web App deployment**. This is sufficient for Editor tests, but not an HTTP E2E release.
4. Do **not** rerun schema migration or initial admin bootstrap. Do **not** turn on `VEHICLE_API_ENABLED` for the original Phase-1 Database. The Editor tests inject their own isolated **synthetic** properties.

### 2. Real GAS Authentication + Sheets acceptance (non-destructive to original database)
In the Apps Script Editor, run **`runVehicleStagingAuthTestsFromEditor`**.
- Expected: `phase:"AUTH_AND_READ"`, **19/19 PASS**, `failed:0`. Each case includes `durationMs` and response does not print plaintext passwords or tokens.
- This creates synthetic session/audit/security rows in the **test-only** workbook and reads the fixture vehicle/contact/QR. The fixture `test_firstlogin` remains flagged for password change, and the run invalidates one synthetic STAFF session.
- If `failed>0`, stop here. Inspect the returned case IDs and log; do not proceed to lifecycle or edit the primary database.

### 3. Full real GAS + Google Sheets + Google Drive lifecycle (intentionally mutates sandbox only)
After 19/19 AUTH PASS, run **`runVehicleStagingLifecycleTestsFromEditor`**.
- Expected: `phase:"FULL_LIFECYCLE"`, **21/21 PASS**, `failed:0`, elapsed milliseconds and synthetic Drive test folder ID.
- Executes: five authenticated role logins, create campaign, upload 5 small PNGs, submit registration, approve, staff lookup, assign owner, owner change/review, rotate QR, replace one photo, cancel vehicle, set a synthetic retention job due, System Admin approve deletion, worker execute and verify audits survive.
- Requires the executing Apps Script account to have Drive + Sheets permissions. Only the new test folder and the hard-coded sandbox workbook may be modified.
- If a GAS execution times out or errors, inspect test-only Sheets `vc_operation_journal`, `vc_registration_requests`, `vc_photo_staging`, `vc_retention_jobs` and Drive folder before retrying. Do not blindly rerun a possibly partially completed state.
- Review the test folder and media-link inheritance separately; photo upload success alone is not mobile `<img>` compatibility.

### 4. Evidence & acceptance gates
Send execution logs containing the JSON test summary and `cases` array (redact any tokens if Google logs unexpectedly include them). Record the new GitHub source commit, GAS version and start/end timestamps. Only then may these gates be marked as actual GAS PASS.

**Deferred to dedicated staging Web App:** Use a distinct Script Project / deployment and the synthetic workbook, then enable authenticated protected business endpoints there and run POST /exec tests. The existing `/exec` URL is feature-gated and real auth over it has **not** yet been tested. Keep backend release gate open until this is done.
