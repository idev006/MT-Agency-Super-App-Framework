# P6VC — GAS Script Properties catalog

**SSOT in code:** [`RuntimeConfig.js`](../backend/gas/src/composition/RuntimeConfig.js) (`SCRIPT_PROPERTIES`). A test fails if source reads a property that is not catalogued. Decision: [VC-ADR-028](DECISION_LOG.md) (P1).

**Check without exposing values:** in the GAS editor, run `inspectVehicleConfigFromEditor`. The log prints **names only**: `missingRequired`, `gatesLeftOn`, `retiredPresent`, `unknown`, `apiEnabled`, `retentionExecuteEnabled`, `ok`. Never screenshot the Script Properties page (it shows secret values).

| Kind | Meaning | Properties |
|---|---|---|
| **required** | The API cannot run without it | `VEHICLE_API_ENABLED` (`true`), `VEHICLE_AUTH_PEPPER` (secret, ≥32 chars), `VEHICLE_FIRESTORE_SA_KEY` (secret JSON) |
| optional | A feature or a default fallback | `VEHICLE_PHOTOS_FOLDER_ID`, `VEHICLE_GOOGLE_CLIENT_ID`, `VEHICLE_FIRESTORE_PROJECT_ID` (default from key), `VEHICLE_FIRESTORE_DATABASE_ID` (default `(default)`), `VEHICLE_RETENTION_EXECUTE_ENABLED` (**keep absent**: C5 BLOCKED) |
| admin | Maintenance tools only | `VEHICLE_SHEET_ID`, `VEHICLE_BOOTSTRAP_USERNAME`, `VEHICLE_BOOTSTRAP_IDLE_MINUTES` |
| gate | Set just before an editor run, then delete (some are consumed automatically) | `VEHICLE_FIRESTORE_POC_APPROVED`, `VEHICLE_DEV_RESET_APPROVED`, `VEHICLE_SCHEMA_MIGRATION_APPROVED`, `VEHICLE_BOOTSTRAP_TEMP_PASSWORD`, `VEHICLE_BOOTSTRAP_STAGING_APPROVED`, `VEHICLE_ADMIN_RESET_APPROVAL`, `VEHICLE_ADMIN_RESET_NEW_PASSWORD`, `VEHICLE_ADMIN_RESET_EXPECTED_SHEET_ID`, `VEHICLE_ADMIN_RESET_EXPECTED_USER_ID`, `VEHICLE_ADMIN_RESET_BACKUP_FILE_ID`, `VEHICLE_REFERENCE_SEED_APPROVED_SHA256`, `VEHICLE_REFERENCE_SEED_RECOVERY_APPROVED` |
| state | Written by the system; do not edit by hand | `VEHICLE_MIGRATION_JOURNAL`, `VEHICLE_REFERENCE_SEED_JOURNAL`, `VEHICLE_ADMIN_RESET_STATE` |
| **retired** | No code reads them. Delete | `VEHICLE_PERSISTENCE_BACKEND`, `VEHICLE_FIRESTORE_DUALWRITE` (both retired by Slice G, VC-ADR-026) |

A minimal healthy runtime is the 3 required properties, plus `VEHICLE_PHOTOS_FOLDER_ID` and `VEHICLE_GOOGLE_CLIENT_ID` if those features are used.

**Performance note:** each request now reads all properties with **one** `getProperties()` call instead of one service call per `getProperty`.
