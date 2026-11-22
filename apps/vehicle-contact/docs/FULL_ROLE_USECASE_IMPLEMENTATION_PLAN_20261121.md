# P6 Vehicle Contact — Full Role × Use-Case Implementation Plan

> **CURRENT HANDOFF (2026-11-22) — HISTORICAL PLAN.** This captures the earlier V35/51-operation planning state and then-missing C1–C4 screens; do not resume those phases as pending work. The current baseline is **56 operations, 25 Sheets, GAS V48 / Backend 0.9.1**, with C1–C4 delivered. Read [Current Delivery Status](CURRENT_DELIVERY_STATUS.md), [Delivery Execution Plan](PROJECT_MANAGEMENT_PLAN_20261121.md), [Live API Automation](LIVE_API_AUTOMATION.md), and [Code Map](CODE_MAP_20261121.md) before acting. Preserve the analysis below as dated history.

**Date:** 2026-11-21 (Asia/Bangkok)
**Scope:** complete implementation plan covering all 5 roles and all use cases; current coverage matrix, gap analysis, phased small-slice plan, and engineering recommendations
**Runtime baseline:** `main` @ `fb0d626`; GAS Backend `0.8.1` live (Web App Version 35, health-probed via Worker); Worker self-deployed (`b08737d9`)
**Authority sources:** `SessionService.ROLE_PERMISSIONS` (role→permission), `OperationController` (operation→permission, 51 ops), `OperationPayloadValidator.DTO_SCHEMAS`, frontend `router/index.js` + `menu-catalog.js` + infrastructure repositories
**Status:** PLAN — not yet implemented. Primary-journey approval E2E (10 registrations) still pending owner DEV credential.

---

## 1. Role model (server-authoritative, immutable policy)

| Role | Permissions (`ROLE_PERMISSIONS`) | Primary mission |
|---|---|---|
| **SYSTEM_ADMIN** | session.authenticated, system.settings.read/manage, users.manage, organizations.read/manage, campaigns.manage, qr.manage, retention.read, retention.delete.approve, audit.read |.Configure system, manage users/orgs/campaigns, govern QR, approve deletions, audit |
| **REGISTRATION_ADMIN** | session.authenticated, organizations.read, vehicle.registration.approve, vehicle.lookup, vehicle.contact.read, vehicle.photos.read, vehicle.update, vehicle.history.read, vehicle.change.approve, qr.manage, retention.read | Intake/review registrations, maintain vehicles, approve owner change requests, govern QR |
| **STAFF** | session.authenticated, organizations.read, vehicle.lookup, vehicle.contact.read, vehicle.photos.read, vehicle.history.read | Read-only vehicle search / QR resolve / contacts / photos / history |
| **OWNER** | session.authenticated, vehicle.change.submit | Submit change requests for **own** vehicles (`owner_user_id === self`) |
| **RETENTION_WORKER** | session.authenticated, retention.worker | Execute approved deletions (`retention.execute`) |

Policy invariants already enforced: `RETENTION_WORKER` must be a sole role; no self-demotion / self-role-expansion / self-suspend; ownership check in `changes.submit`; two-person retention (approve ≠ execute).

---

## 2. Full use-case coverage matrix (51 operations)

Legend: **BE** = GAS use-case implemented; **FE** = frontend page/repository wired; ✅ done · ⚠️ partial/embedded · ❌ missing.

| Domain | Operation | Permission → Role(s) | BE | FE | Notes |
|---|---|---|---|---|---|
| Identity | auth.login | public | ✅ | ✅ | SignIn |
| Identity | auth.googleLogin | public | ✅ | ⚠️ | adapter real; needs `VEHICLE_GOOGLE_CLIENT_ID` + FE Google button |
| Identity | auth.session / logout / changePassword | session.authenticated (all) | ✅ | ✅ | session store / AccountSecurity |
| Identity | auth.linkGoogle | session.authenticated | ✅ | ⚠️ | needs Google client config + FE link flow |
| Users | users.create/list/update/suspend/resetPassword/assignRoles | users.manage → SYSADMIN | ✅ | ✅ | UserDirectory + UserAdministrationPanel |
| Orgs | organizations.list | organizations.read → SYSADMIN/REGADMIN/STAFF | ✅ | ✅ | |
| Orgs | organizations.create/update/disable | organizations.manage → SYSADMIN | ✅ | ✅ | |
| Campaigns | campaigns.create/list/revoke | campaigns.manage → SYSADMIN | ✅ | ✅ | |
| Campaigns | campaigns.validate | public | ✅ | ✅ | used by intake |
| Reference | references.registration | vehicle.registration.approve → REGADMIN | ✅ | ✅ | catalog store + combobox |
| Registration | registrations.submit / photos.upload | public | ✅ | ✅ | RegistrationIntake |
| Registration | registrations.listPending/detail/review/photo | vehicle.registration.approve → REGADMIN | ✅ | ✅ | RegistrationReview + gallery |
| Vehicle read | vehicles.lookup | vehicle.lookup → REGADMIN/STAFF | ✅ | ✅ | VehicleSearch |
| Vehicle read | qr.resolve | vehicle.lookup → REGADMIN/STAFF | ✅ | ✅ | QrResolve |
| Vehicle read | vehicles.history | vehicle.history.read → REGADMIN/STAFF | ✅ | ✅ | embedded in search/QR |
| Vehicle read | contacts.read | vehicle.contact.read → REGADMIN/STAFF | ✅ | ⚠️ | embedded in `vehicleView` |
| Vehicle read | photos.list | vehicle.photos.read → REGADMIN/STAFF | ✅ | ⚠️ | embedded in `vehicleView` |
| Vehicle read | **vehicles.detail** | vehicle.lookup → REGADMIN/STAFF | ✅ | ❌ | no dedicated detail view |
| Vehicle maint | **vehicles.update** | vehicle.update → REGADMIN | ✅ | ❌ | incl. `ownerUserId` linking |
| Vehicle maint | **vehicles.cancel** | vehicle.update → REGADMIN | ✅ | ❌ | creates retention job |
| Vehicle maint | **contacts.update** | vehicle.update → REGADMIN | ✅ | ❌ | |
| Vehicle maint | **photos.replace** | vehicle.update → REGADMIN | ✅ | ❌ | |
| Changes | **changes.submit** | vehicle.change.submit → OWNER | ✅ | ❌ | OWNER cannot discover vehicleId (design gap) |
| Changes | **changes.listPending** | vehicle.change.approve → REGADMIN | ✅ | ❌ | no change-review screen |
| Changes | **changes.review** | vehicle.change.approve → REGADMIN | ✅ | ❌ | |
| Changes | **vehicles.listMine** (NEW) | vehicle.own.read → OWNER | ✅ | ❌ | source written 0.9.0 (VC-ADR-014); FE `my-vehicles` pending |
| Changes | **changes.listMine** (NEW) | vehicle.own.read → OWNER | ✅ | ❌ | source written 0.9.0 (VC-ADR-014); FE pending |
| QR | qr.issue/revoke/replace | qr.manage → SYSADMIN/REGADMIN | ✅ | ✅ | QrGovernance |
| Retention | retention.listDue/jobStatus | retention.read → SYSADMIN/REGADMIN | ✅ | ✅ | RetentionApproval |
| Retention | retention.approve | retention.delete.approve → SYSADMIN | ✅ | ✅ | |
| Retention | **retention.execute** | retention.worker → RETENTION_WORKER | ✅ | ❌ | worker read path added (`retention.listExecutable`, VC-ADR-015); destructive flag still disabled; FE pending |
| Settings | system.config.get/update | system.settings.read/manage → SYSADMIN | ✅ | ✅ | SystemSettings |
| Audit | audit.query/export | audit.read → SYSADMIN | ✅ | ✅ | AuditReview |

**Backend is complete in source (54/54 DTO ops + health = 55 routes, `0.9.0`).** The two design holes (OWNER discovery, RETENTION_WORKER read) are now closed in source via `vehicles.listMine`, `changes.listMine`, `retention.listExecutable` (VC-ADR-014/015, CI-green, live GAS push pending). Remaining gaps are concentrated in the **frontend**.

---

## 3. Gap analysis (4 workstreams + 1 config)

### G1 — OWNER journey is broken by design (CRITICAL)
- OWNER holds only `vehicle.change.submit`. `changes.submit` requires a `vehicleId` **and** `owner_user_id === actor.userId`.
- **No operation lets OWNER discover their own vehicles.** `vehicles.lookup`/`detail` need `vehicle.lookup` (OWNER lacks). There is no "list my vehicles" op.
- **No operation lets OWNER track their submitted changes.** `changes.listPending` is approve-side (`vehicle.change.approve`).
- Menu item `my-vehicles` exists but has **no route and no page**.
- **Fix:** add OWNER-scoped read ops (`vehicles.listMine`, `changes.listMine`/`changes.status`) filtered **server-side** by `actor.userId`; add `my-vehicles` page (list → submit change → track status); REGADMIN must link `owner_user_id` via `vehicles.update`.

### G2 — REGADMIN change-approval has no UI
- `changes.listPending` / `changes.review` implemented; **no page, route, or menu entry**.
- **Fix:** `ChangeReviewPage` (pending list → delta diff → APPROVE/REJECT), menu + route gated on `vehicle.change.approve`.

### G3 — Unified vehicle detail / maintenance has no UI (STAFF read, REGADMIN edit)
- `vehicles.detail`, `vehicles.update`, `vehicles.cancel`, `contacts.update`, `photos.replace` implemented; **no FE wiring** (search result is read-only).
- **Fix:** unified vehicle detail (extends VehicleSearch result or a detail route): read contacts/photos/history (STAFF); edit fields, replace photo, update contact, cancel vehicle, link owner (REGADMIN, `vehicle.update`). Optimistic `expectedVersion` concurrency.

### G4 — RETENTION_WORKER cannot operate (CRITICAL)
- `retention.execute` needs `retention.worker`; but `retention.listDue`/`jobStatus` need `retention.read` which the worker **lacks** → cannot discover jobs. `RetentionApprovalPage` requires `retention.read` → worker is forbidden.
- `allowDestructiveRetention` defaults **false** → `RETENTION_EXECUTION_DISABLED`.
- **Fix (decision required):** grant worker a read path (either add `retention.read` to `RETENTION_WORKER`, or a worker-scoped `retention.listExecutable` op) + a worker execution UI + a **gated** enable of destructive execution + runbook (two-person rule, legal_hold, retry/`DELETION_RETRY_REQUIRED`).

### G5 — Google identity not configured
- `verifyGoogle` is real (tokeninfo, aud/iss/exp/email_verified checks) but throws `GOOGLE_OIDC_NOT_CONFIGURED` without `VEHICLE_GOOGLE_CLIENT_ID`. FE Google sign-in/link buttons not confirmed.
- **Fix:** configure client ID (Script Property, owner action), wire FE Google flows, test. Production: prefer local JWT verification over tokeninfo round-trip (latency).

---

## 4. Phased implementation plan (small slices, gated)

> Each slice follows the same contract: **BE op + DTO schema + permission + inventory/count gate + Worker allowlist + FE port/repository/feature/page + unit/contract tests + evidence doc + PR**. Assistant self-deploys the Worker after each allowlist change; GAS push gated on owner `PUSH_VEHICLE_GAS`; publication is owner action.

### Phase 0 — Verify the deployed primary journey (before new features)
- Owner supplies transient DEV credential → run approval E2E through Worker: repair dirty `9901/9902`, approve remaining 8, verify **10/10** + negatives (`INVALID_REQUEST_STATE`, `PHOTO_NOT_FOUND`). Evidence doc + PR + #61 comment.
- **Why first:** validates the `0.8.1` coercion fix end-to-end and clears the epic #61 acceptance gate before building on top.

### Phase 1 — REGADMIN operational completeness (backend ready, highest value/lowest risk)
- **Slice 1A:** Change-approval screen (G2): `changes.listPending`/`review` FE + menu/route. Tests + evidence.
- **Slice 1B:** Unified vehicle detail read (G3 read): `vehicles.detail` + contacts/photos/history presentation for STAFF/REGADMIN.
- **Slice 1C:** Vehicle maintenance (G3 edit): `vehicles.update` (incl. owner linking), `contacts.update`, `photos.replace`, `vehicles.cancel` with version-conflict UX. Each its own slice if large.

### Phase 2 — OWNER journey (G1; needs policy decision + new ops)
- **Slice 2A (decision + BE):** OWNER own-vehicle read permission design; add `vehicles.listMine` + `changes.listMine`/`changes.status` (server-side `actor.userId` filter), DTO + permission + inventory + Worker allowlist + tests.
- **Slice 2B (FE):** `my-vehicles` page: list own vehicles → submit change (`changes.submit`) → track status. Menu route wired.
- **Slice 2C:** REGADMIN owner-linking UX verified end-to-end (link → OWNER sees vehicle → submits → REGADMIN approves via Phase 1A).

### Phase 3 — RETENTION_WORKER execution (G4; destructive, careful gating)
- **Slice 3A (decision + BE):** worker read path (policy change or scoped op) + gated `allowDestructiveRetention` enable mechanism + tests (legal_hold, two-person, retry).
- **Slice 3B (FE):** worker execution console (list executable → execute → job status / retry).
- **Slice 3C:** operational runbook + synthetic deletion rehearsal on a cancelled synthetic vehicle; evidence. **Never** on real data without separate approval.

### Phase 4 — Google identity + hardening (G5)
- Configure `VEHICLE_GOOGLE_CLIENT_ID` (owner), wire FE Google sign-in/link, test; production JWT-verification recommendation.
- Cross-role authorization regression suite (every role × every op: allowed/denied matrix), Worker fail-closed probes, accessibility/mobile evidence per new screen.

---

## 5. Recommendations

1. **Sequence by risk/value:** Phase 0 → 1 → 2 → 3 → 4. Finish the primary journey first; REGADMIN screens are backend-ready (fast wins); OWNER needs a design decision; retention is destructive and last.
2. **Sheets is not an RDBMS (owner directive):** new `listMine` ops must filter a **single bounded snapshot** by `owner_user_id` — **no cross-sheet joins**, no per-row contact/photo fetch in list views. Return minimal list fields; fetch detail on demand. Flag O(rows) scans as DEV-scale; plan an indexed store before production volume. See [Sheets best practices](SHEETSTORE_COERCION_FIX_AND_SHEETS_BEST_PRACTICES_20261121.md).
3. **Security invariants:** OWNER reads filtered **server-side** by `actor.userId` (never a client-supplied ownerId). Keep two-person retention (approve by SYSADMIN, execute by WORKER); do **not** grant `retention.delete.approve` to the worker; respect `legal_hold`; keep destructive execution gated. Preserve self-demotion/expansion guards.
4. **Permission policy is immutable + gated:** any change to `ROLE_PERMISSIONS` (OWNER read, worker read) is a security decision — record in `DECISION_LOG.md`, add tests, owner approval.
5. **Respect the inventory gate:** `OperationController` asserts exactly **54** DTO ops (`entries.length===54 && DTO_OPERATIONS.length===54`); `ApiInventoryGate` expects **55** routes (54 DTO + `system.health`). Every new op must update: handler map, `DTO_SCHEMAS`, the count gate, `ApiInventoryGate`/inventory doc, Worker `FRONTEND_OPERATIONS` + `FRONTEND_PAYLOAD_FIELDS`, and contract tests. Missing any one fails closed.
6. **Worker is the mandatory path:** every new op must be added to the Worker allowlist with per-op payload validation and Origin lock; assistant redeploys via wrangler. Public ops must not carry `sessionToken`.
7. **Test fakes must emulate real GAS** (USER_ENTERED coercion, row auto-expansion, real method names) — the coercion bug survived unit tests because fakes stored raw values.
8. **Document-driven (SSOT):** each slice produces an evidence doc + PR + issue comment; record decisions in `DECISION_LOG.md`; keep `CURRENT_DELIVERY_STATUS.md` the resume point.

---

## 6. Owner decision points

| # | Decision | Recommended default |
|---|---|---|
| D1 | OWNER own-vehicle read: new permission `vehicle.own.read` vs reuse `vehicle.change.submit` for `listMine` | New scoped permission `vehicle.own.read` (least privilege, explicit) |
| D2 | RETENTION_WORKER read: add `retention.read` to role vs worker-scoped `retention.listExecutable` op | Worker-scoped op (least privilege; worker sees only executable jobs, not approve UI) |
| D3 | Phase priority | Phase 0 → 1 → 2 → 3 → 4 as above |
| D4 | Google identity now or later | Later (Phase 4); password auth sufficient for DEV |
| D5 | Enable destructive retention in DEV | Only for synthetic rehearsal, gated, with runbook; real data needs separate approval |

---

## 7. Engineering constraints checklist (every slice)
- [ ] BE use-case + domain policy invariant + audit entry
- [ ] `DTO_SCHEMAS` entry + `OperationController` permission + count gate updated
- [ ] API inventory doc + `ApiInventoryGate` reconciled
- [ ] Worker `FRONTEND_OPERATIONS` + `FRONTEND_PAYLOAD_FIELDS` + redeploy
- [ ] FE port → repository → feature → page → menu/route (permission-gated)
- [ ] Unit + contract tests (coercion-accurate fakes); cross-role authz matrix
- [ ] Evidence doc + PR + issue comment; `DECISION_LOG.md` for policy changes
- [ ] GAS push gated on `PUSH_VEHICLE_GAS`; publication owner action; health probe confirms version
- [ ] No credentials/tokens/PII in repo, logs, docs, issues