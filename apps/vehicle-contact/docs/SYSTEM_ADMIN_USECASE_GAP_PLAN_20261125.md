# SYSTEM_ADMIN use cases: coverage check, Vehicle 360, QR history, plan (2026-11-25)

**Owner request:**
- "ตรวจสอบว่า implement usecases (workflow ของแต่ละ usecase) ของ Initial System Admin ครบถ้วนหรือยัง จงวางแผนอย่างรอบคอบ"
- "รายละเอียดของรถต้องแสดงให้ครบถ้วนทุกมิติ"
- "ต้องมีการเก็บประวัติการขอ QR ของรถแต่ละคัน"
- "มีอะไรควรปรับหรือเพิ่มอีกมั้ย"

**Sources checked:**
- [Approved baseline](APPROVED_REQUIREMENTS_BASELINE_R01_R26.md) (System Admin line, items 1, 7, 9)
- [use-cases/catalog.json](use-cases/catalog.json) (20 UCs)
- [contracts/api-inventory.v1.json](../contracts/api-inventory.v1.json) (57 operations)
- `SessionService.ROLE_PERMISSIONS`
- `OperationController` permission map
- the FE repositories (which operations the UI calls)
- `schema/database.schema.json`
- the live walk-through in [UI_AUDIT_SYSTEM_ADMIN_20261125.md](UI_AUDIT_SYSTEM_ADMIN_20261125.md)

## 1. Key finding: what a pure SYSTEM_ADMIN can and cannot do

`SYSTEM_ADMIN` permissions (from `SessionService`): `session.authenticated, system.settings.read/manage, users.manage, organizations.read/manage, campaigns.manage, qr.manage, retention.read, retention.delete.approve, audit.read, vehicle.list`.

It does **not** have `vehicle.lookup`, and that has consequences:
- **QR management:** "จัดการ QR" finds the vehicle with `vehicles.lookup`, so a pure SYSTEM_ADMIN **cannot** reach issue/revoke/replace. The baseline says the System Admin may suspend/revoke QR.
- **Registry:** the list works (`vehicle.list`), but "ดูรายละเอียด" opens `vehicles.detail` (`vehicle.lookup`), which is **FORBIDDEN**.
- **Why it wasn't noticed:** the "Initial System Admin" account explored on 2026-11-25 also holds REGISTRATION_ADMIN.

This gap is in the role design, not a bug in one screen. Fixing it means giving SYSTEM_ADMIN a way to see a vehicle, which is a **security/PDPA decision for the owner** (see §5, decision 1).

## 2. Use-case coverage (pure SYSTEM_ADMIN)

✅ = full workflow in API + UI · ⚠️ = partial · ❌ = missing or blocked

| UC | Workflow | API | UI | Status | Gap |
|---|---|---|---|---|---|
| UC-AUTH-01 | login / session / logout | ✅ | ✅ | ✅ | none |
| UC-AUTH-02 | first-login password change; reset another user's password | ✅ | ✅ | ✅ | none |
| UC-AUTH-03 | link Google; sign in with Google | ✅ | ⚠️ | ⚠️ | No Google sign-in button (`auth.googleLogin` unused); OIDC client not configured; the alert text is technical |
| UC-ADMIN-01 | create / list / edit / suspend / assign roles / reset password | ✅ | ⚠️ | ⚠️ | **No reactivation** of a suspended user (no API, no UI); organization is a free-text id (should be a list); no search/filter; forms stacked below the list |
| UC-ADMIN-02 | list / create / edit / disable organizations | ✅ | ⚠️ | ⚠️ | **No re-enable** of a disabled organization; no hierarchy (tree) view; list-row pattern |
| UC-ADMIN-03 | settings (idle timeout, retention days) | ✅ | ✅ | ✅ | Technical words ("backend", "session") |
| UC-CAMP-01 | create / list / revoke + copy link / share / QR (VC-ADR-031) | ✅ | ✅ | ⚠️ | No filter (active/expired/revoked); the **public registrant page** (baseline item 1) does not exist yet, so a campaign link still asks for a staff login |
| UC-VEH-01 (admin registry) | list → open detail | ✅ list / ❌ detail | ⚠️ | ❌ for pure SYSTEM_ADMIN | Detail is forbidden (§1); colour shown as a code in the list |
| UC-QR-02 | issue / revoke / replace | ✅ | ❌ for pure SYSTEM_ADMIN | ❌ | Cannot find a vehicle (§1). Also VC-ADR-032 is not implemented: QR as a link, stored token, print, suspend, request workflow, history view |
| UC-RET-01 | due list | ✅ | ✅ | ✅ | The notification scheduler of the baseline is not implemented (known gap) |
| UC-RET-02 | approve deletion; job status | ✅ | ✅ | ⚠️ | Destructive execution intentionally disabled (C5 BLOCKED on D5+B3) |
| UC-AUD-01 | query + export audit | ✅ | ⚠️ | ⚠️ | Search needs a raw vehicle id; export is JSON; no per-vehicle "who viewed this vehicle" view |

## 3. Vehicle details "in every dimension" (Vehicle 360)

| Dimension | Data exists (table) | Shown today | Needed |
|---|---|---|---|
| Identity: plate, province, plate type, vehicle type, brand, model, colour | `vc_vehicles` | ✅ (labels on detail; **codes** in the registry list) | Labels everywhere |
| Status + version | `vc_vehicles.status/version` | ✅ | — |
| Organization | `vc_vehicles.organization_id` | ✅ | — |
| Owner account (who may request changes) | `vc_vehicles.owner_user_id` | ❌ | Show linked owner account (name only) |
| Who created / last changed, and when | `created_by/updated_by/created_at/updated_at` | dates only | Add the person |
| Contacts: name, phone, relationship, primary | `vc_vehicle_contacts` | ✅ active only | Add `verified_at`; past contacts in history |
| Photos (5 slots) | `vc_vehicle_photos` | ✅ | Upload date; replaced photos in history |
| **QR: current + full history** | `vc_qr_tokens` (one row per issuance) + `vc_change_audit` QR_* | only "QR active + issued date" | **QR tab** (§4) |
| Registration origin: campaign, submitted, reviewed by/at, application snapshot | `vc_registration_requests` | ❌ | "การลงทะเบียน" section |
| Change requests (pending / approved / rejected) | `vc_change_requests` | ❌ (only audit lines) | List with status and reviewer |
| Change history (before/after, redacted) | `vc_change_audit` | ✅ last 100 | Paginate; show who |
| Access log: who searched/viewed this vehicle | `vc_lookup_audit` | ❌ | Admin-only (privacy oversight) |
| Retention (if cancelled): due date, approval, job status | `vc_retention_jobs` | ❌ | Show when present |

**Rule:**
- Each dimension is shown only to roles allowed by the permission matrix.
- STAFF must not see the access log or owner account.
- The server enforces this, exactly like contacts/photos today.
- A view-by-role matrix must be approved (decision 3).

## 4. QR history per vehicle (owner requirement)

**What is already recorded:**
- Every issue/replace inserts a new `vc_qr_tokens` row (`issued_at, issued_by, reason NEW|REPLACEMENT, status`).
- Revoke sets `status=REVOKED, revoked_at`.
- `vc_change_audit` has QR_ISSUED / QR_REPLACED / QR_REVOKED with the actor.
- So the **issuance history is not lost**, but no API returns it and no screen shows it.

**Missing to meet the requirement:**
1. **`revoked_by` and `revoke_reason` columns.** Today the revoke reason is free-less and the revoker is only in the audit.
2. **Reasons vocabulary:** NEW, REPLACEMENT, LOST, DAMAGED, STOLEN, VEHICLE_SOLD, ADMIN_REVOKE, SUSPENDED.
3. **QR requests ("การขอ QR")** as their own records, because a request is not an issuance. New table `vc_qr_requests`:
   - requested by;
   - channel (owner via "รถของฉัน" / admin);
   - reason;
   - status PENDING → APPROVED/REJECTED → ISSUED;
   - decided by/at;
   - the resulting `qr_id`.
4. **API:**
   - `qr.history` (by vehicle; `qr.manage` or registration admin);
   - `qr.requests.submit` (owner/admin);
   - `qr.requests.list`;
   - `qr.requests.review`.

   Additive contract change: the inventory, RBAC matrix and use-case SSOT are updated in the same PR.
5. **UI:** a "QR" tab on Vehicle 360, as a table with these columns:
   - date issued, issued by, reason;
   - status;
   - date revoked, revoked by, revoke reason;
   - printed/delivered (VC-ADR-032);

   plus the request list with status. The same table is reused on the QR management page.
6. **Proof (SIVP):** for each operation, read back `vc_qr_tokens` / `vc_qr_requests` / `vc_change_audit` directly from Firestore. A revoked QR must reveal nothing (S4 stays green).

## 5. Decisions needed from the owner

1. **SYSTEM_ADMIN and vehicles.** Choose one:
   - **(a)** a new permission `vehicle.admin.read`: detail **without** phone/contacts/photos, enough for QR management, registry and audit (recommended, least privilege);
   - **(b)** give SYSTEM_ADMIN `vehicle.lookup` (sees contacts too);
   - **(c)** keep as is and require REGISTRATION_ADMIN for QR work (then the baseline "System Admin may suspend/revoke QR" is not met).
2. **QR request workflow:**
   - who may request (owner? registration admin? system admin?);
   - who approves;
   - whether an admin can issue directly without a request.
3. **Vehicle 360 visibility by role:** which dimensions STAFF / REGISTRATION_ADMIN / SYSTEM_ADMIN / OWNER see.
4. **User reactivation and organization re-enable:** confirm they are allowed (audited, admin-only).

## 6. Plan (each step = one reviewable PR, verified against Firestore)

| Step | Scope | Acceptance (independent evidence) |
|---|---|---|
| S0 | Decisions §5 recorded as ADRs | Owner answers |
| S1 | RBAC fix per decision 1 + `users.reactivate` + `organizations.enable` (API + UI + audit) | RBAC matrix updated; pure SYSTEM_ADMIN live run can find a vehicle and issue/revoke QR; Firestore read-back of status + audit rows |
| S2 | Vehicle 360: all dimensions in §3 with per-role filtering; labels everywhere (registry colour) | Per-role live test: each role sees exactly its dimensions (server DTO); STAFF never receives the access log |
| S3 | QR history: `revoked_by`/`revoke_reason` + reasons + `qr.history` + QR tab | Read-back of every row after issue/replace/revoke; history table equals Firestore rows |
| S4 | QR requests (`vc_qr_requests` + 3 ops + UI in รถของฉัน / QR management) | Request → approve → issue chain read back; rejected request issues nothing |
| S5 | VC-ADR-032 rest: QR as link, signed-out landing page, stored token, print sheets (A4 + print-shop PDF, Python service), suspend | Non-staff scan reveals nothing (API + browser); print file matches active tokens |
| S6 | Audit usable by people: search by plate, per-vehicle access log, CSV export | Export rows equal `vc_lookup_audit`/`vc_change_audit` read-back |
| S7 | Public registrant page (baseline item 1) | Anonymous submit via campaign link; quota/expiry/revoke negative tests with read-back |
| UI | D1–D5 from the UI audit (tables, StatusBadge, PageState, filters, dialog forms, compact header) | Guard tests + axe + 375 px check |
| Ops | Synthetic residue cleanup + runners tag their records; Cloud Run concurrency (async host) | Firestore counts before/after; latency under parallel load |

**Recommended order:** S0 → S1 (unblocks SYSTEM_ADMIN) → S3 (owner's QR history, mostly existing data) → S2 → S4 → S5 → S6 → S7, with UI D1 alongside S2 so the new screens use the shared components from the start.

## 7. Owner decisions (2026-11-25, recorded as VC-ADR-036)

| # | Question | Answer | Effect on the plan |
|---|---|---|---|
| 1 | SYSTEM_ADMIN vehicle visibility | **See everything, including phone** | S1: SYSTEM_ADMIN gets `vehicle.lookup`, `vehicle.contact.read`, `vehicle.photos.read`, `vehicle.history.read`. Every view is still audited. |
| 2 | Who requests and approves a new QR | **Admin issues it themselves** | **S4 (request records) is dropped.** S3 adds a required reason, plus `revoked_by`/`revoke_reason` and `qr.history`. |
| 3 | Who sees "who viewed this vehicle" | **SYSTEM_ADMIN only** | S2: the access-log dimension needs `audit.read`. |
| 4 | User reactivation + organization re-enable | **Add both** | S1: `users.reactivate`, `organizations.enable`. |

**Updated order:** S1 (RBAC + reactivate/enable) → S3 (QR history with reasons) → S2 (Vehicle 360) → S5 (VC-ADR-032 rest) → S6 (audit for people) → S7 (public registration), with UI D1 alongside S2.

## 8. S1 live evidence (2026-11-25, BE 0.9.22: GAS V72 + Cloud Run, commit d7c4994)

**Deployment:** GAS V72, Cloud Run and the Worker all report health 0.9.22.

**Full live chain against Cloud Run** (`run-live-api-suite.mjs --require-authenticated --require-data-proof`)
- Result: **PASS 106/106**.
  - Public: 11.
  - Worker fail-closed: 14.
  - Inventory: 75 tests covering **59/59** operations, including `USERS.REACTIVATE` and `ORGANIZATIONS.ENABLE` (positive round trip + `INVALID_REQUEST_STATE` negative).
  - **DATA_PROOF 6/6**: Firestore SDK read-back. The report started 03:05:25Z, after the suite start at 03:03:08Z, so it is fresh evidence.
- 0 cleanup failures.

**Pure SYSTEM_ADMIN live check:**
- Synthetic account; Firestore `vc_user_roles` = `[SYSTEM_ADMIN]` only.
- Session permissions include `vehicle.lookup`, but not `vehicle.registration.approve`.
- `vehicles.lookup` OK with contact phone visible; `vehicles.detail` OK with history.
- **Firestore `vc_lookup_audit` +2 rows for that actor** (search + detail).
- `qr.issue` on a vehicle that already has an active QR → `QR_ALREADY_ACTIVE`, with Firestore active QR count 1 → 1. QR management is reachable, and the rule held without mutation.
- `registrations.listPending` → FORBIDDEN.
- Cleanup: account suspended (Firestore status = SUSPENDED).
