# P6 Vehicle Contact — Schema Sync Implementation, Phase 1
**Mode:** DETECT_AND_PROPOSE (NO WRITE)
**Standard:** [MT-GAS-SCHEMA-SYNC-001](../../../blueprint/MASTER_GAS_BACKEND_API_BLUEPRINT.md)

## Verified in source/CI after passing build
- Canonical [versioned JSON schema](../schema/database.schema.json) describes six candidate tables and field metadata.
- Pure `compareSchema` identifies unexpected/missing/duplicate/reordered headers and unexpected/missing worksheets.
- `proposeSchemaChanges` yields a review-required object with no guessed types.
- Sheets adapter reads tab names and only header row; never reads contact data rows for this operation.
- Editor-only `verifyVehicleSchemaFromEditor`, `inspectVehicleSchemaDriftFromEditor`, `proposeVehicleSchemaChangeFromEditor` get a private runtime property `VEHICLE_SHEET_ID`; doGet/doPost continue routing **only non-sensitive health**.
- CI must test injected fake sheet structures and bundled Apps Script global functions.

## Not implemented (do not claim otherwise)
- GAS deployment/authorization on actual account or live Spreadsheet schema read.
- Automatic `onChange` trigger, scheduled reconciliation, notifications, GitHub PR creation, auto-merge, or any schema migration.
- Production-safe vehicle CRUD, authentication, authorization, legal/data-owner signoff.
- Auto type inference from header/rows (explicitly disallowed without review).

## Migration decision flow
1. Detect physical drift from **actual** Sheet headers.
2. Compare against a **specific** immutable canonical JSON version embedded in the tested bundle.
3. Generate review proposal and determine data owner, privacy, impact and migration plan.
4. Approved PR modifies schema JSON and increments version; tests and artifact reviewed.
5. Approved migration job (future phase) applies additive operations in staging, verifies row preservation and rollback, then authorized production maintenance.
6. Record review ID, deployed version, backup and post-migration evidence. If any step fails, **stop**; no silent write.
