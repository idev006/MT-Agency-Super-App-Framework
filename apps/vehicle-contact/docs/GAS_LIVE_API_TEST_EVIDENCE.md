# P6 Vehicle Contact — Live HTTP API Test Evidence

**Document ID:** P6VC-API-TEST-001  
**Date:** 2026-11-17 (Asia/Bangkok)  
**Status:** PASS — 7/7 **BOOTSTRAP** HTTP API test cases; protected business endpoints intentionally disabled  
**Endpoint:** [Existing GAS /exec](https://script.google.com/macros/s/AKfycby15c-Aux2za0BuedeIYni8-tc6rkf9ZVNmw-6ZMTgPvG9SvFjuQVSzNoMouiMhqTmxrA/exec)  
**GitHub Actions:** [Test run 44036525176](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44036525176), job `133880617061`, result **success**.  
**Source script:** [scripts/smoke-api.mjs](../backend/gas/scripts/smoke-api.mjs)  
**Workflow:** `safe-public-smoke` mode in [.github/workflows/p6vc-live-acceptance.yml](../../../.github/workflows/p6vc-live-acceptance.yml) — manual-only; no automatic live calls on commits.

## Test method
- External GitHub Actions-hosted Node.js 22 runner sent actual GET and POST HTTPS requests to the supplied /exec URL, followed ContentService redirects, parsed JSON and checked logical status envelope and error codes.
- Request payloads were synthetic and non-sensitive; no actual vehicle, person, plate, phone, QR token or credential was sent.
- These tests validate **logical API error codes** inside JSON, not real HTTP 4xx statuses: GAS ContentService returned HTTP 200 even for logical API denial.

| ID | Method & logical request | Observed HTTP | Observed response | Result |
|---|---|---:|---|---|
| API-LIVE-01 | GET /exec (system.health) | 200 | `ok:true`, `data.status:"bootstrap"` | PASS |
| API-LIVE-02 | POST v1/system/health | 200 | `ok:true`, `data.status:"bootstrap"` | PASS |
| API-LIVE-03 | POST invalid API version (v9) | 200 | `ok:false`, `error.code:"BAD_REQUEST"` | PASS |
| API-LIVE-04 | POST unknown group | 200 | `ok:false`, `error.code:"NOT_FOUND"` | PASS |
| API-LIVE-05 | POST vehicles.lookup with forged `role:admin` | 200 | `ok:false`, `error.code:"NOT_FOUND"` | PASS |
| API-LIVE-06 | POST contacts.read with forged `role:admin` | 200 | `ok:false`, `error.code:"NOT_FOUND"` | PASS |
| API-LIVE-07 | POST qr.resolve | 200 | `ok:false`, `error.code:"NOT_FOUND"` | PASS |

**Source evidence:** GitHub Actions stdout records `RESULT: 7/7 passed; no PII payload used`.

## Interpretation — precisely limited
1. GET and POST requests reached a published GAS Web App URL, with recognized JSON envelope.
2. Current bootstrap router accepts only `system.health`; unavailable/unknown operations fail closed. Tests do **not** establish working authorization for future enabled protected APIs (deny is unconditional while disabled).
3. This does **not** prove the published /exec URL references GAS Version 5; previous versions exposed identical health contract. Confirm deployment version in GAS → Deploy → Manage deployments.
4. This does **not** test direct Script Editor schema verification, Google Sheets reads or writes, data integrity, photo upload/Drive permissions, session/RBAC, rate limits, production identity, PDPA, or field workflows.
5. The public health endpoint is designed to expose only non-sensitive service state. Do not enable protected endpoints until independently verified direct-access security/authorization gates.

## Next API Test Gates
- **API-INT-01:** In trusted Apps Script Editor, set Script Property `VEHICLE_SHEET_ID`, run `verifyVehicleSchemaFromEditor()`, `inspectVehicleSchemaDriftFromEditor()`, record sanitized results.
- **API-SEC-01:** Prove denial when direct /exec access bypasses any gateway **after** protected API groups are implemented in a staging environment.
- **API-DATA-01:** Use synthetic records in a private staging Sheet to test vehicle register/search/contact/QR actions **only after** secure session/RBAC and the persistence adapters exist.
- **API-MEDIA-01:** Test authenticated 5-slot Drive photo upload/replacement and access checks in staging, with no real personal images.

**Do not count bootstrap 7/7 success as full Phase-1 API UAT or production release approval.**

---

## Additional live verification — API Router v1 (2026-11-17, 21:56–21:57 Bangkok)

**Source under test:** current owner-supplied existing `/exec` URL; **published deployment version was not independently read**. The logical error response `SERVICE_UNAVAILABLE` for declared protected routes is consistent with the current feature-gated router and differs from the earlier bootstrap-only `NOT_FOUND` behavior. This is a behavioral fingerprint only, **not** a verified GAS version number.

**GitHub Actions HTTP evidence:** [run 44108687513](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44108687513), job `134128003028`, **success**.
**Test source:** `backend/gas/scripts/smoke-api.mjs` — 11 synthetic non-sensitive cases. No actual password, API secret, user identifier, registration data, phone, photo or QR token sent.

| Test ID | Operation | Expected/observed envelope | Result |
|---|---|---|---|
| LIVE-01 | GET health | HTTP 200; `ok=true`, status bootstrap | PASS |
| LIVE-02 | POST health | HTTP 200; `ok=true`, status bootstrap | PASS |
| LIVE-03 | POST invalid API version | HTTP 200; `BAD_REQUEST` | PASS |
| LIVE-04 | POST invalid payload array | HTTP 200; `BAD_REQUEST` | PASS |
| LIVE-05 | POST unknown route | HTTP 200; `NOT_FOUND` | PASS |
| LIVE-06 | POST prototype-like group | HTTP 200; `BAD_REQUEST` | PASS |
| LIVE-07 | POST protected vehicle lookup with forged role | HTTP 200; `SERVICE_UNAVAILABLE` | PASS |
| LIVE-08 | POST protected contact read with forged role | HTTP 200; `SERVICE_UNAVAILABLE` | PASS |
| LIVE-09 | POST protected QR resolve | HTTP 200; `SERVICE_UNAVAILABLE` | PASS |
| LIVE-10 | POST login without credentials, feature off | HTTP 200; `SERVICE_UNAVAILABLE` | PASS |
| LIVE-11 | POST health with synthetic requestId | HTTP 200; matching requestId | PASS |

**Result:** `11/11 passed; 0 credential/PII/business-data payloads submitted`.
The workflow is again **manual-only** after this explicitly scoped branch experiment.

### AuthN/Session/RBAC unit+synthetic integration evidence
- [CI run 44108687303](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44108687303) — completed successfully with 12 new `TC-*` integration tests.
- Covers valid and invalid credential flow using a **test double** for hashing; session digest storage, six failed attempts/rate limit, forced password change, session expiry/idle/revocation/logout, role separation, suspended user, input errors and no sensitive values in failure response.
- Does **not** prove success of real password login on the GAS/Sheets deployment, server-side RBAC during live authorized requests, encrypted transit beyond HTTPS or any production privacy/governance release gate.
- `VEHICLE_API_ENABLED` should remain disabled until the direct GAS ingress security review and a separately authorized staged functional test plan.
