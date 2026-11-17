# UC-CAMP-02 — Validate a public registration campaign token
**Status:** DESIGN_BASELINED_FROM_SOURCE; LIVE_GAS_ACCEPTANCE_PENDING
**Actor:** Anonymous registrant

## 1. Authority and scope
- Business baseline: [Approved requirements](../../APPROVED_REQUIREMENTS_BASELINE_R01_R26.md).
- API operations: `campaigns.validate` (API v1 JSON envelope, GAS POST except public health GET).
- Implementation: `backend/gas/src/application/use-cases/AdministrationOperations.js`; server permission source `backend/gas/src/api/controllers/OperationController.js`.
- Diagram source: [sequence.mmd](sequence.mmd) (Mermaid, reviewed alongside spec).

## 2. Preconditions
Registrant opens a campaign URL with opaque token; a campaign has been created by System Admin.

## 3. Successful outcome / postconditions
Server checks digest, ACTIVE status, start/end window, revocation and available quota; returns validity without privileged data.

## 4. Failure and alternate paths
Malformed, unknown, expired, revoked or full campaign token returns CAMPAIGN_INVALID.

## 5. Persistence / external side effects
- `vc_campaigns`

## 6. Acceptance trace
- Test case IDs: `ACTOR-02`, `EDGE-05`.
- Executable evidence references: `backend/gas/tests/actor-usecase-acceptance.test.mjs`.
- Passing tests for source paths do not automatically prove all cases of this UC. Real GAS Editor and authenticated staging HTTP remain separate release gates.
- FE status: **NOT_WIRED**; design must align Vue 3, Pinia, Router and API adapter per Master Web Blueprint.

## 7. Development notes / explicit gaps
Validation is advisory before form submission; actual quota check repeats inside registrations.submit under ScriptLock.

## 8. Approval conditions
Traceability check PASS; frontend API adapter request/response and errors match backend v1; auth/default-deny and negative tests demonstrated; staging execution evidence linked to SHA; remaining discrepancies dispositioned by ADR.


**Evidence classification:** Diagram is a source-reviewed implementation model, NOT proof of successful real GAS HTTP integration or production release. Runtime discrepancies must be recorded in decision log and revised via PR.

## 9. GitHub Mermaid Preview

```mermaid
sequenceDiagram
  autonumber
  actor Registrant
  participant FE as Vue Public Registration
  participant API as GAS API
  participant Campaign as Campaign Use Case
  participant DB as Sheets
  Registrant->>FE: Open shared campaign link
  FE->>API: campaigns.validate(campaignToken)
  API->>Campaign: Validate token format / hash digest
  Campaign->>DB: Read vc_campaigns
  alt Active, within window, below submission quota
    Campaign-->>API: valid=true / campaignId
    API-->>FE: Show registration form
  else Revoked, expired, invalid, or full
    API-->>FE: CAMPAIGN_INVALID
    FE-->>Registrant: Form unavailable / retry later
  end
  Note over API,DB: Submit must recheck quota under LockService; never trust this precheck
```
