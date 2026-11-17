# Phase 1 Google Sheets Data Model — Candidate Schema

> **Canonical machine-readable SSOT:** [database.schema.json](../schema/database.schema.json). This is only a human-readable reference snapshot. Field type/required/key definitions in canonical JSON are **provisional** pending data-owner review. See [Data Dictionary Workflow](GAS_DATA_DICTIONARY.md) and [Schema Sync](SCHEMA_SYNC_IMPLEMENTATION.md).

**Status:** Working technical schema, NOT approved final business/PDPA schema.  
**Storage:** A single private spreadsheet in the user-specified `p6-vehicle-contact` Google Drive folder. One tab = one logical table. Exact file ID is supplied to the GAS runtime through the `VEHICLE_SHEET_ID` Script Property; do not hardcode secrets/IDs in committed source. See [Phase 1 architecture](PHASE1_GOOGLE_SHEETS_DATA_ARCHITECTURE.md).

| Tab | Header fields |
|---|---|
| vc_vehicles | vehicle_id, plate_normalized, province_code, vehicle_type, make, model, color, status, version, created_at, updated_at, created_by, updated_by |
| vc_vehicle_contacts | contact_id, vehicle_id, display_name, phone_e164, relationship, is_primary, status, verified_at, created_at, updated_at |
| vc_qr_tokens | qr_id, vehicle_id, token_digest, issued_at, revoked_at, issued_by, reason, status |
| vc_vehicle_photos | photo_id, vehicle_id, slot, storage_ref, mime_type, size_bytes, status, version, created_at |
| vc_lookup_audit | audit_id, actor_id, vehicle_id, lookup_source, result, correlation_id, created_at |
| vc_change_audit | audit_id, actor_id, entity_type, entity_id, action, redacted_summary, correlation_id, created_at |

Rows are empty: do not enter real personnel or vehicle contacts before policy/privacy and security release gates. These columns are initial candidate headers only; stable IDs, logical uniqueness, validation, cross-tab references, locking, backup, privacy and migration are not yet implemented.

**Authentication:** No plaintext users/passwords or secret session tokens stored in any tab. Secure account/session provider and access boundaries await separate design.
