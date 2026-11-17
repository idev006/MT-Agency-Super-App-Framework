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
