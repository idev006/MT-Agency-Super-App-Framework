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

## Cybersecurity schema change proposal — 2026-11-17 (REVIEW ONLY)

**Source inspection:** Existing private project spreadsheet ID `17uVyxgLkWoMrqUhgRVZQFp6EFs4oWb6lw2FPKogDqEE` has exactly six worksheet names matching the six tables in the canonical `schema/database.schema.json` (read-only metadata verified). This check **did not validate headers, contents, access rights, log provenance, or retention**. No Sheet writes were performed. This proposal is deliberately **not** an edit to the canonical schema until the data steward, security reviewer and legal reviewer approve it.

### Gap assessment and proposed additive changes

| Existing / candidate table | Proposal | Reason and decision needed |
|---|---|---|
| `vc_lookup_audit` (existing) | Retain; evaluate adding event time, actor/session trust level, decision and event type only where not already represented | Existing fields `audit_id,actor_id,vehicle_id,lookup_source,result,correlation_id,created_at` do not independently prove authentication or network origin |
| `vc_change_audit` (existing) | Retain; validate immutable audit export and event integrity rather than duplicating changes | Existing fields `audit_id,actor_id,entity_type,entity_id,action,redacted_summary,correlation_id,created_at` are application-level change evidence |
| `vc_security_events` (candidate) | Additive table **subject to security and data-steward approval** | Login attempts, session revoke, permission denial, QR misuse and policy decisions; correlation ID, event timestamp, pseudonymous actor, event code, outcome, trusted source metadata indicator; no credentials/tokens/PII payloads |
| `vc_security_incidents` (candidate) | Additive table **subject to incident-process owner approval** | Incident reference, category/severity, detected/triaged/closed timestamps, assigned responder reference, evidence storage pointer, containment and review status; do not store raw incident evidence in cells |
| `vc_user_sessions` (conditional) | **Do not add yet** | Depends on VC-W04 selected authentication/session provider; a Sheets tab is not automatically a secure session store |
| `vc_log_retention` (conditional) | Prefer approved retention-policy configuration and versioned governance record, not necessarily a worksheet | Legal basis, category, retention clock, legal hold, purge approval, deletion evidence; do not assert one duration for all records |
| Computer traffic data | **Do not implement as a Sheets tab by default** | Confirm statutory service-provider classification, prescribed fields, trustworthy source IP and edge/proxy provenance, time synchronization, tamper resistance and protected storage; GAS `/exec` may not provide sufficient network metadata |

**Candidate minimum columns (not yet canonical):**
- `vc_security_events`: `event_id` (opaque key), `occurred_at` (UTC timestamp), `event_type`, `actor_ref` (nullable), `session_ref` (nullable pseudonymous reference), `resource_type`, `resource_ref` (nullable), `decision`, `correlation_id`, `source_context_ref` (nullable trusted ingress reference), `integrity_ref` (nullable protected-log reference). All candidate fields, types, nullability, access classification and retention are pending review.
- `vc_security_incidents`: `incident_id`, `detected_at`, `severity`, `category`, `status`, `responder_ref`, `evidence_ref`, `closed_at`, `reviewed_by`. No raw evidence or sensitive credentials in Sheets.

### Migration / rollback plan (no execution authorized)

1. Obtain written applicability opinion on Computer Crime Act section 26, B.E. 2564 traffic-log notification, Cybersecurity Act, PDPA and agency policies. Identify responsible system/service-provider roles and separate traffic-log retention from business/audit retention.
2. Confirm business/data/security owners (VC-W02), approved event taxonomy and privacy/retention matrix, approved session design (VC-W04), trusted ingress/log storage (VC-W05), and precise field classifications.
3. Draft a **separate reviewed change to the canonical JSON** with a new schema version only after approvals; preserve six existing tables and columns. Update generated schema projection and fake Sheets tests in the same PR; verify new/old schema drift and failure behavior.
4. Back up the actual Spreadsheet and record immutable backup identifier, headers, row counts, sharing/ACL review, approvers and a maintenance window. Use synthetic staging copy first.
5. Run **additive-only** migration: create approved tabs with headers; never rename/drop columns, never overwrite existing rows, never import live PII to test. Verify old rows unchanged, new headers exact, API fail-closed, security audit coverage and rollback procedure.
6. If migration verification fails, disable new writers and restore the approved staging backup or remove **only demonstrably empty newly-created tabs** with recorded approval. Never delete existing rows to roll back. Record migration journal, hashes/row counts, reviewer and post-migration CI evidence.
7. Keep protected business routes disabled until security, legal and PDPA release gates are evidenced. This proposal alone does not authorize production writes.

**Open blockers:** legal applicability and retention schedule, source IP/edge logging feasibility, ownership approvals, approved authentication/session provider, secure log store, full header and ACL verification, staging backup and migration executor. Do not mark VC-W27 complete.

## Reusable GAS Migration Engine implementation status — 2026-11-17

**Implemented in draft branch (source only):**
- `application/migrations/MigrationPlanner.js`: additive-only `create_table` and `add_column` dry-run planning, checksum and previously-applied guard, existing-table/header drift refusal.
- `application/migrations/MigrationJournal.js`: pure state-transition validator with PREPARED → BACKED_UP → APPLYING → VERIFYING → APPLIED, failure/recovery branches and evidence requirements; pure readiness checks for approvals, backup, lock, journal, staging, legal and security.
- `application/migrations/MigrationRunner.js`: dry-run orchestration; execution deliberately throws `MIGRATION_EXECUTION_NOT_IMPLEMENTED`.
- `infrastructure/migrations/SheetsMigrationAdapter.js`: read-only header inspection; `apply()` deliberately throws `MIGRATION_EXECUTOR_NOT_AUTHORIZED`.
- Synthetic unit tests added and included in `npm test`; GAS output contract updated to **22** modules and deployment workflow expected artifact count adjusted accordingly.

**Not yet implemented or verified:** real backup/copy, distributed lock, durable journal, immutable checksums, controlled executor, recovery job, approved v2 canonical schema, CI success, live GAS push, live Sheet mutation or Web App deployment. No production migration should be triggered from this source. The user has authorized engineering work, **not** bypassing the independent release/security/change-control gates.

**Next implementation gates:** build a deterministic migration registry and checksum verification; protected backup and staging fixtures; durable journal and lock with failure-injection tests; verified post-apply schema and row-preservation checks; then CI and reviewed rollout. Keep all live operations disabled until evidence and authorization exist.

## Engineering source update — additive executor (unverified)

The prior sections describe the older detect/propose-only baseline. Source code now includes an editor-only additive executor in `backend/gas/src/infrastructure/migrations/ExecuteAdditiveMigration.js`, connected through `Container.migrateSchema()`. It supports dry-run, blocked-drift handling, pre-change Drive backup, Script Properties journal, optional journal worksheet, additive tab/header changes, and verification. The Script Properties gate `VEHICLE_SCHEMA_MIGRATION_APPROVED=true` is necessary for the apply entrypoint. **No actual migration was run.** Failure recovery requires manual reconciliation; this is not transactional rollback. See [migration runbook](GAS_MIGRATION_RUNBOOK.md).
