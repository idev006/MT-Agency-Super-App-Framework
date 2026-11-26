# P6 Vehicle Contact — Independent Sheets SSOT Data Audit

**Date:** 2026-11-22 (Asia/Bangkok) · executed 04:41 UTC
**Trigger:** Owner directive — *"when full test you must audit sheets data too; maybe API told you OK but the real not OK."* An API `OK` response is **not** proof the persisted Sheets data is correct.
**Target:** the DEV synthetic spreadsheet "P6 Vehicle Contact — Phase 1 Database" (owner-provided SSOT; resource id held in GAS script property `VEHICLE_SHEET_ID`, intentionally not reproduced here).
**Baseline:** `main` @ `9269be2` (PR #114). Published GAS Web App **V48 / backend 0.9.1**.
**Mode:** **read-only**. No cell was written, no schema mutation, no retention, no `ENFORCED`.

## 1. Method (independent of the GAS API)

The audit does **not** call the GAS API and does **not** trust API responses. It reads **raw sheet cells** directly:

1. Open the spreadsheet in the Qoder in-app browser logged in to an authorized Google account (`thaipoliceregion6@gmail.com`).
2. Run [`sheets-data-audit.browser.js`](https://github.com/idev006/MT-Agency-Super-App-Framework/blob/15dae00/apps/vehicle-contact/backend/gas/scripts/sheets-data-audit.browser.js "removed 2026-11-26 (VC-ADR-044); last version") via `browser-use evaluate_script` (or DevTools console) on that page. The spreadsheet id is read from `location.pathname`, so the script is generic and hardcodes no private id.
3. For each of the 25 sheets it fetches the **read-only `gviz/tq?tqx=out:csv` export** (`credentials:'include'`), parses raw display values, and checks schema, display errors, logical FK integrity and seeded-fixture consistency.
4. Returns **sanitized counters only** — no display names, phones, password hashes/salts, token digests, `application_json` or other PII/secret material.

This is the data-layer complement to the API suite ([LIVE_API_AUTOMATION.md](LIVE_API_AUTOMATION.md), 97/97). Re-run it after any reset/seed/migration as a mandatory full-test stage.

## 2. Result summary — PASS

| Check | Result |
|---|---|
| Sheets audited | **25/25**, 0 fetch failures |
| Spreadsheet display errors (`#VALUE!`,`#REF!`,`#DIV/0!`,`#N/A`,`#NAME?`,`#NUM!`,`#NULL!`,`#ERROR!`) | **0** across all 25 sheets |
| Header matches `DATABASE_SCHEMA` | **25/25** (`headerFails: []`) |
| Trailing columns beyond schema | present on many sheets but **all empty** (`trailingNonEmpty: 0`) — benign formatting, not data |
| Logical FK integrity (real child→parent) | **12 checks clean, 0 orphans** |
| Seeded fixtures (raw cells) | **10/10 ACTIVE** synthetic vehicles complete (see §4) |
| `vc_vehicles` status | **10 ACTIVE + 26 INACTIVE** = 36 rows (matches lifecycle reset: 10 seeded, older retired) |

## 3. Per-sheet data row counts (sanitized)

| Sheet | Rows | Sheet | Rows |
|---|---|---|---|
| vc_vehicles | 36 | vc_campaigns | 10 |
| vc_vehicle_contacts | 36 | vc_registration_requests | 36 |
| vc_qr_tokens | 56 | vc_change_requests | 5 |
| vc_vehicle_photos | 180 (=36×5) | vc_retention_jobs | 26 |
| vc_lookup_audit | 107 | vc_settings | 2 |
| vc_change_audit | 328 | vc_photo_staging | 180 |
| vc_users | 26 | vc_idempotency | 36 |
| vc_user_identities | 0 | vc_operation_journal | 36 |
| vc_roles | 0 (see §5) | vc_migration_journal | 2 |
| vc_user_roles | 27 | vc_reference_values | 645 |
| vc_role_permissions | 0 (see §5) | vc_security_events | 156 |
| vc_user_permissions | 0 (overrides; none) | vc_sessions | 147 |
| vc_organizations | 9 | | |

## 4. Seeded-fixture consistency (raw cells, not API claims)

All **10 ACTIVE** synthetic vehicles `ฑฆ1000`–`ฑฆ1009` independently verified in the sheets:

| Assertion | Result |
|---|---|
| Each has exactly **1** row in `vc_vehicle_contacts` | **10/10** ✓ |
| Each has exactly **5** rows in `vc_vehicle_photos` | **10/10** ✓ |
| Each has exactly **1** row in `vc_qr_tokens` | **10/10** ✓ |
| Each has exactly **1** `APPROVED` row in `vc_registration_requests` | **10/10** ✓ |

FK checks with **0 orphans**: `vc_vehicle_contacts.vehicle_id`, `vc_vehicle_photos.vehicle_id`, `vc_qr_tokens.vehicle_id`, `vc_registration_requests.vehicle_id`, `vc_change_requests.vehicle_id`, `vc_retention_jobs.vehicle_id`, `vc_user_roles.user_id`, `vc_user_identities.user_id`, `vc_sessions.user_id`, `vc_photo_staging.campaign_id`, `vc_organizations.parent_id` (self), and `vc_lookup_audit.vehicle_id` after sentinel exclusion.

**Sentinel (expected, not a violation):** `vc_lookup_audit` holds **7** rows with `vehicle_id = "NO_MATCH"` — audits of lookups that found no vehicle. These are intentionally not real FK values and are excluded from orphan counting.

## 5. Finding: empty `vc_roles` / `vc_role_permissions` is BY DESIGN (not corruption)

The audit initially flagged `vc_roles` = 0 rows, `vc_role_permissions` = 0 rows, and **27** `vc_user_roles.role_id` values with no matching `vc_roles` row. This was investigated against the source before any conclusion:

- [`SessionService.js:2`](../backend/gas/src/application/security/SessionService.js#L2) declares `export const ROLE_PERMISSIONS = Object.freeze({...})` — an **immutable, server-authoritative code catalog** mapping each role name to its permissions (comment line 1: *"immutable role-to-permission policy"*).
- [`SessionService.js:10-15`](../backend/gas/src/application/security/SessionService.js#L10) `permissionsFor()` reads `vc_user_roles` (where `role_id` stores the **role NAME**) plus optional `vc_user_permissions` overrides, then resolves permissions via `ROLE_PERMISSIONS[r]` — **it never reads `vc_roles` or `vc_role_permissions`**.
- [`IdentityOperations.js:108,117`](../backend/gas/src/application/use-cases/IdentityOperations.js#L108) `assignRoles` validates each role against `ROLE_PERMISSIONS` (`hasOwnProperty`) and writes **only** `vc_user_roles`. No code path inserts/updates `vc_roles` or `vc_role_permissions` (verified by grep across `src`).
- The 27 referenced role names — `SYSTEM_ADMIN`, `REGISTRATION_ADMIN`, `STAFF`, `OWNER`, `RETENTION_WORKER` — **exactly match the 5 keys of `ROLE_PERMISSIONS`**, so every assignment resolves correctly at runtime.

**Conclusion:** `vc_roles` / `vc_role_permissions` are schema-declared but **runtime-vestigial**; the role→permission authority is the frozen code catalog. Empty role sheets alongside populated `vc_user_roles` is **correct by design**, not a data gap. This explains why the API RBAC (250 checks) passes while those sheets are empty — the API and the raw data are consistent.

**SSOT action:** the [ER diagram](DATA_MODEL_ER_DIAGRAM_20261122.md) and schema should annotate `vc_roles` / `vc_role_permissions` as *not runtime-populated; authority = `ROLE_PERMISSIONS` code catalog* so future engineers do not mistake empty sheets for corruption or attempt to "repair" them. `vc_user_permissions` is a legitimate optional per-user override table (empty = no overrides).

## 6. Use-case coverage boundary (honest)

The API suite covers **all 56 v1 operations** mapped to **all 20 use cases** ([use-case catalog](use-cases/catalog.json)). Two use-case happy-paths are **negative-only by design** and were **not** executed as live positive journeys:

- **UC-RET-02** (`retention.approve` / `retention.execute`): destructive retention is **gated/disabled**; tested as `approve.negative` and `execute.disabled`. No real deletion ran. C5 console remains blocked on D5 + B3.
- **UC-AUTH-03** (`auth.googleLogin` / `auth.linkGoogle`): real Google OIDC is **not provisioned in DEV**; tested as negatives. `vc_user_identities` = 0 rows is consistent with this.

This audit adds **persisted-state verification** for the core registration→approval→vehicle→contact/photo/QR journey (UC-REG-01/02, UC-VEH-01, UC-PHOTO-01, UC-QR-01) at the raw-data layer. It is **DEV synthetic data verification**, not browser/business UAT, not PDPA/security/production-release approval.

## 7. Reproduce

```
# 1. browser-use navigate_page -> the owner-provided spreadsheet /edit URL (logged-in account)
# 2. browser-use evaluate_script -> body of auditSheetsData() from:
#    apps/vehicle-contact/backend/gas/scripts/sheets-data-audit.browser.js
# Read-only; returns sanitized counters. Expect: 25 sheets, 0 errors, 10 complete ACTIVE fixtures,
# 12 clean FK checks, role_id "orphans" explained by §5 (code catalog).
```

## 8. Boundary

- Read-only audit of **synthetic DEV** data. No mutation, no destructive retention, no `ENFORCED`, no production release.
- Confirms data-layer correctness behind the 97/97 API suite; does **not** convert API automation or this audit into UAT/PDPA/security/release sign-off.
- Human gates (PDPA, security, UAT, production release, physical QR-device acceptance, credential rotation, D-E1/D3/D5/B3, VC-ADR-014/015/017) remain **OPEN**.