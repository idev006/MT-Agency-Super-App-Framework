# P6 Vehicle Contact — API Contract SSOT

**Status:** PROPOSED / NOT FRONTEND-INTEGRATION READY. **Owner:** Vehicle Contact app. **Canonical branch:** merge through review before treating this as a released contract.

## Source files

- [api-inventory.v1.json](api-inventory.v1.json) — machine-readable proposed API groups, actions, tracking IDs and implementation/test states.
- [../docs/APPROVED_REQUIREMENTS_BASELINE_R01_R26.md](../docs/APPROVED_REQUIREMENTS_BASELINE_R01_R26.md) — approved business requirements and actor decisions.
- [../docs/GAS_API_SPEC.md](../docs/GAS_API_SPEC.md) — **currently deployed bootstrap behavior only**, not the complete target API.
- [../backend/gas/src/api/routes/Router.js](../backend/gas/src/api/routes/Router.js) — actual public GAS ingress allowlist.

## Important contract distinction

Inventory rows are **not callable endpoints**. GAS uses a POST envelope:
```json
{"apiVersion":"v1","group":"system","action":"health","payload":{},"requestId":"example-001"}
```
The GAS response envelope is `{ok,requestId,data,error}`; HTTP 200 can still carry `ok:false`.

The inventory's `requestSchemaRef` values are **reserved placeholders** and MUST NOT be treated as resolvable JSON Schema references. Before generating frontend clients, create and validate per-operation request and response JSON Schemas (including data classification and error codes), auth requirements, role/permission/resource scope, pagination, idempotency, concurrency and file-upload limits.

**Frontend gate:** consume only operations marked `liveVerified=true` and released in a versioned contract, not operations marked `PLANNED` or `PARTIAL_SOURCE`. In the current state no protected operations meet that gate.

## Proposed CI contract gates

1. Validate JSON and unique `id` / `group.action` keys.
2. Check all referenced schemas exist and resolve, with examples for success, validation error, forbidden and dependency failure.
3. Match each released operation to an explicit Router dispatch and permission enforcement; never trust a client-supplied role.
4. Run unit, integration and negative authorization tests, then attach workflow run evidence.
5. Update release status only after staging Live HTTP verification, not after code commit alone.

**Excluded:** Visitor/pass UC12 and public contact lookup. Never expose private contact or photo metadata through the public health endpoint.
