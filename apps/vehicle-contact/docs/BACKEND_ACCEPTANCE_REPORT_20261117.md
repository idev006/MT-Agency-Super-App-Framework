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
| GAS-EDITOR-AUTH | `runVehicleStagingAuthTestsFromEditor` with real GAS V8 + isolated 24-tab Sheets | **PASS 19/19**, 37,651 ms; owner execution log 2026-11-17 23:18–23:19 Bangkok |
| GAS-EDITOR-LIFECYCLE | `runVehicleStagingLifecycleTestsFromEditor` with real GAS + Sheets + Drive | **PASS 21/21**, 123,387 ms; owner execution log 2026-11-17 23:20–23:22 Bangkok |
| STAGING-LIVE-API | Dedicated `/exec` deployment pointing **only** to synthetic sandbox; authenticated Login, Session, RBAC, business positive/negative HTTP | NOT RUN |
| CONCURRENCY | Parallel campaign final-slot requests, role/QR rotation races, retry behavior on real GAS/Sheets | NOT RUN |
| RECOVERY | Uncontrolled timeout, orphan photo and partial-retention retries with verified journal-based reconciliation | INCOMPLETE |
| UAT | Mobile QR scan, readable plate photo human review, Android/iOS photo display, phone dialer and data-access feedback | NOT RUN |
| PRODUCTION | Security/provider ownership/PDPA/retention approval | NOT SOUGHT |

## Decision
**Backend acceptance: GAS EDITOR STAGING PASS / AUTHENTICATED WEB APP HTTP NOT TESTED.** All 40 real Apps Script Editor acceptance assertions passed on the sandbox. CI source/actor/RBAC tests also passed. A dedicated staging deployment of the authenticated `/exec` transport, direct ingress/security boundary, realistic photo size, concurrency, timeout recovery and mobile UAT remain required before claiming full FE–BE integration readiness. Frontend contract-first design can proceed.

## Verified actual GAS Editor acceptance — owner execution 2026-11-17 (Bangkok)

Evidence source is the **owner-provided unredacted GAS execution log**, not CI or a model-generated runtime simulation. Both functions were executed against the isolated synthetic workbook on real Google Apps Script. Actual pushed GAS version number is not contained in this log and therefore remains **unverified**.

| Phase | Start / completion | Test cases | Result | Measured elapsed |
|---|---|---:|---|---:|
| AUTH_AND_READ | 23:18:51–23:19:31 | 19 | **19 PASS, 0 FAIL** | **37,651 ms** |
| FULL_LIFECYCLE | 23:20:11–23:22:17 | 21 | **21 PASS, 0 FAIL** | **123,387 ms** |

Details actually proven through the instrumented Editor endpoints:
- Six synthetic account logins, server session and role checks; first-login requirement; wrong credentials; logout revocation; authorized plate, contact and QR lookup. This is GAS **Editor-routed API dispatch**, not actual HTTP request authorization at `/exec`.
- Live-GAS lifecycle: five dummy Drive image uploads, one public registration and admin approval, staff lookup, owner assignment/change approval, QR rotation/revocation, photo replacement, vehicle cancellation, due-job calculation, System Admin deletion authorization, Retention Worker execution and final audit preservation.
- Independent follow-up connector read on the **same 24-sheet sandbox** confirmed `vc_retention_jobs` latest test job `DELETION_COMPLETED` with `attempts=1`; the newly generated vehicle was deleted while original `vehicle-sandbox-001` remained; five original fixture image records remained. No personal data was used.

### Execution latency analysis (real GAS Editor, not HTTP SLA)

| Observed case or group | Duration | Interpretation |
|---|---:|---|
| GAS-FLOW.LOGIN_ACTORS | 19,561 ms | Five logins grouped in one test: **3,912 ms/login on average**, not one 19.6 s login |
| GAS-FLOW.MEDIA_[five slots] | 15,813 ms total | Five small synthetic PNG uploads; **not real camera-size images** |
| GAS-FLOW.REGISTRATION_SUBMIT | 7,909 ms | One registration submission across Sheets tables |
| GAS-FLOW.APPROVE | 8,486 ms | One registration approval |
| GAS-FLOW.STAFF_LOOKUP | 4,163 ms | One authorized vehicle lookup in populated lifecycle test |
| GAS-FLOW.ROTATE_QR | 12,164 ms | **Three sequential operations**: rotate, old QR resolve, new QR resolve |
| GAS-FLOW.REPLACE_PHOTO | 5,708 ms | One photo replacement using tiny dummy PNG |
| GAS-FLOW.CANCEL | 7,774 ms | Cancel followed by QR resolution check |
| GAS-FLOW.WORKER_DELETE | 16,989 ms | One worker deletion with Drive trash and dependent Sheets row deletions |

**Do not divide the total 123 s by 21 and call that HTTP response latency.** The test is an entire orchestrated scenario; its calls and Sheets effects are sequential. Editor invocation excludes browser/network round-trip and real mobile photo sizes. The current `createApplication()` constructs protected controller/store per API dispatch; repeated operations within one test open/read Sheets again. Most operations also update `vc_sessions.last_seen_at` and append audit events, adding round trips. Profile per HTTP operation in dedicated staging before optimizing role/session semantics.

**Next performance evidence gate:** establish a *per-operation* baseline over repeated isolated staging HTTP invocations (median/p95, payload sizes, 429/5xx/feature errors, count of Sheets/Drive calls where observable). Prioritize login, lookup, approval, QR rotate, image upload/replacement and worker deletion. Propose but do not yet approve customer-facing SLO thresholds; verify correctness/authorization after every optimization. Avoid changing PBKDF2 iterations or audit/lock correctness only to reduce time.
