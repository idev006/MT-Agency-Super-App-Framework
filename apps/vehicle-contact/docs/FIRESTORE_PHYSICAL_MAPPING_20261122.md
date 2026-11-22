# Firestore physical mapping (DERIVED projection of the logical SSOT)

**Document:** P6VC-FS-MAP-001 | **Date:** 2026-11-22 (Asia/Bangkok) | **Status:** **DERIVED PHYSICAL PROJECTION — NOT AUTHORITATIVE.** The DB-agnostic logical SSOT is [database.schema.json](../schema/database.schema.json) + [ER diagram](DATA_MODEL_ER_DIAGRAM_20261122.md). This document maps that logical model onto Firestore for the [F2 adapter](BACKEND_FIRESTORE_ADAPTER_F2_EVIDENCE_20261122.md); it never defines fields/keys/relationships on its own.
**Companion:** [E1 datastore design](E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121.md) · [VC-ADR-019](DECISION_LOG.md) · [Architecture SSOT §6](ARCHITECTURE_SSOT.md) · [Sheets physical projection](GAS_DATA_MODEL.md).

## 1. Projection rules (logical → Firestore)

| Logical concept | Firestore physical | Authority |
| --- | --- | --- |
| Entity (`tables.{name}`) | **Collection** named verbatim (`vc_users`, `vc_vehicles`, …) | logical SSOT |
| Record | **Document** | logical SSOT |
| Primary key (`key:"primary"`) | **Document id** = the primary-key value (string) | logical SSOT |
| Attribute (`columns[]`) | Document **field** (canonical column name) | logical SSOT |
| Logical type `string` / `int` / `boolean` | Firestore `string` / `number` / `boolean`; **timestamps stay canonical ISO-8601 strings** (text-preserving parity with Sheets, no coercion) | logical SSOT |
| Equality `filter` | `where(field,'==',value)` conjunction | store port |
| Insertion order (`list`/`listNewest`) | **persisted `_seq`** monotonic integer per document + `orderBy(_seq)` | adapter (derived) |
| `sequence(fn)` | **real Firestore transaction** | store port |

**Internal adapter artifacts (NOT logical entities):**
- `_seq` field on every document — the persisted ordering key (Firestore has no implicit row order). Stripped from all port reads so canonical columns never leak it.
- `__p6vc_seq` collection — one counter document per logical table (`{value:N}`), incremented **inside the insert transaction** to assign the next `_seq`.

## 2. Collection / document-id map (all 25 logical entities)

| Collection | Document id (primary key) | Notes |
| --- | --- | --- |
| `vc_organizations` | `organization_id` | self-parent `parent_id` (hierarchy; B1 cycle guard in code) |
| `vc_users` | `user_id` | `password_hash`/`password_salt` restricted |
| `vc_user_identities` | `identity_id` | `user_id` logical FK |
| `vc_roles` | `role_id` | declared only; runtime policy is code `ROLE_PERMISSIONS` (ER §5.1) |
| `vc_user_roles` | `assignment_id` | `role_id` stores the role NAME |
| `vc_role_permissions` | `assignment_id` | declared only; not read at runtime |
| `vc_user_permissions` | `assignment_id` | optional per-user override |
| `vc_sessions` | `session_id` | `token_digest` restricted |
| `vc_security_events` | `event_id` | `username_digest` restricted |
| `vc_vehicles` | `vehicle_id` | optimistic `version`; unique ACTIVE plate+province enforced in code |
| `vc_vehicle_contacts` | `contact_id` | `phone_e164` restricted |
| `vc_vehicle_photos` | `photo_id` | `storage_ref` → Drive binary (never in the document) |
| `vc_qr_tokens` | `qr_id` | `token_digest` restricted |
| `vc_campaigns` | `campaign_id` | `token_digest` restricted |
| `vc_photo_staging` | `photo_id` | STAGED → CLAIMED promotion to `vc_vehicle_photos` |
| `vc_registration_requests` | `request_id` | `idempotency_key` |
| `vc_change_requests` | `change_id` | `proposed_delta` restricted |
| `vc_retention_jobs` | `job_id` | `legal_hold`; destructive execute disabled by default |
| `vc_lookup_audit` | `audit_id` | `result` restricted |
| `vc_change_audit` | `audit_id` | polymorphic `entity_id`/`entity_type` |
| `vc_operation_journal` | `event_id` | PREPARED/APPLIED/ROLLED_BACK/RECOVERY_REQUIRED |
| `vc_idempotency` | `key` | `request_digest` restricted |
| `vc_reference_values` | `reference_id` | self-parent `parent_code` (MODEL→BRAND) |
| `vc_settings` | `key` | `value` restricted |
| `vc_migration_journal` | `migration_id` | forward-only additive migration journal |

Relationships are **logical foreign keys enforced in application code** (existence/status/ownership before write) — Firestore has no FK constraints, exactly as Sheets has none. **No cross-collection joins** (owner directive): each use-case reads ONE bounded indexed query + in-memory assembly; reference catalog cached.

## 3. Index plan (F4 must provision — derived from query shapes)

- **Single-field equality** (`one`/`list` on one field): Firestore automatic single-field indexes suffice.
- **Multi-field equality** (e.g. `{vehicle_id, status}`): **composite index** required (one per filter combination used by use-cases).
- **Filtered + ordered windows** (`list`/`listNewest` = `where(...)` + `orderBy(_seq asc|desc)` + `limit`): **composite index** `(filter fields…, _seq)` required; an unfiltered `orderBy(_seq)` needs a single-field `_seq` index.
- The offline F2 fake filters/sorts in memory, so indexes are **not** exercised until F4 live. F4 must enumerate the actual use-case query shapes and create the matching composite indexes before cutover.

## 4. Scaling / correctness caveats (F4 decisions, honest)

- **Counter hotspot:** `__p6vc_seq/{table}` is a single document written once per insert. Firestore sustains ~1 write/s per document; at high write concurrency this needs **sharded counters** or server `createTime` ordering. The current F2 design favours deterministic, contract-proven ordering over write throughput.
- **Find-then-mutate window:** `update`/`remove` query outside the transaction then re-check existence inside it (fail-closed `NOT_FOUND`). F4 can move the query inside the transaction for snapshot consistency.
- **Restricted fields** (`password_hash`, `token_digest`, `phone_e164`, `storage_ref`, `*_json`, `value`, …) inherit the logical classification: never logged, exported, QR-encoded or rendered. Firestore security rules / IAM must enforce the same boundary (new-store PDPA + security review = human gate #55).
- **Data residency:** Bangkok `asia-southeast3` (owner infra decision, E1 §6).

## 5. Authority boundary

This mapping is **derived** and changes only when the logical SSOT changes (via reviewed PR + versioned migration). It does **not** approve the schema for production, ratify PDPA/security, or authorise cutover. Live provisioning, backfill (checksum-verified), independent document **read-back audit**, and the full live suite are **F4**; the selection flag + dual-write/cutover/rollback are **F3**. API `OK` ≠ data proof (owner verification directive).