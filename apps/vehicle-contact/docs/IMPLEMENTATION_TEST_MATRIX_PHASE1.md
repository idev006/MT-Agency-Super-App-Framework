# P6 Vehicle Contact — Implementation Test Matrix
**Document ID:** P6VC-TEST-IMPL-001 | **Status:** REQUIRED TEST PLAN, NOT EXECUTION EVIDENCE

| UC | Unit | Integration (synthetic) | API contract/negative | E2E/UAT |
|---|---|---|---|---|
| 01 | plate normalization, duplicate, validation | vehicle/contact write + audit | invalid, duplicate, no role, retry | operator registration |
| 02 | version/transition, stale contact | conflict, partial write, audit | forbidden field, stale version | authorized correction |
| 03 | random token/digest, no PII | token persist/print DTO | missing issuer, malformed input | printed QR scans |
| 04 | revoke/rotation | old token lookup rejected | replay, concurrent revoke | old sticker denied |
| 05 | token digest, expiry/status | QR→vehicle join | forged/unknown/revoked, scope | scan Android/iOS |
| 06 | plate/province normalization | bounded indexed lookup | ambiguous, pagination, enumeration | manual plate search |
| 07 | permission/resource policy | active contact and audit | forged role, cross-scope, no permission | user taps dialer |
| 08 | no-match fallback | safe UI state | no information leak | guard SOP |
| 09 | session lifecycle | trusted auth provider | expired/revoked/direct-GAS bypass/rate limit | login/logout/retry |
| 10 | redaction and retention | append audit/failure | denied audit read, secret leakage | admin evidence review |
| 11 | conflict/outage | recovery, reconciliation | Sheets unavailable, quota, timeout | field outage drill |
| 12 | disabled feature | no visitor repository | all visitor routes denied | UI feature absent |
| Migration | planner/checksum | backup, lock, journal, staged apply, verify | unauthorized editor/public API denied | staging restore drill |

## Test environments and evidence
- **Unit:** pure domain/application code in Node; deterministic fixture data, no live PII.
- **Integration:** fake Sheets/Drive and staging owned by project; explicit staging IDs and safe permissions.
- **Contract:** built GAS `.gs` load order, request envelope, DTOs, negative authorization, direct URL bypass.
- **Live HTTP smoke:** GET/POST health, malformed requests, protected fail-closed, version fingerprint; existing 7/7 evidence is bootstrap-only.
- **E2E/UAT:** browser/mobile + actual staged GAS + approved secure ingress, synthetic vehicles, human-observed call initiation.
- **Security:** brute-force/rate-limit, cross-resource access, privilege escalation, QR enumeration, audit leakage, concurrent writes, token rotation.
- **Migration fault injection:** backup failure, lock unavailable, journal failure, partial write, verification failure, rerun with checksum mismatch and restore.

## Automated CI acceptance
`npm run check` (build + unit/contract) must pass; workflow artifact count and <=800 lines per module; check route allowlist; assert protected groups disabled until verified auth gate; no hard-coded secrets; test staging schema and data preservation separately. Deployment to GAS requires manual authorized workflow and post-push verification; `clasp push` alone is not Web App publication.

## Evidence ledger template
| Test ID | UC | Commit SHA | Environment | Test command / run URL | Expected | Actual | Status | Reviewer |
|---|---|---|---|---|---|---|---|---|
| pending | pending | pending | pending | pending | pending | not run | NOT RUN | pending |

**Never convert a planned test into PASS without its actual execution result.**

## Execution campaign — 2026-11-17 (auth/session/RBAC and live HTTP)

**Test source:** `backend/gas/tests/auth-session-integration.test.mjs` (synthetic Router → Controller → Use Cases → Session Service) and `backend/gas/scripts/smoke-api.mjs` (11 safe requests against owner-supplied /exec). Neither live test sends an admin credential or submits real PII.

| ID | Target | Test oracle | Evidence type |
|---|---|---|---|
| TC-AUTH-01 | Synthetic admin login | Session token returned; only digest persisted; forced password change | Node integration |
| TC-AUTH-02 | Unknown user / bad password | Identical `INVALID_CREDENTIALS`; no sessions | Node integration |
| TC-AUTH-03 | Password retry limit | 6 failures within 15 minutes then `LOGIN_RATE_LIMIT` | Node integration |
| TC-AUTH-04 | Forced password change | Protected ops refused; change succeeds; old session revoked | Node integration |
| TC-AUTH-05 | Wrong old password | Password not changed | Node integration |
| TC-SESS-01 | Expiry / idle / revoked / invalid token | Fail closed with expected codes | Node integration |
| TC-SESS-02 | Session touch and logout | Refresh last-seen, revoke session | Node integration |
| TC-RBAC-01 | Admin role and body spoofing | No implicit vehicle permission or role promotion | Node integration |
| TC-RBAC-02 | Staff role least privilege | Admin/retention/audit/users ops denied | Node integration |
| TC-RBAC-03 | Suspended account | Old session no longer authorized | Node integration |
| TC-API-01 | Envelope/version/method/unknown operation | Fail closed | Node integration |
| TC-API-02 | Failure response secrecy | No input password in response | Node integration |
| LIVE-01..11 | Public GET/POST health, request correlation, invalid version/shape, unknown routes, forged roles | Version-compatible JSON envelope; protected routes fail as SERVICE_UNAVAILABLE when backend feature-gated | Real /exec HTTP (no credentials) |

**Acceptance / caution:** CI passes prove the synthetic code path, not GAS/physical Sheets. Live smoke verifies only public safe operations. A deployed older bootstrap Web App can return `NOT_FOUND` for routes that current source knows but feature-gates; treat such mismatches as a deployment-version discrepancy to investigate, not as a reason to turn on `VEHICLE_API_ENABLED`. Authenticated live /exec testing remains BLOCKED until ingress/credential exposure and staging-only boundaries are independently approved. Never put plaintext admin passwords, pepper or token values into GitHub Actions logs or command arguments.

## 2026-11-17 comprehensive actor/UAT campaign — synthetic evidence checkpoint

- GitHub CI [run 44114178922](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44114178922) **PASS**, source branch `test/vehicle-acceptance-actors-20261117`; **7 primary actor flows**, **10 failure/edge tests**, and **5 inventory/RBAC matrix test blocks** covering **44 protected operations × 5 roles = 220 permission checks** plus anonymous denials. Previous 12 auth/session and 11 live HTTP tests remain separate evidence, not additive to a claimed count of distinct business API successes.
- The real Google Sheets sandbox is isolated: [P6VC Backend Acceptance Test Sandbox](https://docs.google.com/spreadsheets/d/1kmUaBUC8slFICGLzxpNEUBsU87Sf-tnfe32AUs208As/edit). **24/24 tab names and column headers were verified** against `schema/database.schema.json` through native Google Sheets reads.
- Real sandbox contains only fabricated accounts, five actor roles plus first-login account, fabricated organizations, one test vehicle/contact/QR, five synthetic media references; no existing original P6 Vehicle Contact Phase 1 Database contents have been modified by these tests.
- The six sandbox password hashes were regenerated using PBKDF2-HMAC-SHA256 150,000 rounds for the fixture's synthetic password; **6/6 cell values were read back and matched**. The synthetic QR digest was verified as SHA-256 of the test token; **no real password or production pepper was read**.
- `GAS Editor` acceptance probes are installed in source but **NOT YET DEPLOYED OR EXECUTED ON GAS**. They use a hard-coded sandbox ID+title+test users guard and separately injected synthetic-only Script Properties, so running them cannot switch the existing `VEHICLE_SHEET_ID` on the deployment.
- The probes cover actual Sheets and Drive only after a manually authorized source push and subsequent manual Editor run. **Do not claim GAS acceptance PASS until corresponding execution log is inspected.**
- `src/application/use-cases/VehicleOperations.js` now compensates caught registration partial writes under a lock and journals `ROLLED_BACK` or `RECOVERY_REQUIRED`. An uncatchable process timeout may still leave a PREPARED journal. **Automated reconciliation and failure restart are NOT yet proven**; keep release blocker open.
