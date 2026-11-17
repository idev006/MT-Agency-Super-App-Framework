# Vehicle Contact — Phase 1 Google Sheets Data Architecture

**Status:** PHASE-1 ARCHITECTURE DIRECTION APPROVED BY OWNER, IMPLEMENTATION NOT YET VERIFIED  
**Date:** 2026-11-17  
**Scope:** `apps/vehicle-contact/` Phase 1 only  
**Parent:** [MT GAS Backend API Master Blueprint](../../../blueprint/MASTER_GAS_BACKEND_API_BLUEPRINT.md) / [Web App Master Blueprint](../../../blueprint/MASTER_WEB_APP_BLUEPRINT.md)

## 1. Binding Phase 1 choice

- **Google Sheets is the Phase 1 primary application datastore** for Vehicle Contact vehicle/contact/QR-related records; Supabase as authoritative primary datastore in older draft architecture is **superseded for Phase 1**. This does not decide future migration, which requires an ADR.
- **One Google Spreadsheet file = one logical application database; each worksheet/tab = one logical table** in the default design. This is a **logical analogy**, not relational database semantics. If splitting across files later becomes necessary, document ownership and permissions before doing so.
- The Frontend does not access the Google Sheet directly. **Frontend → app-specific API adapter → trusted authenticated API enforcement → GAS API Layer (group/action) → Application Use Case → Domain Repository Port → Google Sheets Repository Adapter → Spreadsheet**. An optional Gateway is acceptable only when the GAS execution surface cannot be bypassed to reach privileged data.
- GAS backend must implement dedicated business API groups, authorization for every protected action, input/output DTOs, logging and provider isolation per the central GAS Master Blueprint.
- **MT-I-AM integration deferred.** Phase 1 uses **Username/Password login** with a properly verified server-side session and permissions. Identity provider, user account store and safe trust boundary **remain subject to separate design/security sign-off**; no production exposure until an implementation is demonstrated. Do not store plaintext passwords or token signing secrets in Sheets, Git, browser JS or QR codes.
- **Google Sheets holds records; it is not an authorization boundary.** Script execution permissions, protected API ingress, and per-record access checks are still mandatory.
- No production personal data until privacy/legal ownership, access, retention and deletion controls are approved.

## 2. Logical data model — draft tables, NOT final schema

Tab names below are **candidates for review** based on the prior technical design, not an assertion that tabs exist or all columns are approved.

| Candidate worksheet (logical table) | Purpose | Logical identifiers and relationships |
|---|---|---|
| `vc_vehicles` | Vehicle master records | Opaque `vehicle_id` PK; normalized plate/province; record status/version |
| `vc_vehicle_contacts` | Responsible contacts | `contact_id` PK, `vehicle_id` FK; one primary active contact where approved |
| `vc_qr_tokens` | QR issuance / revocation | `qr_id` PK, `vehicle_id` FK; store digest, status, issue/revoke metadata |
| `vc_vehicle_photos` | Metadata about optional/required vehicle images (business rule **OPEN**) | `photo_id` PK, `vehicle_id` FK; **store metadata only**, not photo binaries in sheet cells |
| `vc_lookup_audit` | Authorized lookup audit | `audit_id` PK, actor reference, `vehicle_id` reference, result/time/correlation ID |
| `vc_change_audit` | Change history | `audit_id` PK, actor, entity, safe before/after summary, time |
| `vc_users` / `vc_roles` / `vc_sessions` | **NOT APPROVED AS SHEETS TABS**; candidate account/session concepts only | Must choose a secure authentication provider/session store separately; do not infer Sheets is adequate for password hashing/session enforcement |

Prior technical design names are retained for traceability. Columns, required/optional photos, relationship constraints, retention and privileges are not signed off yet. For photo binaries, choose restricted Drive or object storage in a separate decision; Google Sheets is not a photo-binary store.

## 3. Logical relational constraints that GAS must enforce

- Each record requires an immutable opaque `id` and defined key namespace; never rely on spreadsheet row numbers as durable record IDs.
- References between tabs use ID columns; code must check foreign-key existence, deleted/revoked state and allowed association before creating/updating records.
- Define uniqueness for active vehicle records using an explicitly approved plate+province normalization policy; use locking plus domain validation where race conditions matter.
- Use `LockService.getScriptLock()` and/or explicit record version checks for critical conflicting writes; lock scope must be measured. It does not provide ACID transactions; record partial failures and reconciliation.
- Build column-to-field mapping from approved header schema and verify schema version at startup; avoid domain code relying on column positions.
- Support bounded query/pagination, batch reads/writes, safe formula-injection handling, audit redaction and quotas.
- Establish data classification, owner, retention, backup/export and restore procedure. Never make a spreadsheet publicly readable for convenience.

## 4. Planned GAS business API groups (not implemented endpoints)

- `vehicles`: lookup, register, update (permission-specific)
- `contacts`: read/update, authorized disclosure only
- `qr`: resolve, issue, revoke; QR carries unpredictable opaque reference, no PII
- `audit`: restricted administrative review, not a public endpoint

These are logical `(apiVersion, group, action)` operations routed behind GAS `doGet/doPost`; they are not native REST paths. No group should be deployed until the authentication and direct-endpoint bypass threat is addressed.

## 5. Project implementation boundaries

```text
apps/vehicle-contact/
  src/infrastructure/adapters/gas/              # frontend adapter (target)
  backend/gas/src/entrypoints/                  # GAS runtime bridge (target)
  backend/gas/src/api/{routes,groups,controllers,dto,security,responses}/
  backend/gas/src/application/
  backend/gas/src/domain/ports/
  backend/gas/src/infrastructure/persistence/sheets/
  backend/gas/src/composition/
  docs/PHASE1_GOOGLE_SHEETS_DATA_ARCHITECTURE.md
```

This is target structure **not a claim that GAS backend exists already**. App-specific schema and API contracts belong under `apps/vehicle-contact/docs/`, not `blueprint/`.

## 6. Blocking decisions & evidence gates

1. Approve worksheet names, full columns, required fields, unique constraints and record lifecycle.
2. Choose safe Phase 1 username/password provider, server-side session verification, RBAC and non-bypassable GAS integration.
3. Confirm photo minimum and storage provider; current documents conflict on required photo count.
4. Confirm business roles, permissions, scope, audit/retention/privacy before storing real personnel contacts.
5. Test concurrent writes, duplicate registration, revoked QR, backup/restore, response redaction, quota and real device client integration.
6. Log actual spreadsheet/file IDs and endpoint/deployment identifiers only in approved protected configuration (never expose credentials).

**No feature activation is implied by this architecture decision.**
