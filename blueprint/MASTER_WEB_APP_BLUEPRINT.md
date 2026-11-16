# MT Web Application Master Blueprint
**Document ID:** MT-WEB-MBP-001  
**Version:** 1.0.0-draft  
**Decision:** Architecture direction approved 2026-11-16; production readiness not implied.

## Scope and precedence
This is the mandatory technical blueprint for **all web applications** in this repository. It governs HOW applications are built, not WHAT an individual project does. Project proposals, requirements, PDPA decisions, test evidence and operating procedures live only in `apps/<app-id>/docs/`. The independent [Platform and Identity Blueprint](platform/MASTER_BLUEPRINT.md) governs shared identity, SSO, role assignments and platform governance. Where an older platform document still suggests React, this approved Vue frontend baseline supersedes that technology choice. Do not interpret this as production approval of the older platform design.

## Standard stack
Vue 3, Vue Router, Pinia, Tailwind CSS, DaisyUI, HTML5, Vite; use reviewed pinned dependencies and lockfiles.

## Mandatory architecture
**Presentation → Application → Domain** with **Infrastructure adapters implementing Domain ports**. Enforce inward dependencies and domain isolation. Presentation and Pinia must not directly embed provider-specific API calls. Compose use cases, repositories and adapters at app startup.

**API-agnostic integration:** UI → use case → domain port → adapter → shared HTTP/SDK client → external API. Use REST/JSON, GraphQL, Supabase, GAS, Python/FastAPI or other approved provider through separate adapters. This does not bypass API authentication, authorization, CORS, provider rules or network reachability. Use a trusted backend gateway where browser requests require secrets or server-to-server access.

## Security rules
- No secrets or personal data in this public repository or browser bundle.
- Never rely on UI checks to grant rights; trusted backend/database verifies authentication, permissions and data scope.
- Use HTTPS, input validation, request timeout, safe error handling and minimal audit logging.
- Keep identity/SSO decisions in the platform blueprint; retain project-specific privacy/legal decisions only inside the app docs.

## Repository boundaries
```text
blueprint/                 # universal blueprints, standards, shared decisions
  MASTER_WEB_APP_BLUEPRINT.md
  architecture/
  standards/
  decisions/
  templates/
  platform/               # identity/SSO/platform governance (separate concern)
apps/<app-id>/
  README.md
  docs/                    # application-only proposals, PRD, design, PDPA, evidence
  src/{presentation,application,domain,infrastructure}/
  tests/
  public/
  package.json
packages/                  # truly reusable app-independent utilities
docs/qr-scanner-poc/        # legacy publicly served POC; keep URL stable until migration validated
```

## Binding supporting standards
- [Frontend](standards/FRONTEND_STANDARD.md)
- [Multi-layer and patterns](architecture/MULTILAYER_ARCHITECTURE.md)
- [API integration](standards/API_INTEGRATION_STANDARD.md)
- [Application structure](standards/APPLICATION_STRUCTURE.md)
- [Security](standards/SECURITY_STANDARD.md)
- [Testing and deployment](standards/TESTING_AND_DEPLOYMENT.md)
- [Architecture decisions](decisions/README.md)

## Enforcement gates
Architecture review → lint/build/tests → adapter contract tests → authorization/security review → staging/device verification → approved deploy and rollback plan. Project-level proof belongs under each app's `docs/`. Deviations require recorded ADR with owner, rationale and approval.

**Reference application:** [Vehicle Contact](../apps/vehicle-contact/README.md). Its business rules are not universal standards.


## App directory and generated Pages artifacts
Canonical application source remains under `apps/<app-id>/`; public links are registered in [`portal/apps.json`](../portal/apps.json) and rendered from [`portal/index.template.html`](../portal/index.template.html). Published files in `docs/` are build artifacts, **not** an alternate source of truth. The required check is `node scripts/sync-pages.mjs --check`.
