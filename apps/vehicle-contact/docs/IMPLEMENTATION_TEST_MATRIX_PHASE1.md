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
