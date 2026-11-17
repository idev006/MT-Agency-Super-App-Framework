# Vehicle Contact GAS API Contract — Phase 1 bootstrap

**Status (2026-11-17 code branch):** SOURCE HANDLERS 50/50 WIRED, BUT UNVERIFIED AND NOT DEPLOYED. Live public bootstrap remains the only historically verified endpoint; protected APIs are NOT ENABLED. Live HTTP GET/POST tests [PASS 7/7](GAS_LIVE_API_TEST_EVIDENCE.md) (2026-11-17); public /exec deployment version not independently verified. **Master:** [GAS Backend Blueprint](../../../blueprint/MASTER_GAS_BACKEND_API_BLUEPRINT.md). **Data architecture:** [Phase 1 Sheets decision](PHASE1_GOOGLE_SHEETS_DATA_ARCHITECTURE.md).

| API version | Group | Action | Transport | Access | State |
|---|---|---|---|---|---|
| v1 | system | health | doGet / doPost | non-sensitive public bootstrap status | Live HTTP verified (existing /exec); deployed version unverified |
| v1 | vehicles | lookup/register/update | TBD after security review | restricted | DISABLED |
| v1 | contacts | read/update | TBD after security review | restricted | DISABLED |
| v1 | qr | resolve/issue/revoke | TBD after security review | restricted | DISABLED |
| v1 | audit | restricted-report | TBD after security review | restricted admin only | DISABLED |

`system.health` returns `{ok:true,requestId:null,data:{service:"p6-vehicle-contact",status:"bootstrap",apiVersion:"v1"},error:null}`. The current dispatcher rejects all unknown/protected group/action pairs. No personal data APIs may be activated until a verified non-bypassable auth/session boundary and policy tests exist.

GAS Web Apps implement `doGet/doPost` only; this is a logical `apiVersion/group/action` envelope, not native REST routing. Do not treat logical error codes as HTTP status codes. 

**Test evidence:** [Live API 7/7](GAS_LIVE_API_TEST_EVIDENCE.md). Note that HTTP 200 may contain logical `ok:false`; authorization is unimplemented for protected groups, whose current denial is unconditional.

## Proposed v1 source router — implementation update (not a deployed API contract)

The historic table above describes an earlier live bootstrap, not the current branch's source inventory. Current source implements 50 logical group/action handlers as defined in [api-inventory.v1.json](../contracts/api-inventory.v1.json). The complete operation set spans system (3), auth (6), users (6), organizations (4), campaigns (4), registrations (4), vehicles (5), contacts (2), changes (3), QR (4), photos (3), retention (4), audit (2).

### Runtime path and security

`doPost → Router → GroupRoutes → OperationController → Use Case → SheetStore/DrivePhotos`.

- `system.health` remains a public, non-sensitive bootstrap route.
- Other operations require the **server-owned** `VEHICLE_API_ENABLED=true` feature flag (off by default). Protected operations additionally require an authoritative server-side session and the permission recorded per operation in the API Controller; no browser-provided principal or permissions are trusted.
- Public business exceptions are `auth.login`, `auth.googleLogin`, `campaigns.validate`, `registrations.submit`, `photos.upload`; these use credential or campaign verification in their use cases and also remain feature-gated.
- Input uses the `{apiVersion,group,action,payload,requestId,sessionToken?}` logical envelope. DTO allowlists are in `api/dto/OperationPayloadValidator.js`. Logical errors are returned in a consistent JSON envelope, **not** native HTTP status codes.
- Admin-only schema migration and first-admin bootstrap are GAS Editor entrypoints, never group/action routes.
- Uploaded image bytes are handled separately from metadata in Google Sheets. This does not change the user-approved Drive sharing risk.

**No claim of successful build, runtime execution, contract coverage, threat-model approval, release approval or live deployment is made.** The older bootstrap deployment cannot be assumed to contain the newly written code.
