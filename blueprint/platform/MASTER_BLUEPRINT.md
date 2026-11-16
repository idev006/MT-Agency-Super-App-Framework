# MT Agency Super App Framework — MASTER BLUEPRINT

**Document ID:** MT-SAF-MBP-001  
**Version:** 1.0.0-draft  
**Date:** 2026-10-30  
**Status:** PROPOSED — architecture blueprint, not production approval  
**Organization:** ตำรวจภูธรภาค 6  
**SSOT:** https://github.com/idev006/MT-Agency-Super-App-Framework  
**Document owner (proposed):** Platform Architecture Team  
**Approval authority:** To be designated by organization

> **Document control:** This blueprint is the top-level technical and functional reference. Approved changes must be committed to this repository. The Git history and recorded architecture decisions provide traceability. Chat discussions are working material and do not supersede committed approved decisions. Detailed specifications linked below remain authoritative for their respective areas; resolve conflicts through an explicit ADR rather than silently rewriting requirements.

## 1. Executive Summary

Develop a secure, modular platform for agency applications: one canonical personnel identity, single sign-on in supported session contexts, app-specific entitlement, roles, permissions, scoped access, and auditable delegation. Add new applications through a governed onboarding contract **without rewriting core authentication**. Start with Vehicle QR as the reference application; validate adding Meeting Room as the second.

**North-star:** One Identity · One Sign-On · Many Apps · Independent Permissions.

**Important distinction:** Signing in does not automatically authorize an application. App visibility is a convenience; servers and databases enforce actual privileges. A link in the registry does not magically enable SSO for an external application.

## 2. Scope and Non-goals

### In scope (platform)
- Web/PWA, mobile-first Android/iOS, optional LINE MINI App/LIFF entrance.
- Identity and session integration; personnel account linkage and provisioning/deprovisioning.
- App Registry, App Portal, app manifest and controlled publishing.
- Authorization administration (platform/app/unit delegation), effective permissions, scopes and grant approvals.
- Common integration SDK/contract, trusted backend authorization, tenant/agency hierarchy, audit, observability.
- QR camera support (front/rear selection), fallback plate lookup, and human verification for Vehicle QR.
- GAS/Sheets as optional reporting/import/automation integration.

### Not in scope for Foundation MVP
- Guaranteed seamless SSO across every external browser, LINE WebView and unrelated third-party domain.
- Arbitrary third-party JavaScript installation by pasting a URL.
- AI number-plate recognition, automated barriers, CCTV/physical access controls.
- Public lookup of vehicle ownership from QR alone; integration with government vehicle owner registries without authorization.
- Claims of production certification, security assessment or compliance approval before they are completed.

## 3. Stakeholders, Ownership and Governance

| Responsibility | Proposed actor | Restrictions |
|---|---|---|
| Business sponsor | Designated command leadership | Approves scope, policies and deployment |
| Platform owner | Designated agency IT governance | Owns common identity, integration standards and risks |
| Platform Admin | Delegated central admin | Registers apps; cannot bypass approval controls silently |
| Application owner | Responsible unit/official | Owns business rules and data classification |
| App Admin | Delegated by application owner | Manages roles and grants for assigned app/scope only |
| Unit Admin | Delegated unit representative | Grants within unit and policy bounds only |
| Privileged grant approver | Designated authority | Approves sensitive access, may be distinct from technical operator |
| Data steward / privacy officer | Designated authority | Data access purpose, retention and privacy decisions |
| Security reviewer | Independently designated reviewer | Tests threat model, permissions, logging, secrets |
| End user | Authorized personnel | Access limited to granted apps/operations/data |

**Separation of duties:** For high-risk roles, requester ≠ approver where feasible; administrators cannot self-grant privileged access without an independent approval path. Delegation must be limited by app, organization, role grantability and effective dates.

## 4. Architecture and Trust Boundaries

```text
Android / iOS / Desktop browser          LINE MINI App / LIFF
               \                          /
                -> Responsive Super App Shell (React + TypeScript)
                   HTTPS, trusted static deployment (candidate: GitHub Pages)
                       |
                       v
             Central Identity & Sessions (Supabase Auth candidate)
                       |
                       v
        App Registry + Central Authorization Administration
        Roles / Permissions / Scoped grants / Approvals
                       |
             +---------+----------+
             |                    |
             v                    v
       Vehicle QR API       Meeting Room API       Future App APIs
       trusted backend      trusted backend        trusted backend
             |                    |                    |
             +---------- PostgreSQL / RLS -------------+
                       |
              Audit / Metrics / Backups
                       |
          Optional secure integration adapters
                GAS / Google Sheets
```

**Technology baseline (PROPOSED; subject to PoC/security review)**
- **UI:** React, TypeScript, mobile-first Web/PWA; repository on GitHub; static host may use GitHub Pages if acceptable.
- **LINE:** LIFF / LINE MINI App as an additional entry point into the same shell.
- **Identity:** Supabase Auth and institution-approved linking between LINE identity and canonical personnel identity.
- **Database:** Supabase PostgreSQL with RLS; business data separated by domain/schema and policy.
- **Privileged APIs:** Supabase Edge Functions or equivalent protected server APIs.
- **Google integration:** GAS / Sheets for reporting, import/export and automation; **not** authoritative for permissions.
- **CI/CD:** GitHub Actions and protected review workflow; explicit staging and production environments.

**Trust boundaries / invariants**
1. Client/UI and QR content are untrusted. Never accept client-asserted user IDs, roles, org scopes or authorization decisions.
2. JWT must be signature/audience/issuer/expiry-validated at appropriate boundaries; freshness-sensitive decisions consult current grants.
3. RLS and/or server enforcement must protect every data path, including direct API calls, downloads and deep links.
4. Secret/service-role keys never go to GitHub Pages, LIFF, browser bundles or public repositories.
5. Browser/LINE WebView sessions may be isolated. Promise SSO only within validated contexts; separate browser contexts may require reauthentication.
6. GAS external endpoints must use a verified server-to-server integration model. Do not assume CORS, redirects or GAS session email can serve as secure authorization.
7. Data sent to Sheets must follow classification/retention constraints. Do not export full personnel datasets by default.
8. All authorization denials are safe and do not disclose hidden resource existence where avoidable.

## 5. Identity, SSO and Account Lifecycle

**Canonical identity:** immutable `platform_user_id` mapping to Supabase `auth.users.id`; personnel attributes (rank, role, unit) are mutable metadata, **not** primary identifiers.

**Proposed flows**
- **Web:** verified sign-in → server-issued session → portal fetches allowed applications → modules use common session.
- **LINE:** LIFF identity/LINE Login → verify issuer/token server-side via approved integration → link to verified agency personnel account → create/restore app session → portal. Merely having LINE does **not** create personnel entitlement.
- **Independent app:** OIDC Authorization Code + PKCE using an approved identity provider/bridge, validate tokens on its backend; do not put access tokens in URLs or pretend a registry link is SSO.
- **Provision:** invitation/verified personnel lookup → account proofing → initial minimal roles → approved grants.
- **Transfer:** update unit affiliations/scopes and recertify sensitive grants.
- **Departure/suspension:** disable platform access, revoke grants/sessions as appropriate and apply retention policy.
- **Reauthentication:** require stronger assurance/MFA for privileged changes and sensitive operations.

**SSO acceptance definition:** An authenticated user can change between internal modules of the same shell during a valid session without entering credentials again; access is still checked per module and action. Cross-WebView/domain SSO must be validated separately.

## 6. Authorization Model: App × Role × Permission × Scope

**Policy:** default deny; no app access without an active assignment or explicit approved entitlement.

`allow = account_active AND app_active AND app_entitled AND permission_active AND grant_valid AND scope_matches AND resource_policy_satisfied AND context_policy_satisfied`

- **App access:** can the user enter Vehicle QR / Meeting Room / other registered apps?
- **Roles:** app-owned collections of permissions, e.g. Vehicle `VIEWER`, `OPERATOR`, `APPROVER`, `APP_ADMIN`; other apps define their own roles.
- **Permissions:** stable namespaced action keys, e.g. `vehicle.read`, `vehicle.update`, `vehicle.parking.approve`, `meeting.book`, `meeting.approve`.
- **Scopes:** organization tree, app-specific resource or geographic/parking zone if required, with validity windows.
- **Multiple roles:** one user may hold multiple roles in a single app, each with different scopes. Union of permissions does **not** remove scope restrictions or explicit deny rules.
- **Delegated administration:** App/Unit Admin assigns only allowable roles in their delegated scope; high-risk grants use approval workflow.
- **Role definition governance:** app owner registers approved permissions; App Admin maps them to roles under agreed governance; cannot invent a permission that backend has not implemented.
- **Data policy:** where row-level rules cannot express complex business authorization alone, call trusted server-side policy checks.

### Example (illustrative)
| User | App | Role | Scope |
|---|---|---|---|
| U001 | vehicle-qr | VIEWER | all agency units |
| U001 | vehicle-qr | ADMIN | one directorate |
| U001 | meeting-room | USER | one unit |
| U001 | dashboard-191 | none | deny |

### Administration workflow
Request access → verify delegating authority → approver reviews when needed → trusted grant mutation → audit before/after → re-evaluate live permissions. Review sensitive grants periodically; grants may be time-limited.

## 7. Logical Data Model (platform)

```text
auth.users   1----1 profiles
organizations 1----* organization_memberships
applications 1----* app_permissions
applications 1----* app_roles
app_roles *----* app_permissions      via role_permissions
profiles 1----* user_role_assignments ----1 app_roles
user_role_assignments ---- organization/resource scope
applications 1----* app_admin_delegations
profiles 1----* identity_links
access_requests 1----* grant_approvals
all privileged changes ---- audit_events
```

**Minimum tables:**
`profiles`, `organizations`, `organization_memberships`, `applications`, `app_permissions`, `app_roles`, `role_permissions`, `user_role_assignments`, `app_admin_delegations`, `access_requests`, `grant_approvals`, `identity_links`, `audit_events`.

**Required integrity rules**
- All role↔permission associations belong to the **same** application (enforce using composite keys/FKs or trusted constraint logic).
- All grants refer to active app/role and valid approved scope; at most one equivalent active grant per user/role/scope/validity semantics.
- For every grant: `granted_by`, effective period, status, reason/reference and approval metadata.
- Use UUIDs, UTC timestamps, indexed foreign keys, appropriate uniqueness, auditable changes, soft disable for referential continuity.
- Prohibit unreviewed public reads of users, phone numbers, registrations, token mappings and audit logs.
- Database changes via version-controlled migrations; no manual production schema edits without migration reconciliation.

**Domain isolation:** each app owns domain tables and business rules, while platform owns user/app/role/permission/grant primitives. Module data must not be copied into the central identity store.

## 8. App Registry and Onboarding Contract

Lifecycle: **draft → reviewed → staged → active → suspended/retired** (transitions audited).

**Required manifest fields:** stable `app_id`, name, owner, version, internal/external/GAS integration type, route/approved origin, icon, permission declaration, data classification, support contact, status, dependencies, min platform SDK compatibility.

**Onboarding steps**
1. Owner submits business scope, data types, and risk assessment.
2. Platform registers app, deployment type and approved URL/origin.
3. Declare namespaced permissions with business descriptions and implemented server-side checks.
4. Define roles and permitted grant scopes; appoint delegated administrators and approvers.
5. Provision staging configuration, RLS and API security checks.
6. Verify mobile usage, SSO/session behavior, default deny, audit and privacy review.
7. Publish to targeted users; implement suspension, rollback and retirement.
8. Add second application without changing identity core as a mandatory integration test.

**Two integration paths**
- **Internal modules (MVP):** built, reviewed, versioned, and deployed within shared shell; single shell session.
- **Independent apps:** must implement approved OIDC flow and server-side token validation. Registry may deep-link but never supplies credentials in the URL.
- **GAS apps:** integrate via explicitly secured backend adapter; do not assume Apps Script HTML Service and GitHub Pages share session.

**No arbitrary remote code loading** from user-entered URL. Application entries are **registry metadata** and link to reviewed build artifacts.

## 9. Shared Platform API / SDK Contract (planned)

```typescript
interface PlatformSDK {
  getCurrentUser(): Promise<SafeUserProfile>;
  listMyApps(): Promise<AppSummary[]>;
  canAccessApp(appId: string): Promise<boolean>;
  hasPermission(appId: string, permission: string, resource?: ResourceContext): Promise<boolean>;
  getMyScopes(appId: string): Promise<DataScope[]>;
  openApp(appId: string): void;
}
```

Client helpers only affect UX; they are **not authorization proof**. Privileged endpoints must validate identity, current grants and target resource themselves.

**Illustrative backend endpoints / functions**
- `GET /me`; `GET /me/apps`; `GET /me/entitlements?app=...`
- `POST /admin/apps` and `POST /admin/apps/{app}/publish` (platform admin only)
- `POST /admin/apps/{app}/roles` (delegated app admin)
- `POST /admin/grant-requests` → `POST /admin/grants/{id}/approve`
- `POST /vehicle/qr/resolve` (authenticated and scoped), `POST /vehicle/verify`

Use idempotency for grant mutations, pagination and consistent errors (`401` unauthenticated, `403` forbidden, `404` unavailable resource as appropriate). Server audit includes correlation ID. Endpoint shapes are **proposed**, to be finalized by OpenAPI spec before implementation.

## 10. Vehicle QR — Reference Application

**Problem:** Commanders need to identify whose vehicle is parked, whether it has permission to enter and whether it may use the **current** parking zone.

**Personas:** commander/inspector, registration operator, parking approver, app administrator, designated security staff.

**Primary use cases:** register vehicle and linked registered user/owner-claim; approve site and zone permissions; issue/rotate/revoke opaque QR; scan from standard phone camera; in-app scanner selecting front/rear; look up plate as fallback; verify make/model/type/color/plate/photo against actual car; flag mismatch, unauthorized zone, expired permission; contact responsible officer through approved channel; audit.

**QR format:** HTTPS route carrying a high-entropy opaque vehicle QR identifier (at least 128 bits from a cryptographically secure RNG). QR contains **no direct personnel PII**. Hash/token lookup mapping stored server-side; token rotation invalidates old identifier; avoid exposing raw token in third-party analytics and referrer leakage. Scanning alone does **not** authorize reading owner information.

**Response:** after authenticated/scoped check show plate, issuing province, vehicle type, make, model, color, approved photo, registered user vs legally verified owner (clearly differentiated), access permission status, allowed zones/time, expiry and last update. Do not equate a registered user with legal owner absent an authoritative proof.

**Physical verification:** copied QR resolves to original vehicle; human compares physical plate and vehicle characteristics, confirms match or reports discrepancy. Even matching characteristics alone cannot guarantee authenticity. Current parking zone must be explicitly provided via user selection, location permit context or zone QR; vehicle QR alone cannot prove parking location.

**Camera requirements:** HTTPS, permission prompt, `getUserMedia` with `facingMode` (`environment` / `user`), enumerate supported devices where available, release stream before switching; fallback manual lookup. Test Android Chrome, iOS Safari, LINE WebView and external browser. Torch capability is optional and feature-detected. LINE scanner may be fallback only if camera choice requirement remains satisfied by main scanner.

**Vehicle Contact v1.0 clarification (2026-10-30):** The immediate policy goal is identification of the registered responsible person and an authorized tap-to-call number. Support **up to five optional vehicle photos** (front, rear, left, right, three-quarter), with secure upload/gallery per [Vehicle Contact workflow and media pipeline](../apps/vehicle-contact/WORKFLOW_AND_MEDIA_PIPELINE.md). Registration and QR issuance must not be blocked by missing photos. Parking-zone authorization, incidents and relocation workflows are future-phase concepts, not v1 scope.

**Suggested domain entities:** `vehicles`, `vehicle_people`, `vehicle_photos`, `vehicle_qr_tokens`, `parking_zones`, `parking_permissions`, `vehicle_verifications`, `vehicle_incidents`.

**Statuses:** `AUTHORIZED` (within location/time/scope), `NOT_AUTHORIZED`, `EXPIRED`, `REVIEW_REQUIRED`, `UNKNOWN`. No QR/no lookup match is **unknown**, not automatically an offense.

## 11. Privacy, Security and Operations Baseline

- Data inventory and legal basis/purpose assessment for personnel, plate numbers, images and scan history; notice, access controls and retention approved by organization.
- Public QR URL should only redirect to auth/safe landing. Never expose personal owner data to anonymous scan requests.
- Threat modeling: QR cloning, token enumeration, stolen phone, unauthorized role grant, cross-app permission confusion, compromised LINE account, malicious deep link, insecure GAS integration, leaked service keys.
- MFA for sensitive admins, rate limit QR lookup, anomaly alerts, account suspension, row policies and Edge Function authorization.
- Audit security events and role changes with actor, target, reason, decision, context and correlation; protect audit against tampering and unauthorized reads.
- Production runbook: deployment/rollback, backup/restore rehearsal, monitoring, incident response, key rotation, access review, recovery ownership, retention/purge.
- Separate dev/staging/production environments, datasets and credentials. Seed non-sensitive synthetic data in test.
- Define availability, latency, recovery objectives, storage, quotas and operating cost **before** production approval.
- Security/privacy approval and penetration testing must precede processing sensitive operational data.

## 12. Delivery Plan and Acceptance Gates

| Gate | Deliverable | Exit criteria |
|---|---|---|
| G0 — Governance | Owners, approvals, data classification, architecture decision record | Decision authority and open risks explicitly recorded |
| G1 — Foundation | Repo, CI, Supabase environments, migrations, identity and roles | Login; app A granted, app B denied; server denies direct API |
| G2 — App Portal | Shared shell, app registry, delegated administration | My Apps reflects current rights; privileged grants audited |
| G3 — Vehicle QR | Registration, QR issue/resolve, permissions, camera UI | Android/iOS physical tests; front/rear; owner view protected; manual fallback |
| G4 — Second App | Meeting Room reference integration | Add app without changing identity core; independent roles and scopes |
| G5 — LINE / GAS integration | LINE sign-in PoC and optional reporting adapter | Verified identity bridge, cross-context limitations documented, security review |
| G6 — Production readiness | Security assessment, backups, monitoring, admin runbook | Authorized approval of risk, retention, operational ownership and recovery |

**Mandatory negative tests**
- Anonymous QR scan cannot see personnel info.
- App-unentitled user denied even if direct URL/API is known.
- Role belonging to app A is not honored in app B.
- App A admin cannot grant app B roles or elevate own privilege.
- Scoped admin cannot read/write data in other units.
- Revoked grant prevents sensitive operations using stale client state.
- Malformed/expired/rotated QR fails safely.
- Copy of QR displays original registered details, requires human comparison.
- Camera unavailable/permission denied degrades to manual plate search.
- All relevant grant operations and security denials are observable.

## 13. Versioning and Change Control

- **This document:** `MASTER_BLUEPRINT.md` is parent scope/design reference.
- **Subordinate docs:** `PROJECT_CHARTER.md`, `ARCHITECTURE.md`, `AUTHORIZATION.md`, `APP_ONBOARDING.md`, `DECISIONS.md`.
- All significant design changes require a Decision Record (ADR): ID, date, context, alternatives, decision, impacts, approver, status.
- Version via Git commits and reviewed PRs. Use semantic versioning for framework/API; define compatibility policy for apps.
- Status vocabulary: `PROPOSED`, `APPROVED`, `IMPLEMENTED`, `VERIFIED`, `DEPRECATED`.
- **No approval by inference.** This document is not proof of deployment, operational security, or official authorization.

## 14. Pending Decisions (must resolve before production)

1. Official accountable platform owner, app owners, approvers and privacy/security representatives.
2. Identity proofing source and user provisioning/termination workflow.
3. Whether LINE is primary login method or optional linked identity; technical feasibility of provider bridge and SSO sessions.
4. Production hosting/domain ownership, GitHub Pages eligibility, TLS/CSP and custom domain policy.
5. Organization hierarchy, delegated authority, high-risk role approval and recertification frequency.
6. Data classification, retention, lawful processing basis, storage region and backup/recovery objectives.
7. Operational budget, concurrency and expected usage volumes; paid tier decisions for Supabase/LINE if needed.
8. QR sticker materials and printing, physical control, zone verification policy and exception handling.
9. External app compatibility contract, SDK packaging, security review and release sign-off.
10. GAS/Sheets import/reporting controls, service identity and data synchronization ownership.

## 15. Companion Documents and Read Order

1. **This Master Blueprint** — intent, architecture, scope, governance, delivery gates.
2. [PROJECT_CHARTER](PROJECT_CHARTER.md) — business objectives and success.
3. [ARCHITECTURE](ARCHITECTURE.md) — layered architecture and trust boundaries.
4. [AUTHORIZATION](AUTHORIZATION.md) — roles, grants and policy.
5. [APP_ONBOARDING](APP_ONBOARDING.md) — external and internal app contract.
6. [DECISIONS](DECISIONS.md) — approved vs proposed decisions and open questions.

---
**SSOT policy:** The repository, not chat, is the durable project record. Treat this file as a *draft Master Blueprint* until the designated authority explicitly approves its scope, architecture and risk controls.
