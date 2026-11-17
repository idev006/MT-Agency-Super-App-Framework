# Vehicle Contact GAS API Contract — Phase 1 bootstrap

**Status:** BOOTSTRAP ONLY; protected APIs are NOT ENABLED. **Master:** [GAS Backend Blueprint](../../../blueprint/MASTER_GAS_BACKEND_API_BLUEPRINT.md). **Data architecture:** [Phase 1 Sheets decision](PHASE1_GOOGLE_SHEETS_DATA_ARCHITECTURE.md).

| API version | Group | Action | Transport | Access | State |
|---|---|---|---|---|---|
| v1 | system | health | doGet / doPost | non-sensitive public bootstrap status | Implemented as source; not deployed |
| v1 | vehicles | lookup/register/update | TBD after security review | restricted | DISABLED |
| v1 | contacts | read/update | TBD after security review | restricted | DISABLED |
| v1 | qr | resolve/issue/revoke | TBD after security review | restricted | DISABLED |
| v1 | audit | restricted-report | TBD after security review | restricted admin only | DISABLED |

`system.health` returns `{ok:true,requestId:null,data:{service:"p6-vehicle-contact",status:"bootstrap",apiVersion:"v1"},error:null}`. The current dispatcher rejects all unknown/protected group/action pairs. No personal data APIs may be activated until a verified non-bypassable auth/session boundary and policy tests exist.

GAS Web Apps implement `doGet/doPost` only; this is a logical `apiVersion/group/action` envelope, not native REST routing. Do not treat logical error codes as HTTP status codes. 
