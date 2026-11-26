# P6 Vehicle Contact — API Test Suites (Approved 2026-11-17)

> **Historical 2026-11-17 snapshot:** the narrow gates and `NOT IMPLEMENTED` rows below describe the initial scaffold, not current delivery. Use [LIVE_API_AUTOMATION.md](LIVE_API_AUTOMATION.md) for the current executable suite and [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md) for remaining gates.

**Status at this snapshot:** PARTIALLY IMPLEMENTED / LIVE BACKEND INTEGRATION GATED
**Authority:** Owner approved executing the five proposed test areas: Schema, Authentication/Authorization, Vehicle Registration, Media Upload, and QR.  
**Source:** [Automated gate suites](../backend/gas/tests/phase1-api-gates.test.mjs), [original contract suite](../backend/gas/tests/contract.test.mjs), [live HTTP bootstrap tester](../backend/gas/scripts/smoke-api.mjs).  
**Current CI evidence:** [GitHub Actions run 44037490677](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44037490677), commit `63fe4ada`. **10 Node.js subtests PASS (0 failures)**; original contract tests PASS. Build emits 17 source-mirrored GAS files + manifest, without deployment.  
**Prior live bootstrap evidence:** [7/7 live GET/POST](GAS_LIVE_API_TEST_EVIDENCE.md) (run 44036525176). These are different layers of evidence: do not sum or treat them as production E2E results.

## Scope and evidence matrix

| Sequence | Suite | Implemented test coverage now | Verified result | Missing acceptance gate |
|---|---|---|---|---|
| 1 | Schema integration | Fake Apps Script Sheets service with all 6 canonical headers, ensures only header row is read; unauthorized extra column yields a mismatch | PASS locally in CI (2 subtests) | Real GAS Editor execution with `VEHICLE_SHEET_ID`; validate actual Sheets and drift |
| 2 | Authentication/Authorization | Test forged admin identity, fabricated scope, malformed payload, unsupported version and protected router fail-closed | PASS in CI (2 subtests) | Real approved Username/Password provider, session management, RBAC and **non-bypassable** GAS endpoint security tests; all currently BLOCKED |
| 3 | Vehicle Registration | Assert schema has IDs/plate/province/versions and separate photo metadata; `vehicles.register` remains disabled | PASS in CI (2 subtests: baseline guard + pure synthetic validation) | Real authenticated CRUD, duplicate-plate/concurrency, rollback, Sheet adapter integration; NOT IMPLEMENTED |
| 4 | Media API | Verify photo metadata stores reference not binary/public URL; upload action disabled | PASS baseline guard in CI (1 subtest) | Approved Drive photo permissions, file signature/EXIF stripping, five-slot upload/replacement, thumbnails/retention, negative auth E2E; NOT IMPLEMENTED |
| 5 | QR API | Verify digest field and revoke metadata; issue/resolve/revoke remain denied while disabled | PASS baseline guard in CI (1 subtest) | CSPRNG ≥128-bit opaque token issuance, digest lookup, revocation, print/deep link, protected resolve E2E; NOT IMPLEMENTED |

**PASS only means the existing, narrow assertion passed.** Registration, Media and QR now have *synthetic pure-function* behavior checks (draft field requirements, five valid unique slots, and injected 256-bit QR token+SHA-256 digest), but no actual backend CRUD, Drive upload, token persistence or authenticated service is implemented. The source-layer policies are not exposed via the public GAS API.

## Pure-function test modules (removed 2026-11-26, VC-ADR-044)
The Phase-1 prototypes `VehicleRegistration.js`, `PhotoSlots.js`, `QrTokenPolicy.js`, `SessionPolicy.js` and `SecurityEventPolicy.js` were never used by the running system and were deleted with their tests (they duplicated rules that live in one place each): photo slots → `domain/policies/VehicleLifecycle.js`; sessions → `application/security/SessionService.js`; QR issue → `application/use-cases/VehicleOperations.js`; security events → `application/use-cases/IdentityOperations.js`.
From `apps/vehicle-contact/backend/gas/`:

```bash
npm install
npm run check
```

`npm run check` builds the 14 source-mirrored GAS `.gs` files and runs existing contract coverage plus the seven new Node.js test cases. GitHub Actions validates this with every relevant source change.

For external live bootstrap GET/POST safety probes, run the `safe-public-smoke` mode in the [consolidated manual live acceptance workflow](../../../.github/workflows/p6vc-live-acceptance.yml). Never send real plates, contacts or photos in public smoke payloads.

## Next executable, gated tasks
1. **Schema runtime:** Authorized user sets `VEHICLE_SHEET_ID` and invokes `verifyVehicleSchemaFromEditor()` and `inspectVehicleSchemaDriftFromEditor()` inside target GAS Script Editor. Save only redacted output in GitHub. These editor functions are not public API routes.
2. **Security architecture:** Resolve [VC-W04](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/4), [VC-W05](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/5), [VC-W06](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/6) before creating protected CRUD/QR endpoints or serving private Drive images.
3. **Vehicle data:** Implement a tested Sheets repository, controlled sample registration and duplicate/conflict cases in a *staging* spreadsheet; never mix with real personnel records.
4. **Media:** Inspect effective `uploads/` Drive ACLs and obtain photo/privacy/retention approvals before any real images, then implement an interface-driven Drive adapter and five labeled slot upload pipeline.
5. **QR:** Develop mock/deterministic tests for token generation and digest logic and follow with negative integration tests after secured backend wiring.

## Release note
Nothing in this test suite authorizes production personal-data processing or a public owner-privileged GAS Web App. GitHub remains the sole documentation/source SSOT; Sheets and Drive are operational storage. No deployment to GAS was required or performed for these **Node.js test-only changes**.
