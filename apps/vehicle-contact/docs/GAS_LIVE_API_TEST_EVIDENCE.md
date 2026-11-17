# P6 Vehicle Contact — Live HTTP API Test Evidence

**Document ID:** P6VC-API-TEST-001  
**Date:** 2026-11-17 (Asia/Bangkok)  
**Status:** PASS — 7/7 **BOOTSTRAP** HTTP API test cases; protected business endpoints intentionally disabled  
**Endpoint:** [Existing GAS /exec](https://script.google.com/macros/s/AKfycby15c-Aux2za0BuedeIYni8-tc6rkf9ZVNmw-6ZMTgPvG9SvFjuQVSzNoMouiMhqTmxrA/exec)  
**GitHub Actions:** [Test run 44036525176](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44036525176), job `133880617061`, result **success**.  
**Source script:** [scripts/smoke-api.mjs](../backend/gas/scripts/smoke-api.mjs)  
**Workflow:** [.github/workflows/test-vehicle-gas-api.yml](../../../.github/workflows/test-vehicle-gas-api.yml) — after first-run verification, restored to **manual-only**, no new automatic live calls on commits.

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
