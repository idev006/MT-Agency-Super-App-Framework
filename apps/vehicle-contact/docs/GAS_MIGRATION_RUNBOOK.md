# P6 Vehicle Contact — additive GAS migration runbook

**Last updated (git):** 2026-11-17 · **Current state:** [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md)

This implements the canonical `schema/database.schema.json` as **forward-only** Google Sheets worksheets and appended headers. It never drops columns/tabs, rewrites existing data, or infers destructive transforms.

## Editor-only flow
1. Configure `VEHICLE_SHEET_ID` Script Property to the approved target spreadsheet (synthetic staging first).
2. Run `migrateVehicleSchemaFromEditor()` for dry-run. Inspect `steps` and `blocked`; resolve conflicts through reviewed schema changes, not automatic overwrite.
3. To run an additive migration, explicitly set Script Property `VEHICLE_SCHEMA_MIGRATION_APPROVED=true` under an authorized GAS Editor identity, then run `applyVehicleSchemaFromEditor()`.
4. The executor acquires `LockService`, makes a Drive copy of the whole spreadsheet **before** changing headers, then persists a migration journal in Script Properties. After the journal tab exists it also writes `vc_migration_journal`.
5. If interrupted after commencement, journal status becomes `RECOVERY_REQUIRED` when catchable; inspect the journal and the Drive backup and reconcile manually. Do **not** clear the journal and blindly rerun. It verifies all headers before reporting `APPLIED`.
6. Disable `VEHICLE_SCHEMA_MIGRATION_APPROVED` after use.

No migration is performed by `doGet` or `doPost`. No public endpoint allows setting approval flags. This is implementation-only and not evidence of a deployed or approved production migration.
