# P6 Vehicle Contact — Engineering Team Charter (Role-Based)

**Document ID:** P6VC-TEAM-001  
**Approved by:** Project Owner, via ChatGPT project conversation  
**Approval date:** 2026-11-18 (Asia/Bangkok)  
**Status:** APPROVED — Role-based operating model; **not** personnel hiring, GitHub collaborator provisioning, or autonomous agent deployment.  
**Scope:** `apps/vehicle-contact/` exclusively. Project-wide reusable patterns belong separately in `blueprint/` only after separate review and approval.

## 1. Purpose and authority

The Project Owner approved **eight specialist roles** to help deliver the Vehicle Contact project. These are *work/review responsibilities that may be simulated or assisted by AI in chat*, not eight independent employees or automatically running agents. The Project Owner remains the decision maker. No change to GitHub permissions, Google Apps Script deployments, live personal data, production credentials, or external systems is implied by role approval.

Primary source of truth: `idev006/MT-Agency-Super-App-Framework`. Follow `blueprint/MASTER_WEB_APP_BLUEPRINT.md`, `blueprint/MASTER_GAS_BACKEND_API_BLUEPRINT.md`, and this app's approved requirements, contracts, schema, ADRs, and issues. Document evidence and avoid conflating simulated review with independent human audit.

## 2. Approved team roles and deliverables

| Role | Core competence | Accountable outputs | Review boundary |
| --- | --- | --- | --- |
| 1. Product Owner / Business Analyst | Actors, workflows, user stories, acceptance, scope and policy decisions | Requirements baseline, acceptance criteria, scope decisions | Project Owner (human) must approve business/policy changes |
| 2. Lead Software Architect / Technical Lead | Layered/clean architecture, SOLID, modular design, API contracts, ADRs and integration | Architecture review, dependency map, technical decisions, acceptance recommendation | Cannot self-certify independent security/QA |
| 3. Senior Backend Engineer | JavaScript, GAS V8, HTTP doGet/doPost, domain/service/repository separation, Sheets and Drive | GAS source, contract implementations, sanitized integration evidence | Security and QA reviews required |
| 4. Security / IAM Engineer | Authentication, RBAC, session lifecycle, secret management, OWASP API security, abuse controls | Threat model, direct-/exec bypass checks, authorization matrix, secrets control | Human security/authority sign-off before protected-data release |
| 5. Database / Data Engineer | Data modelling, canonical JSON schema, Sheets adapters, consistency, locks, migrations and recovery | Schema diff, repository tests, data integrity/recovery evidence | Schema is controlled by approved `schema/database.schema.json` |
| 6. QA Automation Engineer | Unit, contract, GAS Editor, live HTTP, adversarial, regression and device/UAT | Test matrix, expected/actual, test artifacts, defects, acceptance report | PASS requires actual reproducible evidence; AI review alone is not independent QA |
| 7. Senior Frontend Engineer | Vue 3, TypeScript, Vite, Vue Router, Pinia, Tailwind/DaisyUI, mobile UX, API adapters | Mock screens, contract-first adapter, accessible responsive UI, Android/iOS checks | Do not expose live PII before security gates |
| 8. DevOps / Release Engineer | GitHub, branches/PR, CI/CD, clasp, secrets/config, deploy provenance, rollback/observability | Build/CI logs, release checklist, deployment ID, rollback test | Production deployment requires explicit owner approval |

**Required external sign-off roles (not replaced by AI):** real project sponsor/data controller; Thai legal counsel and DPO/privacy authority where applicable; operational owner; independent security reviewer when real personal data is involved.

## 3. Role-specific review gates and sequence

1. **Requirement gate — Product Owner/BA + Architect:** Requirements and Actors/Use Cases traced to API contracts and tests; unresolved business/PDPA decisions recorded, never silently approved.
2. **Implementation gate — Backend + Database:** Layer boundaries, domain invariants, code/tests, controlled schema and sandbox-only configuration, no secrets/PII in GitHub.
3. **Security gate — Security/IAM:** Verify username/password, session expiry/revocation, RBAC per action/resource, direct `/exec` bypass resistance, replay/enumeration/QR privacy, fail-closed behavior. Independent human approval is needed for releasing real PII.
4. **QA gate — QA Automation:** Evidence with exact Git SHA, test layer, environment/deployment, sanitized inputs, expected/actual, errors and defect links. Distinguish GAS Editor results from real HTTP.
5. **Frontend gate — Frontend + Architect:** Only contract-first mock work can proceed while protected HTTP APIs are blocked; FE–BE integration readiness requires actual authenticated staging HTTP evidence.
6. **Release gate — DevOps + Owner:** Confirm reviewed changes, CI and runtime, manual production authorization, least-privilege secrets, rollback and monitoring. No automatic production deploy.

**Operating rule:** A role's own output cannot be treated as an independent review. At minimum, represent separate developer and reviewer assessments with cited test evidence; critical security/privacy gates require an actual authorized human.

## 4. Immediate assignments (as of 2026-11-18)

| Order | Task | Primary role | Supporting roles | State / evidence required |
| --- | --- | --- | --- | --- |
| P0 | Verify actual GAS staging deployment ID/version, `VEHICLE_API_ENABLED`, controlled Script Properties and sandbox isolation | Backend | DevOps, Security | TODO — sanitized deployment/config evidence, never reveal pepper |
| P0 | Investigate `SERVICE_UNAVAILABLE` on protected `auth.login`/business routes and direct ingress security | Security | Backend, Architect | BLOCKED until controlled staging verified |
| P0 | Authenticated protected API tests over real HTTP: valid/invalid login, sessions, RBAC, lookup, QR, negative cases | QA | Backend, Security | NOT YET EVIDENCED — distinguish from Editor 40/40 and public HTTP 12/12 |
| P1 | Verify Sheets data integrity, locks, idempotency, concurrency and recovery on synthetic fixtures | Database | Backend, QA | PENDING staging evidence |
| P1 | Review FE integration readiness decision and API contract changes | Architect | Frontend, QA | HOLD until protected HTTP gate passes |
| P2 | Prepare UI mock and deployment scaffolding without real personal data | Frontend | DevOps | MAY PROCEED with synthetic data, not release approval |

Baseline source: `docs/BACKEND_ACCEPTANCE_REPORT_20261117.md`, `docs/PROJECT_HANDOVER.md`, `docs/AGILE_KANBAN.md`. Always refresh live code, Issues, CI and deployment before changing statuses.

## 5. RACI — decision ownership

| Decision or output | Responsible (R) | Accountable (A) | Consulted (C) |
| --- | --- | --- | --- |
| Requirements and business scope | BA | Project Owner | Architect, operations |
| Architecture/ADR recommendation | Architect | Project Owner | Backend, Security, Database, Frontend |
| GAS implementation | Backend | Architect | Database, Security, QA |
| Data model and controlled migrations | Database | Architect | Backend, QA, Project Owner for schema/policy changes |
| Security findings and release recommendation | Security | Authorized human security/data controller for protected PII | Backend, QA, DPO |
| Tests and acceptance evidence | QA | Project Owner for business acceptance | Security, Backend, Architect |
| Frontend integration | Frontend | Architect | Backend, QA |
| Deployment/rollback | DevOps | Project Owner | Security, QA, Architect |
| PDPA/legal compliance approval | Authorized legal/DPO/controller | Authorized human authority | BA, Security |

## 6. Team working agreement

- GitHub app docs are the project SSOT; global blueprints are not mixed into app-specific decisions.
- Work through Issues/PRs; never mark DONE without exact evidence. Report `DONE-EVIDENCED / IN-PROGRESS / REVIEW / BLOCKED / TODO / DEFERRED`.
- Definition of Ready: goal, owner role, scope/PII classification, dependencies, acceptance and environment.
- Definition of Done: traceable source/contract, tests, relevant reviews, sanitized evidence and approvals. CI PASS does not equal production acceptance.
- No personal data, secrets, private pepper values or actual credentials in tests, chat or repo.
- No automatic/background actions are created by this charter. Team responsibilities are invoked during explicit work requests, not independently scheduled jobs.
- This charter is approval of **roles and workflow only**, not any pending security, policy, data-processing or production-release decision.
