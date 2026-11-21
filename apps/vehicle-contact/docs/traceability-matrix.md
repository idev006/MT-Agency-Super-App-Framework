# P6 Vehicle Contact — Requirements → Use Case → Sequence → API → Tests

**Document ID:** P6VC-TRACE-SEQ-001 | 2026-11-17 | **Design traceability, not live-operation certification**.

## Read me first
This matrix maps each of the **52 canonical API v1 operations to one primary owning Use Case (20 diagrams)** and a test identifier. The permission column below is from `contracts/api-permissions.v1.json` and retains its **PROPOSED_NOT_SECURITY_APPROVED** status; source implementation permission may differ (listed below). Do not treat contract `enabled:false` as a test result.

| Canonical v1 operation | Inventory ID | Owning UC / specification | Proposed contract permission | Planned or tested TC | Live authenticated GAS |
|---|---|---|---|---|---|
| `system.health` | `VC-SYSTEM-001` | [UC-ADMIN-03](use-cases/UC-ADMIN-03/specification.md) | PUBLIC | LIVE-01 | PENDING_REAL_GAS |
| `system.config.get` | `VC-SYSTEM-002` | [UC-ADMIN-03](use-cases/UC-ADMIN-03/specification.md) | `system.settings.read` | LIVE-01 | PENDING_REAL_GAS |
| `system.config.update` | `VC-SYSTEM-003` | [UC-ADMIN-03](use-cases/UC-ADMIN-03/specification.md) | `system.settings.manage` | LIVE-01 | PENDING_REAL_GAS |
| `auth.login` | `VC-AUTH-001` | [UC-AUTH-01](use-cases/UC-AUTH-01/specification.md) | PUBLIC | TC-AUTH-01 | PENDING_REAL_GAS |
| `auth.googleLogin` | `VC-AUTH-002` | [UC-AUTH-03](use-cases/UC-AUTH-03/specification.md) | PUBLIC | ACTOR-07 | PENDING_REAL_GAS |
| `auth.changePassword` | `VC-AUTH-003` | [UC-AUTH-02](use-cases/UC-AUTH-02/specification.md) | `session.authenticated` | TC-AUTH-04 | PENDING_REAL_GAS |
| `auth.logout` | `VC-AUTH-004` | [UC-AUTH-01](use-cases/UC-AUTH-01/specification.md) | `session.authenticated` | TC-AUTH-01 | PENDING_REAL_GAS |
| `auth.session` | `VC-AUTH-005` | [UC-AUTH-01](use-cases/UC-AUTH-01/specification.md) | `session.authenticated` | TC-AUTH-01 | PENDING_REAL_GAS |
| `auth.linkGoogle` | `VC-AUTH-006` | [UC-AUTH-03](use-cases/UC-AUTH-03/specification.md) | `session.authenticated` | ACTOR-07 | PENDING_REAL_GAS |
| `users.create` | `VC-USERS-001` | [UC-ADMIN-01](use-cases/UC-ADMIN-01/specification.md) | `users.manage` | ACTOR-01 | PENDING_REAL_GAS |
| `users.list` | `VC-USERS-002` | [UC-ADMIN-01](use-cases/UC-ADMIN-01/specification.md) | `users.manage` | ACTOR-01 | PENDING_REAL_GAS |
| `users.update` | `VC-USERS-003` | [UC-ADMIN-01](use-cases/UC-ADMIN-01/specification.md) | `users.manage` | ACTOR-01 | PENDING_REAL_GAS |
| `users.suspend` | `VC-USERS-004` | [UC-ADMIN-01](use-cases/UC-ADMIN-01/specification.md) | `users.manage` | ACTOR-01 | PENDING_REAL_GAS |
| `users.resetPassword` | `VC-USERS-005` | [UC-AUTH-02](use-cases/UC-AUTH-02/specification.md) | `users.manage` | TC-AUTH-04 | PENDING_REAL_GAS |
| `users.assignRoles` | `VC-USERS-006` | [UC-ADMIN-01](use-cases/UC-ADMIN-01/specification.md) | `users.manage` | ACTOR-01 | PENDING_REAL_GAS |
| `organizations.list` | `VC-ORGANIZATIONS-001` | [UC-ADMIN-02](use-cases/UC-ADMIN-02/specification.md) | `organizations.read` | ACTOR-01 | PENDING_REAL_GAS |
| `organizations.create` | `VC-ORGANIZATIONS-002` | [UC-ADMIN-02](use-cases/UC-ADMIN-02/specification.md) | `organizations.manage` | ACTOR-01 | PENDING_REAL_GAS |
| `organizations.update` | `VC-ORGANIZATIONS-003` | [UC-ADMIN-02](use-cases/UC-ADMIN-02/specification.md) | `organizations.manage` | ACTOR-01 | PENDING_REAL_GAS |
| `organizations.disable` | `VC-ORGANIZATIONS-004` | [UC-ADMIN-02](use-cases/UC-ADMIN-02/specification.md) | `organizations.manage` | ACTOR-01 | PENDING_REAL_GAS |
| `campaigns.create` | `VC-CAMPAIGNS-001` | [UC-CAMP-01](use-cases/UC-CAMP-01/specification.md) | `campaigns.manage` | ACTOR-02 | PENDING_REAL_GAS |
| `campaigns.list` | `VC-CAMPAIGNS-002` | [UC-CAMP-01](use-cases/UC-CAMP-01/specification.md) | `campaigns.manage` | ACTOR-02 | PENDING_REAL_GAS |
| `campaigns.validate` | `VC-CAMPAIGNS-003` | [UC-CAMP-02](use-cases/UC-CAMP-02/specification.md) | PUBLIC | ACTOR-02 | PENDING_REAL_GAS |
| `campaigns.revoke` | `VC-CAMPAIGNS-004` | [UC-CAMP-01](use-cases/UC-CAMP-01/specification.md) | `campaigns.manage` | ACTOR-02 | PENDING_REAL_GAS |
| `references.registration` | `VC-REFERENCES-001` | [UC-REG-01](use-cases/UC-REG-01/specification.md) | `vehicle.registration.approve` | REF-CATALOG-01 | PENDING_REAL_GAS |
| `registrations.submit` | `VC-REGISTRATIONS-001` | [UC-REG-01](use-cases/UC-REG-01/specification.md) | `campaign.token.valid` | ACTOR-03 | PENDING_REAL_GAS |
| `registrations.listPending` | `VC-REGISTRATIONS-002` | [UC-REG-02](use-cases/UC-REG-02/specification.md) | `vehicle.registration.approve` | ACTOR-03 | PENDING_REAL_GAS |
| `registrations.detail` | `VC-REGISTRATIONS-003` | [UC-REG-02](use-cases/UC-REG-02/specification.md) | `vehicle.registration.approve` | ACTOR-03 | PENDING_REAL_GAS |
| `registrations.review` | `VC-REGISTRATIONS-004` | [UC-REG-02](use-cases/UC-REG-02/specification.md) | `vehicle.registration.approve` | ACTOR-03 | PENDING_REAL_GAS |
| `registrations.photo` | `VC-REGISTRATIONS-005` | [UC-REG-02](use-cases/UC-REG-02/specification.md) | `vehicle.registration.approve` | ACTOR-03 | PENDING_REAL_GAS |
| `vehicles.lookup` | `VC-VEHICLES-001` | [UC-VEH-01](use-cases/UC-VEH-01/specification.md) | `vehicle.lookup` | ACTOR-03 | PENDING_REAL_GAS |
| `vehicles.detail` | `VC-VEHICLES-002` | [UC-VEH-01](use-cases/UC-VEH-01/specification.md) | `vehicle.lookup` | ACTOR-03 | PENDING_REAL_GAS |
| `vehicles.update` | `VC-VEHICLES-003` | [UC-VEH-02](use-cases/UC-VEH-02/specification.md) | `vehicle.update` | ACTOR-04 | PENDING_REAL_GAS |
| `vehicles.cancel` | `VC-VEHICLES-004` | [UC-RET-01](use-cases/UC-RET-01/specification.md) | `vehicle.update` | ACTOR-06 | PENDING_REAL_GAS |
| `vehicles.history` | `VC-VEHICLES-005` | [UC-VEH-01](use-cases/UC-VEH-01/specification.md) | `vehicle.history.read` | ACTOR-03 | PENDING_REAL_GAS |
| `contacts.read` | `VC-CONTACTS-001` | [UC-VEH-01](use-cases/UC-VEH-01/specification.md) | `vehicle.contact.read` | ACTOR-03 | PENDING_REAL_GAS |
| `contacts.update` | `VC-CONTACTS-002` | [UC-VEH-02](use-cases/UC-VEH-02/specification.md) | `vehicle.contact.read` | ACTOR-04 | PENDING_REAL_GAS |
| `changes.submit` | `VC-CHANGES-001` | [UC-OWNER-01](use-cases/UC-OWNER-01/specification.md) | `campaign.token.valid` | ACTOR-04 | PENDING_REAL_GAS |
| `changes.listPending` | `VC-CHANGES-002` | [UC-OWNER-01](use-cases/UC-OWNER-01/specification.md) | `vehicle.change.approve` | ACTOR-04 | PENDING_REAL_GAS |
| `changes.review` | `VC-CHANGES-003` | [UC-OWNER-01](use-cases/UC-OWNER-01/specification.md) | `vehicle.change.approve` | ACTOR-04 | PENDING_REAL_GAS |
| `qr.resolve` | `VC-QR-001` | [UC-QR-01](use-cases/UC-QR-01/specification.md) | `vehicle.lookup` | ACTOR-03 | PENDING_REAL_GAS |
| `qr.issue` | `VC-QR-002` | [UC-QR-02](use-cases/UC-QR-02/specification.md) | `qr.manage` | ACTOR-04 | PENDING_REAL_GAS |
| `qr.revoke` | `VC-QR-003` | [UC-QR-02](use-cases/UC-QR-02/specification.md) | `qr.manage` | ACTOR-04 | PENDING_REAL_GAS |
| `qr.replace` | `VC-QR-004` | [UC-QR-02](use-cases/UC-QR-02/specification.md) | `qr.manage` | ACTOR-04 | PENDING_REAL_GAS |
| `photos.upload` | `VC-PHOTOS-001` | [UC-PHOTO-01](use-cases/UC-PHOTO-01/specification.md) | `campaign.token.valid` | ACTOR-03 | PENDING_REAL_GAS |
| `photos.list` | `VC-PHOTOS-002` | [UC-VEH-01](use-cases/UC-VEH-01/specification.md) | `vehicle.photos.read` | ACTOR-03 | PENDING_REAL_GAS |
| `photos.replace` | `VC-PHOTOS-003` | [UC-PHOTO-02](use-cases/UC-PHOTO-02/specification.md) | `vehicle.update` | ACTOR-05 | PENDING_REAL_GAS |
| `retention.listDue` | `VC-RETENTION-001` | [UC-RET-01](use-cases/UC-RET-01/specification.md) | `retention.delete.approve` | ACTOR-06 | PENDING_REAL_GAS |
| `retention.approve` | `VC-RETENTION-002` | [UC-RET-02](use-cases/UC-RET-02/specification.md) | `retention.delete.approve` | ACTOR-06 | PENDING_REAL_GAS |
| `retention.execute` | `VC-RETENTION-003` | [UC-RET-02](use-cases/UC-RET-02/specification.md) | `retention.worker` | ACTOR-06 | PENDING_REAL_GAS |
| `retention.jobStatus` | `VC-RETENTION-004` | [UC-RET-02](use-cases/UC-RET-02/specification.md) | `retention.read` | ACTOR-06 | PENDING_REAL_GAS |
| `audit.query` | `VC-AUDIT-001` | [UC-AUD-01](use-cases/UC-AUD-01/specification.md) | `audit.read` | ACTOR-06 | PENDING_REAL_GAS |
| `audit.export` | `VC-AUDIT-002` | [UC-AUD-01](use-cases/UC-AUD-01/specification.md) | `audit.read` | ACTOR-06 | PENDING_REAL_GAS |

## Cross-cutting gates
- **C1 Business authority:** [Business baseline](APPROVED_REQUIREMENTS_BASELINE_R01_R26.md) (section-level, not fabricated R number), [Implementation test matrix](IMPLEMENTATION_TEST_MATRIX_PHASE1.md).
- **C2 Source review:** `backend/gas/src/api/routes/Router.js`, `backend/gas/src/api/controllers/OperationController.js`, four use-case service modules, `SessionService.js`, `SheetStore.js` and `DrivePhotos.js`.
- **C3 CI:** [GAS acceptance report](BACKEND_ACCEPTANCE_REPORT_20261117.md) shows source test evidence; compiled fake-Sheets V8 VM 19+21 cases and RBAC 220 pairs.
- **C4 GAS:** **PASS (scope-limited):** owner GAS Editor logs show `AUTH_AND_READ` 19/19 (37.651 s), `FULL_LIFECYCLE` 21/21 (123.387 s), 2026-11-17. This proves covered Editor-dispatched use cases on real Sheets/Drive, **not all 50 operations via authenticated public HTTP**. See [Backend Acceptance Report](BACKEND_ACCEPTANCE_REPORT_20261117.md).
- **C5 HTTP:** **12/12** new live HTTPS public gateway tests [run #44127658157](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44127658157) PASS. Protected dispatcher returned `SERVICE_UNAVAILABLE`; **49 non-health operations still BLOCKED / not authenticated E2E tested**, consistent with feature disabled or configuration failure. Separate synthetic-only Script Project and published authenticated /exec required.
- **C6 FE:** Vue UI and live API adapter **NOT WIRED**.

## Open contract and design discrepancies
| ID | Source | Conflict / gap | Decision needed |
|---|---|---|---|
| D-SEQ-01 | `contracts/api-permissions.v1.json` vs `OperationController.js` | `contacts.update`: proposed permission `vehicle.contact.read` while code enforces `vehicle.update` | Keep least privilege for edits and correct proposed contract after owner/security approval |
| D-SEQ-02 | Same | `changes.submit`: proposed `campaign.token.valid` and campaign actor vs code requiring authenticated OWNER `vehicle.change.submit` and ownership check | Approved baseline supports logged-in OWNER; update proposed contract only via decision |
| D-SEQ-03 | Same | `retention.listDue`: proposed `retention.delete.approve` vs code requiring `retention.read` | Review allowed visibility for REGISTRATION_ADMIN vs SYSTEM_ADMIN |
| D-SEQ-04 | Requirements vs `VehicleOperations.registrationReview` | Plate photo manual verification is provided as `platePhotoVerified` boolean; no computer vision or independently verified visual proof | Require human UAT and tamper-resistant review UI evidence |
| D-SEQ-05 | Requirements vs `VehicleOperations.registrationSubmit` | Sheets compensation handles caught exception but abrupt Apps Script timeout/restart after PREPARED journal lacks automatic reconciliation | Create and test recovery runbook / periodic reconciliation before E2E sign-off |
| D-SEQ-06 | Requirements vs `MediaRetentionOperations` | Full retention scheduling/notification not implemented; current statuses `WAITING_RETENTION` etc differ from business sketch | Record mapping and implement scheduler/notifications only after approval |
| D-SEQ-07 | Requirements vs Drive + FE | Parent folder Anyone-with-link photo exposure is intentionally accepted, but mobile image embedding/access still untested | Test Android/iOS displays, link inheritance and privacy acceptance |
| D-SEQ-08 | `AdministrationOperations.updateOrg` | Direct self-parent rejected, arbitrary ancestor cycle not detected | Decide and enforce cycle check with negative tests |
| D-SEQ-09 | `IdentityOperations.assignRoles` / `registrationReview` / `retention.execute` | Multiple Sheets writes without ACID; failure after partial writes may need reconciliation | Add failure/restart tests and durable recovery or redesign |
| D-SEQ-10 | `Router.js` + GAS Web App | Direct `/exec` ingress bypass protection and auth in published HTTP deployment not proved; protected API off | Prove staging trusted boundary before frontend integration |
| D-SEQ-11 | `IdentityOperations.login` | Unknown user bypasses full password hash verification; response timings could differ | Review constant-work negative path before live credential login |
| D-SEQ-13 | `contracts/api-inventory.v1.json` vs `OperationController.js` | `auth.login`, `auth.googleLogin`, and `photos.upload` are marked `protected:true` in the proposed inventory, while the code deliberately treats them as public-entrance operations with password/OIDC or campaign verification in the use case | Change the inventory's semantics to distinguish public transport from business authorization after security review |
| D-SEQ-12 | Draft `IMPLEMENTATION_READY_SPEC_PHASE1.md` vs approved baseline/current v1 API | Historic `vehicles.register` and separate contact-fetch assumption differ from current campaign `registrations.submit` and authorized immediate contact inclusion | Keep old draft historical; diagram references current approved baseline + actual code |

**No automatic code/business-policy changes were made by this documentation pass.** Resolutions require ADR/owner decision and modified tests as needed.
