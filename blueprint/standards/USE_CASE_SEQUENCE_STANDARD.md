# MT Use Case & Sequence Diagram Standard (UML-SEQ-001)
**Scope:** All apps in MT Agency Super App Framework that implement business Use Cases.
**Status:** MANDATORY DESIGN GOVERNANCE (owner-approved 2026-11-17); **NOT production release approval**.
**Authority:** [Master Web Application Blueprint](../MASTER_WEB_APP_BLUEPRINT.md), [Master GAS Backend Blueprint](../MASTER_GAS_BACKEND_API_BLUEPRINT.md), [API Integration](API_INTEGRATION_STANDARD.md), [Testing & Deployment](TESTING_AND_DEPLOYMENT.md).

## Design principle
Every business-critical Use Case must have one clear owner, actor(s), preconditions, successful postconditions, exceptions, authorization gates, side effects and executable test references. A Sequence Diagram describes the **actual order of messages and state-changing effects** for that Use Case, not just a collection of API names. Related CRUD operations may share a diagram when their actor/security/transaction boundary is the same.

## Mandatory per-use-case artifacts
Inside `apps/<app-id>/docs/use-cases/<UC-ID>/`:
1. `specification.md`: title/owner, requirement source, actors, trigger, preconditions, happy path, alternate/error paths, side effects, API DTO, acceptance IDs and open risks.
2. `sequence.mmd`: canonical machine-readable Mermaid `sequenceDiagram`, with explicit `actor`, participants, directional messages, success result, `alt/else/opt/loop` as relevant, failure response and trust boundary.
3. A GitHub-renderable Mermaid excerpt in the specification must be synchronized by CI with `sequence.mmd`. The `.mmd` is the diagram SSOT, never maintain them independently.
4. `docs/use-cases/catalog.json`: application-owned case inventory mapping each published API operation to one **primary** Use Case. An operation may be *referenced* elsewhere but must have one owner.
5. `docs/traceability-matrix.md`: requirement authority → UC → actor → API operation/permission → code path → test case → verified evidence link/status. Never present planned tests as passed.

## Diagram semantics
- Show **Actor → Client/Presentation → API Adapter / trusted boundary → Router → authorization → Application Use Case → Infrastructure (Sheets/DB/Drive)** where relevant.
- Show authentication source and role/resource checks, critical payload fields, expected DTO responses and errors, timeout/rollback/retry assumptions.
- Include `LockService`, idempotency, audit, Drive file creation/deletion, journal/recovery when a mutation spans providers or Sheets tables.
- For async, retries or external providers, show the callback/response boundary. Don't depict Google Sheets as an ACID transaction or bypassable gateway as sufficient protection.
- Use current canonical API names and source implementations; separate **AS_IMPLEMENTED**, **APPROVED_POLICY**, **PROPOSED_CHANGE**. Surface discrepancies as a decision/ADR, do not silently change rules.
- Do not make one diagram per trivial DTO; group variants when semantics are identical and split different ownership/approval/security boundaries.
- Keep plain English participant names and concise API names for stable parsing; descriptions may be Thai for human readers.
- Files must be reviewable as text diffs and not require proprietary graphic authoring tools. Mermaid source remains in git.
- No personal data, passwords, live tokens or Secrets in diagram examples.

## Required CI Quality Gates
1. Every declared API v1 operation appears exactly once as primary owner; unknown/missing and duplicate mappings fail.
2. Every UC has a valid stable ID, spec, diagram and references to existing code/test file paths.
3. Diagram starts with `sequenceDiagram`, has actors and participants, message edges, and balanced control blocks `alt/else/opt/loop/end`; preview must match source byte-for-byte after trimming. Structural lint is **not** proof of render engine correctness.
4. Every spec explicitly distinguishes success, error, security and data effects, and indicates test evidence status.
5. CI must fail on broken links or missing blueprint references. Release gates still require actual security, staging, field UAT and change approvals.

## Review and change control
- **Before implementing FE:** approve relevant business rule, API DTO and component ownership; missing endpoint mapping blocks Merge for that UC.
- **When Backend changes:** update Mermaid/Spec/Catalog/Test before or in same PR; run contract/permission tests. Existing CI verifies coverage/files/structure but does **not** automatically infer diagram truth from source logic: human reviewer checks semantics and side effects.
- **After execution:** attach GitHub Actions job URL, source SHA, GAS deployment version, real API URL and staging test evidence to the UC; record any mismatch in decision log and repair before claiming E2E PASS.
- **Production:** security/PDPA/data retention approval and rollback plan are separate gates. A diagram or mock test cannot satisfy them.

**Reference implementation:** [P6 Vehicle Contact Use Cases](../../apps/vehicle-contact/docs/use-cases/README.md). Its 20 diagrams and 56 API operations are **application-specific**, not a universal blueprint.
