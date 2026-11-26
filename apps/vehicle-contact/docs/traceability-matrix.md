# P6 Vehicle Contact — Requirements → Use Case → Sequence → API → Tests

**Document ID:** P6VC-TRACE-SEQ-001 | 2026-11-22 | **Live-DEV API traceability, not production approval**.

## Read me first
This matrix maps **56 canonical API v1 operations to one primary owning Use Case (20 diagrams)** and a test identifier. Verified implementation baseline: **PR #110 / `main` `bf3553d`**, live GAS **V48 / backend 0.9.1**. The 50 session-protected operations have **250 cross-role RBAC checks (5 × 50)**; six public-entrance operations are not counted in that matrix.

**Executed live scope:** **97/97 PASS = 11 public + 14 Worker + 72 authenticated direct-GAS**, **56/56 operations**, cleanup **7/7**. `PASS` below means only this synthetic DEV API scope. It does not mean browser/business UAT, full browser-through-Worker E2E, production security/PDPA approval or release. Physical QR, real external OIDC provider and destructive retention execution are explicitly excluded.

The permission column is from `contracts/api-permissions.v1.json` and retains **PROPOSED_NOT_SECURITY_APPROVED**; implementation permission/discrepancies are listed below. Contract `enabled:false` is not a test result. C1–C4/C6 FE slices are delivered; C5 remains blocked on D5+B3.

| Canonical v1 operation | Inventory ID | Owning UC / specification | Proposed contract permission | Planned or tested TC | Live DEV API evidence / explicit exclusion |
|---|---|---|---|---|---|
| `system.health` | `VC-SYSTEM-001` | [UC-ADMIN-03](use-cases/UC-ADMIN-03/specification.md) | PUBLIC | LIVE-01 | PASS — public direct-GAS smoke; browser/business UAT open |
| `system.config.get` | `VC-SYSTEM-002` | [UC-ADMIN-03](use-cases/UC-ADMIN-03/specification.md) | `system.settings.read` | LIVE-01 | PASS — authenticated direct-GAS; browser/business UAT open |
| `system.config.update` | `VC-SYSTEM-003` | [UC-ADMIN-03](use-cases/UC-ADMIN-03/specification.md) | `system.settings.manage` | LIVE-01 | PASS — authenticated direct-GAS; browser/business UAT open |
| `system.reset.preview` | `VC-SYSTEM-004` | [UC-ADMIN-03](use-cases/UC-ADMIN-03/specification.md) | `system.reset` | ACTOR-SYSTEM-RESET, live SYSTEM.RESET.PREVIEW | SOURCE — VC-ADR-039 |
| `system.reset.execute` | `VC-SYSTEM-005` | [UC-ADMIN-03](use-cases/UC-ADMIN-03/specification.md) | `system.reset` | ACTOR-SYSTEM-RESET, live SYSTEM.RESET.EXECUTE (wrong phrase only) | SOURCE — VC-ADR-039 |
| `auth.login` | `VC-AUTH-001` | [UC-AUTH-01](use-cases/UC-AUTH-01/specification.md) | PUBLIC | TC-AUTH-01 | PASS — public/direct-GAS; B4 delivered; security signoff open |
| `auth.googleLogin` | `VC-AUTH-002` | [UC-AUTH-03](use-cases/UC-AUTH-03/specification.md) | PUBLIC | ACTOR-07 | PASS — invalid-token direct-GAS negative only; real external OIDC provider open |
| `auth.changePassword` | `VC-AUTH-003` | [UC-AUTH-02](use-cases/UC-AUTH-02/specification.md) | `session.authenticated` | TC-AUTH-04 | PASS — authenticated direct-GAS; browser/business UAT open |
| `auth.logout` | `VC-AUTH-004` | [UC-AUTH-01](use-cases/UC-AUTH-01/specification.md) | `session.authenticated` | TC-AUTH-01 | PASS — authenticated direct-GAS; browser/business UAT open |
| `auth.session` | `VC-AUTH-005` | [UC-AUTH-01](use-cases/UC-AUTH-01/specification.md) | `session.authenticated` | TC-AUTH-01 | PASS — authenticated direct-GAS; browser/business UAT open |
| `auth.linkGoogle` | `VC-AUTH-006` | [UC-AUTH-03](use-cases/UC-AUTH-03/specification.md) | `session.authenticated` | ACTOR-07 | PASS — invalid-token authenticated direct-GAS negative only; real external OIDC provider open |
| `users.create` | `VC-USERS-001` | [UC-ADMIN-01](use-cases/UC-ADMIN-01/specification.md) | `users.manage` | ACTOR-01 | PASS — authenticated direct-GAS; browser/business UAT open |
| `users.list` | `VC-USERS-002` | [UC-ADMIN-01](use-cases/UC-ADMIN-01/specification.md) | `users.manage` | ACTOR-01 | PASS — authenticated direct-GAS; browser/business UAT open |
| `users.update` | `VC-USERS-003` | [UC-ADMIN-01](use-cases/UC-ADMIN-01/specification.md) | `users.manage` | ACTOR-01 | PASS — authenticated direct-GAS; browser/business UAT open |
| `users.suspend` | `VC-USERS-004` | [UC-ADMIN-01](use-cases/UC-ADMIN-01/specification.md) | `users.manage` | ACTOR-01 | PASS — authenticated direct-GAS; browser/business UAT open |
| `users.reactivate` | `VC-USERS-007` | [UC-ADMIN-01](use-cases/UC-ADMIN-01/specification.md) | `users.manage` | ACTOR-ADR036 | SOURCE + unit tests; live proof pending deploy (VC-ADR-036) |
| `users.resetPassword` | `VC-USERS-005` | [UC-AUTH-02](use-cases/UC-AUTH-02/specification.md) | `users.manage` | TC-AUTH-04 | PASS — authenticated direct-GAS; browser/business UAT open |
| `users.assignRoles` | `VC-USERS-006` | [UC-ADMIN-01](use-cases/UC-ADMIN-01/specification.md) | `users.manage` | ACTOR-01 | PASS — authenticated direct-GAS; browser/business UAT open |
| `organizations.list` | `VC-ORGANIZATIONS-001` | [UC-ADMIN-02](use-cases/UC-ADMIN-02/specification.md) | `organizations.read` | ACTOR-01 | PASS — authenticated direct-GAS; browser/business UAT open |
| `organizations.create` | `VC-ORGANIZATIONS-002` | [UC-ADMIN-02](use-cases/UC-ADMIN-02/specification.md) | `organizations.manage` | ACTOR-01 | PASS — authenticated direct-GAS; browser/business UAT open |
| `organizations.update` | `VC-ORGANIZATIONS-003` | [UC-ADMIN-02](use-cases/UC-ADMIN-02/specification.md) | `organizations.manage` | ACTOR-01 | PASS — authenticated direct-GAS; browser/business UAT open |
| `organizations.disable` | `VC-ORGANIZATIONS-004` | [UC-ADMIN-02](use-cases/UC-ADMIN-02/specification.md) | `organizations.manage` | ACTOR-01 | PASS — authenticated direct-GAS; browser/business UAT open |
| `organizations.enable` | `VC-ORGANIZATIONS-005` | [UC-ADMIN-02](use-cases/UC-ADMIN-02/specification.md) | `organizations.manage` | ACTOR-ADR036 | SOURCE + unit tests; live proof pending deploy (VC-ADR-036) |
| `campaigns.create` | `VC-CAMPAIGNS-001` | [UC-CAMP-01](use-cases/UC-CAMP-01/specification.md) | `campaigns.manage` | ACTOR-02 | PASS — authenticated direct-GAS; browser/business UAT open |
| `campaigns.list` | `VC-CAMPAIGNS-002` | [UC-CAMP-01](use-cases/UC-CAMP-01/specification.md) | `campaigns.manage` | ACTOR-02 | PASS — authenticated direct-GAS; browser/business UAT open |
| `campaigns.validate` | `VC-CAMPAIGNS-003` | [UC-CAMP-02](use-cases/UC-CAMP-02/specification.md) | PUBLIC | ACTOR-02 | PASS — campaign-token direct-GAS workflow; browser/business UAT open |
| `campaigns.revoke` | `VC-CAMPAIGNS-004` | [UC-CAMP-01](use-cases/UC-CAMP-01/specification.md) | `campaigns.manage` | ACTOR-02 | PASS — authenticated direct-GAS; browser/business UAT open |
| `references.registration` | `VC-REFERENCES-001` | [UC-REG-01](use-cases/UC-REG-01/specification.md) | `vehicle.registration.approve` | REF-CATALOG-01 | PASS — authenticated direct-GAS; browser/business UAT open |
| `registrations.submit` | `VC-REGISTRATIONS-001` | [UC-REG-01](use-cases/UC-REG-01/specification.md) | `campaign.token.valid` | ACTOR-03 | PASS — campaign-token direct-GAS submit + idempotent replay; manual quota/ambiguous recovery remains |
| `registrations.listPending` | `VC-REGISTRATIONS-002` | [UC-REG-02](use-cases/UC-REG-02/specification.md) | `vehicle.registration.approve` | ACTOR-03 | PASS — authenticated direct-GAS; browser/business UAT open |
| `registrations.detail` | `VC-REGISTRATIONS-003` | [UC-REG-02](use-cases/UC-REG-02/specification.md) | `vehicle.registration.approve` | ACTOR-03 | PASS — authenticated direct-GAS; browser/business UAT open |
| `registrations.review` | `VC-REGISTRATIONS-004` | [UC-REG-02](use-cases/UC-REG-02/specification.md) | `vehicle.registration.approve` | ACTOR-03 | PASS — authenticated direct-GAS; human UAT + residual B2b journaling open |
| `registrations.photo` | `VC-REGISTRATIONS-005` | [UC-REG-02](use-cases/UC-REG-02/specification.md) | `vehicle.registration.approve` | ACTOR-03 | PASS — authenticated direct-GAS; browser/business UAT open |
| `vehicles.lookup` | `VC-VEHICLES-001` | [UC-VEH-01](use-cases/UC-VEH-01/specification.md) | `vehicle.lookup` | ACTOR-03 | PASS — authenticated direct-GAS; browser/business UAT open |
| `vehicles.list` | `VC-VEHICLES-007` | [UC-VEH-01](use-cases/UC-VEH-01/specification.md) | `vehicle.list` | REG-01..05; LIVE-FULL | PASS — authenticated direct-GAS; C6 FE wired; browser UAT open |
| `vehicles.detail` | `VC-VEHICLES-002` | [UC-VEH-01](use-cases/UC-VEH-01/specification.md) | `vehicle.lookup` | ACTOR-03 | PASS — authenticated direct-GAS; browser/business UAT open |
| `vehicles.update` | `VC-VEHICLES-003` | [UC-VEH-02](use-cases/UC-VEH-02/specification.md) | `vehicle.update` | ACTOR-04 | PASS — authenticated direct-GAS; browser/business UAT open |
| `vehicles.cancel` | `VC-VEHICLES-004` | [UC-RET-01](use-cases/UC-RET-01/specification.md) | `vehicle.update` | ACTOR-06 | PASS — authenticated direct-GAS; browser/business UAT open |
| `vehicles.history` | `VC-VEHICLES-005` | [UC-VEH-01](use-cases/UC-VEH-01/specification.md) | `vehicle.history.read` | ACTOR-03 | PASS — authenticated direct-GAS; browser/business UAT open |
| `vehicles.listMine` | `VC-VEHICLES-006` | [UC-OWNER-01](use-cases/UC-OWNER-01/specification.md) | `vehicle.own.read` | ACTOR-04 | PASS — authenticated direct-GAS; browser/business UAT open |
| `contacts.read` | `VC-CONTACTS-001` | [UC-VEH-01](use-cases/UC-VEH-01/specification.md) | `vehicle.contact.read` | ACTOR-03 | PASS — authenticated direct-GAS; browser/business UAT open |
| `contacts.update` | `VC-CONTACTS-002` | [UC-VEH-02](use-cases/UC-VEH-02/specification.md) | `vehicle.contact.read` | ACTOR-04 | PASS — authenticated direct-GAS; browser/business UAT open |
| `changes.submit` | `VC-CHANGES-001` | [UC-OWNER-01](use-cases/UC-OWNER-01/specification.md) | `campaign.token.valid` | ACTOR-04 | PASS — authenticated direct-GAS; browser/business UAT open |
| `changes.listPending` | `VC-CHANGES-002` | [UC-OWNER-01](use-cases/UC-OWNER-01/specification.md) | `vehicle.change.approve` | ACTOR-04 | PASS — authenticated direct-GAS; browser/business UAT open |
| `changes.review` | `VC-CHANGES-003` | [UC-OWNER-01](use-cases/UC-OWNER-01/specification.md) | `vehicle.change.approve` | ACTOR-04 | PASS — authenticated direct-GAS; browser/business UAT open |
| `changes.listMine` | `VC-CHANGES-004` | [UC-OWNER-01](use-cases/UC-OWNER-01/specification.md) | `vehicle.own.read` | ACTOR-04 | PASS — authenticated direct-GAS; browser/business UAT open |
| `qr.resolve` | `VC-QR-001` | [UC-QR-01](use-cases/UC-QR-01/specification.md) | `vehicle.lookup` | ACTOR-03 | PASS — authenticated direct-GAS token API; physical QR/device acceptance open |
| `qr.issue` | `VC-QR-002` | [UC-QR-02](use-cases/UC-QR-02/specification.md) | `qr.manage` | ACTOR-04 | PASS — authenticated direct-GAS token API; physical QR/device acceptance open |
| `qr.revoke` | `VC-QR-003` | [UC-QR-02](use-cases/UC-QR-02/specification.md) | `qr.manage` | ACTOR-04 | PASS — authenticated direct-GAS token API; physical QR/device acceptance open |
| `qr.replace` | `VC-QR-004` | [UC-QR-02](use-cases/UC-QR-02/specification.md) | `qr.manage` | ACTOR-04 | PASS — authenticated direct-GAS token API; physical QR/device acceptance open |
| `qr.history` | `VC-QR-005` | [UC-QR-02](use-cases/UC-QR-02/specification.md) | `qr.manage` | ACTOR-S3-QR | SOURCE + unit tests; live proof pending deploy (VC-ADR-036 S3) |
| `qr.export` | `VC-QR-006` | [UC-QR-02](use-cases/UC-QR-02/specification.md) | `qr.manage` | ACTOR-S5-QR-EXPORT | SOURCE + unit tests; live proof pending deploy (S5, VC-ADR-032 B) |
| `photos.upload` | `VC-PHOTOS-001` | [UC-PHOTO-01](use-cases/UC-PHOTO-01/specification.md) | `campaign.token.valid` | ACTOR-03 | PASS — campaign-token direct-GAS five-photo workflow; browser/business UAT open |
| `photos.list` | `VC-PHOTOS-002` | [UC-VEH-01](use-cases/UC-VEH-01/specification.md) | `vehicle.photos.read` | ACTOR-03 | PASS — authenticated direct-GAS; browser/business UAT open |
| `vehicles.photo` | `VC-VEHICLES-008` | [UC-VEH-01](use-cases/UC-VEH-01/specification.md) | `vehicle.photos.read` | ACTOR-03 | OFFLINE PASS (VIEW-03, RBAC matrix, Worker allowlist test) — live G6 pending V66 deploy |
| `photos.replace` | `VC-PHOTOS-003` | [UC-PHOTO-02](use-cases/UC-PHOTO-02/specification.md) | `vehicle.update` | ACTOR-05 | PASS — authenticated direct-GAS; browser/business UAT open |
| `retention.listDue` | `VC-RETENTION-001` | [UC-RET-01](use-cases/UC-RET-01/specification.md) | `retention.delete.approve` | ACTOR-06 | PASS — authenticated direct-GAS; destructive retention execution open |
| `retention.approve` | `VC-RETENTION-002` | [UC-RET-02](use-cases/UC-RET-02/specification.md) | `retention.delete.approve` | ACTOR-06 | PASS — authenticated direct-GAS non-approvable-job negative; successful approval/destructive execution open |
| `retention.execute` | `VC-RETENTION-003` | [UC-RET-02](use-cases/UC-RET-02/specification.md) | `retention.worker` | ACTOR-06 | PASS — inventory/fail-closed scope; destructive execution DISABLED/gated |
| `retention.jobStatus` | `VC-RETENTION-004` | [UC-RET-02](use-cases/UC-RET-02/specification.md) | `retention.read` | ACTOR-06 | PASS — authenticated direct-GAS; destructive retention execution open |
| `retention.listExecutable` | `VC-RETENTION-005` | [UC-RET-02](use-cases/UC-RET-02/specification.md) | `retention.worker` | ACTOR-06 | PASS — authenticated direct-GAS; destructive retention execution open |
| `audit.query` | `VC-AUDIT-001` | [UC-AUD-01](use-cases/UC-AUD-01/specification.md) | `audit.read` | ACTOR-06 | PASS — authenticated direct-GAS; browser/business UAT open |
| `audit.export` | `VC-AUDIT-002` | [UC-AUD-01](use-cases/UC-AUD-01/specification.md) | `audit.read` | ACTOR-06 | PASS — authenticated direct-GAS; browser/business UAT open |

## Delivery and evidence gates
- **Business/source traceability:** [Approved baseline](APPROVED_REQUIREMENTS_BASELINE_R01_R26.md), [implementation test matrix](IMPLEMENTATION_TEST_MATRIX_PHASE1.md), Router/Controller, use-case services, SessionService, SheetStore and DrivePhotos remain the authorities; historical reports do not override `bf3553d`.
- **RBAC and offline evidence:** 50 session-protected operations × five roles = **250 checks**; compiled GAS and source suites support, but do not replace, live evidence.
- **Live DEV API:** GAS **V48 / 0.9.1**, **97/97 PASS** (11 public + 14 Worker + 72 authenticated direct-GAS), **56/56 operations**, cleanup **7/7**. See [live API automation/evidence](LIVE_API_AUTOMATION.md). The 14 Worker probes are fail-closed edge evidence, not 56-operation browser E2E.
- **Frontend:** C1 change review, C2 vehicle detail, C3 maintenance, C4 owner vehicles/requests and C6 admin registry are delivered/wired. Browser/business UAT is still open. **C5 RETENTION_WORKER console is blocked on D5+B3.**
- **Hardening:** B1 organization ancestor-cycle guard, B2 submit retry reconciliation/job-tracked retention retry evidence and B4 login constant-work negative path are delivered. Residual B2b approval/role-assignment journaling remains open.

## Open acceptance and release gates
Physical QR/camera and mobile-device acceptance; real external OIDC-provider verification; destructive retention execution; browser and business UAT (including human plate-photo review and Drive privacy); PDPA/security approval; and production release/rollback approval remain open. No row in this matrix certifies those gates.

## Open contract and design discrepancies
| ID | Source | Conflict / gap | Decision or residual state |
|---|---|---|---|
| D-SEQ-01 | `contracts/api-permissions.v1.json` vs `OperationController.js` | `contacts.update`: proposed `vehicle.contact.read` while code enforces `vehicle.update` | Keep least privilege for edits; correct proposed contract only after owner/security approval |
| D-SEQ-02 | Same | `changes.submit`: proposed campaign actor/permission vs authenticated OWNER `vehicle.change.submit` + ownership check | Approved baseline supports logged-in OWNER; contract change requires decision |
| D-SEQ-03 | Same | `retention.listDue`: proposed `retention.delete.approve` vs code `retention.read` | Review visibility for REGISTRATION_ADMIN vs SYSTEM_ADMIN |
| D-SEQ-04 | Requirements vs `registrationReview` | `platePhotoVerified` is an admin assertion, not computer vision or independent visual proof | Human business UAT and tamper-resistant review evidence remain required |
| D-SEQ-05 | `registrationSubmit` recovery | B2 now reconciles state-driven orphan request/photo writes automatically on retry; Sheets is still not ACID | Ambiguous campaign quota and reconciliation failures remain `RECOVERY_REQUIRED` manual [runbook](OPERATION_JOURNAL_RECOVERY_RUNBOOK_20261121.md) cases; no blanket recovery signoff |
| D-SEQ-06 | Requirements vs `MediaRetentionOperations` | Full retention scheduling/notification is absent; statuses differ from the business sketch | Record mapping; implement scheduler/notifications only after approval |
| D-SEQ-07 | Drive + FE | Anyone-with-link parent-folder exposure and mobile embedding/privacy behavior are not browser/device accepted | Run Android/iOS, link-inheritance, privacy and business UAT |
| D-SEQ-08 | `AdministrationOperations.updateOrg` | **Resolved by B1:** direct and arbitrary ancestor cycles are rejected with negative tests | No implementation gap remains here; production security/business approval is still separate |
| D-SEQ-09 | `assignRoles` / `registrationReview` / `retention.execute` | Multi-write Sheets operations are not ACID. B2 added injected-failure evidence and job-tracked deletion retry state | **Residual B2b:** durable journaling/automatic recovery for registration approval and role assignment remains open; destructive execution is still disabled/gated |
| D-SEQ-10 | Router + Worker + GAS Web App | DEV direct-GAS authenticated scope and 14 Worker fail-closed probes now pass | Production trusted-boundary/security approval remains open; do not infer full browser-through-Worker E2E |
| D-SEQ-11 | `IdentityOperations.login` | **Resolved by B4:** unknown/inactive users perform equal-cost dummy PBKDF2 verification | No production security signoff or formal timing-analysis claim |
| D-SEQ-13 | Inventory vs `OperationController.js` | `auth.login`, `auth.googleLogin`, `photos.upload` are `protected:true` in proposed inventory but are public-entrance operations with business verification | Distinguish public transport from business authorization after security review |
| D-SEQ-12 | Draft `IMPLEMENTATION_READY_SPEC_PHASE1.md` vs current baseline | Historic `vehicles.register` and separate contact-fetch assumptions differ from current campaign submit and authorized immediate contact inclusion | Keep the old draft historical; diagrams follow the approved baseline/current code |

**Documentation-only handoff update:** no code or business-policy change is implied. Contract resolutions require ADR/owner/security decision and modified tests as needed.
