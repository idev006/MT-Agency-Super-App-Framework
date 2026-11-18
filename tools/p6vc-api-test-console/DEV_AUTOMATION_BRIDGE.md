# P6VC Dev Automated Test Bridge — Architecture and Deployment Gates

Status: IMPLEMENTED POC data-driven suite runner on branch; **NOT deployed to Cloudflare**. The direct ChatGPT tool bridge is a distinct, **NOT connected** stage.

## Problem and direction

User wants to run many P6 Vehicle Contact API Test Cases without repeatedly opening GitHub Actions or manually deploying for each new input, and eventually reuse the same bridge for a production frontend.

One shared Cloudflare Worker contains:
- Existing Browser API Test Console
- `POST /api/health`, `POST /api/auth-suite`, and `POST /api/probe`
- **New** `POST /api/run-tests`: bounded, data-driven test suites
- Future `POST /mcp`: ChatGPT custom MCP adapter which invokes the same suite runner, not a parallel implementation

All HTTP calls to GAS target the already approved `P6VC_GAS_EXEC_URL` setting; no arbitrary target URLs accepted.

## API test-suite format (current POC, on-demand)

```json
{
  "suiteId": "smoke-dev",
  "cases": [
    {
      "id": "T-01",
      "operation": "system.health",
      "method": "POST",
      "payload": {},
      "expected": {"ok": true}
    },
    {
      "id": "T-02",
      "operation": "users.list",
      "method": "POST",
      "payload": {"limit": 1},
      "expected": {"ok": false, "errorCode": "UNAUTHENTICATED"}
    }
  ]
}
```

Only send to `/api/run-tests` (POST) with same `Authorization: Bearer <BRIDGE_ACCESS_KEY>` already used by the Console. Expected error code for the example second case is illustrative and may depend on GAS auth flags, deployment and policy.

- Max 10 cases per request initially. Sequential execution avoids excess concurrent calls.
- All cases **must declare** `expected.ok`. Logical API `ok:false` on HTTP 200 is NOT a PASS if `expected.ok:true`.
- Only allowlisted read-only API actions may run. Write operations are deferred to isolated synthetic staging.
- Report only `status`, `errorCode`, timing, case ID, operation; never raw backend data/password/session token.
- Source contract remains `apps/vehicle-contact/contracts/api-inventory.v1.json`. Current allowlist is a constrained POC subset, not the entire 50-operation contract.
- The Worker access key is a development gate, not production identity/auth.
- Authenticated cases optionally use Worker-side test credentials with automatic Logout; do not send existing real-person data.

## AI-driven execution — separate integration

A Cloudflare Worker API existing on the internet does NOT automatically grant this chat the ability to issue arbitrary HTTPS POST. To permit AI direct calls, the Bridge must expose a **remote MCP endpoint** using Cloudflare's supported Streamable HTTP handler and be registered as a custom MCP plugin/connector in the target ChatGPT workspace.

Intended MCP tools:
- `list_api_test_suites`
- `run_api_test_suite`
- `run_api_test_case`
- `get_test_report`

ChatGPT-side availability, role permissions and plan access must be checked before claiming these tools are callable from chat. The currently connected GitHub and Google Drive tools do not provide a general HTTP POST executor. Do not rely on GET triggering stateful authenticated tests.

**As of this doc:** no deployed `/mcp`, no ChatGPT custom MCP connector registration, no direct ChatGPT→Cloudflare test execution.

Cloudflare MCP docs: https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/
OpenAI connector: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt

## Minimal development-phase security

Do not introduce full IAM/OAuth in the POC Runner. Continue using existing `BRIDGE_ACCESS_KEY`, fixed GAS URL, bounded payload, redacted reports, isolated synthetic data and automatic Logout. Before real-person/production testing, add authorization, isolation, write test recovery and stronger access controls.

## Gates

| Gate | Result |
|---|---|
| Existing Cloudflare Health/Authentication | Earlier deployed POC 1: Health 2/2, Auth 8/8 (owner supplied report, Sheet corroborated) |
| New data-driven `/api/run-tests` synthetic QA | Verify by linked CI run on draft branch |
| Cloudflare POC 2/3 deployment | NOT DONE |
| Live `/api/run-tests` | NOT TESTED |
| Remote MCP adapter | NOT IMPLEMENTED |
| ChatGPT plugin connection | NOT INSTALLED |
| All 50 API test cases / business write APIs | NOT CERTIFIED |

## Rollout

1. Confirm unit tests (including malicious case denial, expected-error matching, no secrets in JSON).
2. Owner copies current `worker.mjs` branch revision into existing Worker once to expose UI + data-driven suite runner.
3. Owner runs smoke suite with synthetic data; send sanitized JSON report for independent diagnosis.
4. Build a small remote MCP endpoint sharing the same runner; connect it through the supported ChatGPT plugin flow, and prove `tools/list`, `tools/call`, end-to-end GAS log.
5. After this gate, automate contract-based test generation and status tracking; reserve writes for a separate synthetic staging database.

No source on this branch is wired to an automatic Cloudflare deploy; changes require explicit Cloudflare deployment by owner. No GitHub Actions calls live GAS from this CI branch.
