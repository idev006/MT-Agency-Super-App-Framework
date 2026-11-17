# P6 Vehicle Contact — Backend Acceptance Test Report
**Evidence date:** 2026-11-17 (Asia/Bangkok)  
**Scope:** 50 declared v1 API operations; six actor categories, 24-sheet backend staging sandbox  
**Classification:** TEST EVIDENCE; **NOT FINAL BACKEND SIGN-OFF OR PRODUCTION APPROVAL**

## Acceptance map: Actors → Use Cases
| Actor | Happy-path acceptance coverage | Negative / boundary |
|---|---|---|
| Anonymous registrant | Validate campaign, upload five photos, submit pending registration, replay idempotent request | Revoked/expired campaign, missing photo, duplicate pending vehicle, quota exhausted |
| STAFF / guard | Authorized cross-org plate lookup, vehicle detail, QR resolution, contact/photo disclosure, audit | Anonymous lookup refused, forged role refused, cannot approve/change/administer |
| OWNER with account | Submit requested vehicle/contact change, pending administrator review | Cannot view privileged contacts unless granted; cannot approve own request |
| REGISTRATION_ADMIN | Review/approve registration, edit/correct, approve owner change, issue/rotate/revoke QR, replace photo, cancel vehicle | Stale optimistic version, no double-active QR, cannot approve retention deletion |
| SYSTEM_ADMIN | Organizations, settings, users, roles, sessions, campaign management; QR revoke, retention approval, audit | No implicit registration approval or vehicle lookup; self-suspend/demotion rejected |
| RETENTION_WORKER | Execute System-Admin-approved, due deletion; preserve audit journal | Cannot approve deletion, cannot administer users; legal hold prevents deletion |
| Google OIDC (pre-provisioned user) | Linked subject recognized by synthetic provider | Unknown subject and duplicate linking rejected |

## Explicit API operation inventory
| API group | Declared v1 operations | Contract/permission matrix | Real protected HTTP /exec |
|---|---:|---|---|
| system | 3 | Checked | Only health tested |
| auth | 6 | Checked | Feature disabled |
| users | 6 | Checked | Feature disabled |
| organizations | 4 | Checked | Feature disabled |
| campaigns | 4 | Checked | Feature disabled |
| registrations | 4 | Checked | Feature disabled |
| vehicles | 5 | Checked | Feature disabled |
| contacts | 2 | Checked | Feature disabled |
| changes | 3 | Checked | Feature disabled |
| qr | 4 | Checked | Feature disabled |
| photos | 3 | Checked | Feature disabled |
| retention | 4 | Checked | Feature disabled |
| audit | 2 | Checked | Feature disabled |
| **TOTAL** | **50** | **50 routes / 49 DTOs; 220 protected role pairs** | **Not yet authenticated** |

## Completed automated checks
- [GAS Build + V8 VM CI run 44117021320](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44117021320): **PASS**; generates **48 GAS .gs modules plus manifest**. Node VM executes the actual generated GAS source in two editor-acceptance entrypoints: **AUTH 19/19, LIFECYCLE 21/21** with fake SpreadsheetApp, DriveApp, LockService and synthetic PBKDF2 credentials.
- Node Router/Use Case integration: **7/7 actor flows**, **10/10 edge/failure injection**, **12/12 auth/session test scenarios**, plus the exhaustive **44 protected operations × five roles = 220** role/permission checks (all passed). These overlap with the GAS V8 tests and must not be counted as distinct successful real HTTP operations.
- [Actual publicly published /exec run 44108687513](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44108687513): **11/11 PASS**, limited to health, invalid envelopes, unknown routes and default-deny access. No authenticated business operation was attempted.
- Google Sheets connector verified isolated sandbox **24/24 tab names and exact canonical header order**; added dummy six users (five roles + first-login), two orgs, one vehicle/contact/QR, five photo metadata rows. Test-only PBKDF2 hashes verified 6/6 and matching QR token digest. The original Phase-1 Database and existing admin account remain unchanged by this campaign.
- Current registration handler catches post-write failures and attempts compensating rollback for request, media status, campaign quota and idempotency, with journal status. Failure injection checks rollback. **This is NOT an ACID transaction**; uncontrolled GAS timeout or loss of execution may still require reconciliation.

## Not-yet-run acceptance gates (must remain open)
| Gate | Required acceptance | State |
|---|---|---|
| GAS-EDITOR-AUTH | Run `runVehicleStagingAuthTestsFromEditor` on actual GAS V8 + isolated real Sheets | NOT RUN |
| GAS-EDITOR-LIFECYCLE | Run `runVehicleStagingLifecycleTestsFromEditor` on actual GAS V8 + real Sheets + dummy images in isolated Drive folder | NOT RUN |
| STAGING-LIVE-API | Dedicated `/exec` deployment pointing **only** to synthetic sandbox; authenticated Login, Session, RBAC, business positive/negative HTTP | NOT RUN |
| CONCURRENCY | Parallel campaign final-slot requests, role/QR rotation races, retry behavior on real GAS/Sheets | NOT RUN |
| RECOVERY | Uncontrolled timeout, orphan photo and partial-retention retries with verified journal-based reconciliation | INCOMPLETE |
| UAT | Mobile QR scan, readable plate photo human review, Android/iOS photo display, phone dialer and data-access feedback | NOT RUN |
| PRODUCTION | Security/provider ownership/PDPA/retention approval | NOT SOUGHT |

## Decision
**Backend acceptance: PARTIAL / NOT YET READY FOR FULL FE–BE INTEGRATION.** Contracts, synthetic actor workflows, authorization matrix and compiled GAS VM pass. Real GAS Editor staging acceptance and dedicated authenticated HTTPS staging must pass before asserting end-to-end readiness. Frontend screen and contract design may begin, but do not claim end-to-end integration delivered.
