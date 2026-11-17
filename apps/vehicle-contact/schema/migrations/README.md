# Controlled Schema Migrations (not yet executable)
Canonical schema: [../database.schema.json](../database.schema.json). Each future approved migration requires an immutable ID, from/to version, reviewer/approval, backup/rollback reference, forward operations, data-loss analysis, schema-drift preflight, staging tests and verification notes.

**Policy:** This folder contains no migration job yet. User-edited Google Sheets headers generate **proposals**, not automatically accepted SSOT revisions. Destructive changes (drop/rename/type conversion) always need explicit approval and backup verification.
