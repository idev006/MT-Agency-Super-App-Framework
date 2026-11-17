# MT Web Application Master Blueprint
**Document ID:** MT-WEB-MBP-001  
**Version:** 1.0.0-draft  
**Decision:** Architecture direction approved 2026-11-16; production readiness not implied.

## Scope and precedence
This is the mandatory technical blueprint for **all web applications** in this repository. It governs HOW applications are built, not WHAT an individual project does. Project proposals, requirements, PDPA decisions, test evidence and operating procedures live only in `apps/<app-id>/docs/`. The independent [Platform and Identity Blueprint](platform/MASTER_BLUEPRINT.md) governs shared identity, SSO, role assignments and platform governance. Where an older platform document still suggests React, this approved Vue frontend baseline supersedes that technology choice. Do not interpret this as production approval of the older platform design.

## Mandatory GAS backend addendum
Any application that implements its backend/API using Google Apps Script **MUST** follow [MT Master GAS Backend API Blueprint](MASTER_GAS_BACKEND_API_BLUEPRINT.md) in addition to this web application blueprint. The GAS standard governs backend design patterns, layering, **provider-agnostic persistence/storage ports**, security, testing and clasp-based deployment. GAS may use any supported and authorized database or storage provider (including Google Sheets) through app-owned adapters. It does not require every app to use GAS or any particular database.

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
portal/                    # app directory source and public-link registry
_site/                     # temporary generated Pages artifact, never committed
```

## Binding supporting standards
- [Frontend](standards/FRONTEND_STANDARD.md)
- [Multi-layer and patterns](architecture/MULTILAYER_ARCHITECTURE.md)
- [API integration](standards/API_INTEGRATION_STANDARD.md)
- [GAS backend master blueprint (mandatory when GAS is used)](MASTER_GAS_BACKEND_API_BLUEPRINT.md)
- [Application structure](standards/APPLICATION_STRUCTURE.md)
- [Security](standards/SECURITY_STANDARD.md)
- [Testing and deployment](standards/TESTING_AND_DEPLOYMENT.md)
- [Use Case & Sequence Diagram SSOT](standards/USE_CASE_SEQUENCE_STANDARD.md)
- [Architecture decisions](decisions/README.md)

## Enforcement gates
Architecture review → lint/build/tests → adapter contract tests → authorization/security review → staging/device verification → approved deploy and rollback plan. Project-level proof belongs under each app's `docs/`. Deviations require recorded ADR with owner, rationale and approval.

**Reference application:** [Vehicle Contact](../apps/vehicle-contact/README.md). Its business rules are not universal standards.


## App directory and generated Pages artifacts
Canonical app source is under `apps/<app-id>/`; app directory source is in [`portal/`](../portal/README.md). The CI build creates disposable `_site/` output from those sources. No `docs/qr-scanner-poc/` or committed deployment copy is permitted. GitHub Pages must publish via GitHub Actions.
