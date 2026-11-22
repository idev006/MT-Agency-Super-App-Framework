# P6 Vehicle Contact — Data Dictionary / Schema SSOT (DB-agnostic logical)
**Status:** DRAFT TECHNICAL CONTRACT — NOT FINAL DATA-OWNER/PDPA APPROVAL  
**Date:** 2026-11-17 (DB-agnostic framing 2026-11-22)  
**Canonical source:** [database.schema.json](../schema/database.schema.json) — **only source of field definitions**, a **DB-agnostic logical model** (25 entities) constant across Sheets/Firestore. This page describes workflow; it is not a competing field list. Logical relationship view: [ER diagram](DATA_MODEL_ER_DIAGRAM_20261122.md). Derived physical projections: [Sheets](GAS_DATA_MODEL.md) · [Firestore](FIRESTORE_PHYSICAL_MAPPING_20261122.md).

## Source ownership and projection
1. GitHub `schema/database.schema.json` is canonical; schemas change only through reviewed PRs and versioned migrations. Table and column descriptors contain name, logical type, required flag, logical key, classification and provisional notes.
2. GAS `SchemaRepository.js` imports canonical JSON at source/build time; the V8 bundle embeds it as a read-only runtime projection. Existing Google Sheets are operational data, not a canonical schema.
3. The logical model has **25 entities**, projected one-to-one onto Sheets tabs in the private project Spreadsheet (and onto Firestore collections in the F2/F4 projection). The schema remains `PROPOSED_NOT_BUSINESS_APPROVED`; storage of identity/credential attributes is governed by the pending data-owner/PDPA review, not by this technical dictionary.
4. Types and constraints are **candidate design metadata**. Google Sheets does not enforce JSON types/PK/FK, and no production business validation may be assumed to exist yet.
5. For prospective fields, do not infer datatype, privacy classification, default, semantics or permission from header alone. Capture a pending proposal and seek data steward/security review.

## Controlled change examples
- A user inserts `parking_zone` into `vc_vehicles`: admin inspector returns `UNDECLARED_COLUMN`, a **proposal** with `inferredType=null`; no source/Sheet mutation.
- A user renames or deletes an established column: inspector returns `MISSING_COLUMN` plus `UNDECLARED_COLUMN` when relevant; do not overwrite or delete user data.
- Existing columns reordered: inspector reports `REORDERED_COLUMNS`; changes need review, mapping must be header-driven.
- New tab: `UNDECLARED_TABLE` proposal; missing tab: `MISSING_TABLE` blocking.
- Type changes cannot be reliably detected from headers alone: require separate sample/data profiling under an approved privacy process.

## Runtime and process
Run `verifyVehicleSchemaFromEditor()`, `inspectVehicleSchemaDriftFromEditor()` or `proposeVehicleSchemaChangeFromEditor()` manually from authorized GAS Editor **only after** Apps Script deployment and Script Property `VEHICLE_SHEET_ID` configuration. No public API actions expose these operations. All inspectors read Sheet names and first header rows, not data records.

Phase-1 mode is `DETECT_AND_PROPOSE`; it **does not** install `onChange` triggers, scheduled triggers, create GitHub PRs or apply migrations. Approved future steps: PR review → create migration plan with backup and security sign-off → apply in controlled staging → verify → staged production rollout. Any new column may temporarily exist in Google Sheets as drift; its presence does not mean it is approved for frontend/API usage.

## Security and operational constraints
- Do not publicly share the Spreadsheet, expose source credentials or render PII in logs.
- No auto rename/drop/type change and no implicit user authorization.
- Schema-change audit includes schema version, change proposal, approver, actual migration job and rollback evidence; **no actual migration run is claimed**.
- See [Development Roadmap](DEVELOPMENT_ROADMAP_PHASE1.md), [Data Architecture](PHASE1_GOOGLE_SHEETS_DATA_ARCHITECTURE.md), and [Master GAS Blueprint](../../../blueprint/MASTER_GAS_BACKEND_API_BLUEPRINT.md).
