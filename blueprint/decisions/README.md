# Architecture Decisions
ADR format: ID, date, status, context, options, decision, consequences, owner and approver. Platform-wide ADRs live here; app-only decisions remain in its docs.

**ADR-001 (2026-11-16):** User-approved baseline: Vue stack; multi-layer API-agnostic architecture; strict separation of `blueprint/` and `apps/<app-id>/docs/`. Legacy platform identity/SSO design remains separate and subject to its own approvals.

**GAS Pattern Review (2026-11-17):** [MT-GAS-REV-001](../architecture/GAS_DESIGN_PATTERN_REVIEW_2026-11-17.md) records evidence-based mandatory vs conditional design-pattern choices; the normative [GAS Master Blueprint](../MASTER_GAS_BACKEND_API_BLUEPRINT.md) remains the implementation rule. This review does not authorize production deployment.
