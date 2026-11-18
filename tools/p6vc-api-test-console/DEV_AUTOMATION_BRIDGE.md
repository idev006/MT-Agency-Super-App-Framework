# P6VC Dev Automated Test Bridge — Architecture and Deployment Gates

Status: IMPLEMENTED direct HTTPS Job Bridge on branch; **NOT deployed to Cloudflare**. This Codex environment can reach the Worker over HTTPS, so MCP and GitHub Issue Queue are not required for the primary path.

## Problem and direction

User wants to run many P6 Vehicle Contact API Test Cases without repeatedly opening GitHub Actions or manually deploying for each new input, and eventually reuse the same bridge for a production frontend.

One shared Cloudflare Worker contains:
- Existing Browser API Test Console
- `POST /api/health`, `POST /api/auth-suite`, and `POST /api/probe`
- **New** `POST /api/run-tests`: bounded, data-driven test suites
- **New** `POST /api/jobs`: idempotent AI job submission backed by Cloudflare KV
- **New** `GET /api/jobs/{jobId}`: persisted, redacted result retrieval

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

The current Codex host proved direct Worker connectivity on 18 Nov 2026: `GET /` returned HTTP 200 and an unauthenticated `POST /api/health` returned the expected HTTP 401. Therefore the primary AI path is direct HTTPS, using the same `BRIDGE_ACCESS_KEY` as the browser console and a KV binding named `TEST_JOB_STORE`.

Submit a job:

```http
POST /api/jobs
Authorization: Bearer <BRIDGE_ACCESS_KEY>
Idempotency-Key: p6vc-health-20261118-001
Content-Type: application/json

{"suiteId":"health-smoke","cases":[{"id":"H-01","operation":"system.health","method":"POST","payload":{},"expected":{"ok":true}}]}
```

The response is HTTP 201 with `jobId`, `status: "COMPLETED"`, and the redacted suite report. Retrying the same body with the same `Idempotency-Key` returns HTTP 200 with the original job and `replayed: true`, without calling GAS again. Reusing the key with a different body returns HTTP 409. Read the stored result with `GET /api/jobs/{jobId}` and the same Bearer key.

Job requests accept only `suiteId` and `cases`. Credentials must remain in Worker Secrets; they are never accepted in a persisted job request. Job and idempotency records expire after seven days by default. `TEST_JOB_TTL_SECONDS` may reduce retention to 1–168 hours.

Cloudflare KV is eventually consistent. The idempotency design prevents ordinary sequential retries. It is not a strict global concurrency lock; if exact once-only execution under simultaneous multi-region requests becomes necessary, migrate the claim step to a Durable Object.

Remote MCP remains an optional adapter for ChatGPT environments that cannot send HTTPS directly. GitHub Issue Queue remains a fallback only, not the runtime path for this Codex workspace.

Cloudflare MCP docs: https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/
OpenAI connector: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt

## Minimal development-phase security

Do not introduce full IAM/OAuth in the POC Runner. Continue using existing `BRIDGE_ACCESS_KEY`, fixed GAS URL, bounded payload, redacted reports, isolated synthetic data and automatic Logout. Before real-person/production testing, add authorization, isolation, write test recovery and stronger access controls.

## Gates

| Gate | Result |
|---|---|
| Existing Cloudflare Health/Authentication | Earlier deployed POC 1: Health 2/2, Auth 8/8 (owner supplied report, Sheet corroborated) |
| New data-driven `/api/run-tests` synthetic QA | Verify by linked CI run on draft branch |
| Direct HTTPS reachability from current Codex host | PASS: Worker HTTP 200; unauthorized API HTTP 401 |
| KV-backed `/api/jobs` + result retrieval | IMPLEMENTED; local mock tests PASS; not deployed |
| Cloudflare POC 2/3 deployment | NOT DONE |
| Live `/api/run-tests` | NOT TESTED |
| Live `/api/jobs` | NOT TESTED |
| Remote MCP adapter | OPTIONAL / NOT IMPLEMENTED |
| All 50 API test cases / business write APIs | NOT CERTIFIED |

## Rollout

1. Confirm unit tests (including malicious case denial, expected-error matching, no secrets in JSON).
2. Owner copies current `worker.mjs` branch revision into existing Worker once to expose UI + data-driven suite runner.
3. Owner runs smoke suite with synthetic data; send sanitized JSON report for independent diagnosis.
4. Create and bind Cloudflare KV namespace `TEST_JOB_STORE`, deploy the Worker once, then submit a Health job over direct HTTPS and retrieve it by `jobId`.
5. Store the Bridge key in the AI execution host's secret environment, never in source or command history; prove replay does not create a second GAS call.
6. After this gate, automate contract-based test generation and status tracking; reserve writes for a separate synthetic staging database.

No source on this branch is wired to an automatic Cloudflare deploy; changes require explicit Cloudflare deployment by owner. No GitHub Actions calls live GAS from this CI branch.
