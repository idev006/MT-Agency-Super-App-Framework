# MT Agency Super App Framework

> **Project status:** Architecture baseline (proposed) — not yet approved for production.

ระบบแพลตฟอร์มกลางสำหรับแอปพลิเคชันของตำรวจภูธรภาค 6 โดยตั้งเป้าหมายให้ผู้ใช้ **เข้าสู่ระบบครั้งเดียว** และใช้แอปที่ได้รับอนุญาตได้ โดยแต่ละแอปมีบทบาท (Roles), สิทธิ์ (Permissions) และขอบเขตข้อมูล (Scopes) เป็นของตัวเอง

## Source of Truth

**This GitHub repository is the Single Source of Truth (SSOT) for project documentation.** Decisions, changes, acceptance criteria, and architecture must be version-controlled here. Chats and generated summaries are working material until committed here.

## Start here

- **[Master Web Application Blueprint](blueprint/MASTER_WEB_APP_BLUEPRINT.md)** — mandatory for all web apps
- **[Master GAS Backend API Blueprint](blueprint/MASTER_GAS_BACKEND_API_BLUEPRINT.md)** — mandatory for each app's GAS backend, if used


- **[MASTER BLUEPRINT — primary project design reference](blueprint/platform/MASTER_BLUEPRINT.md)** (v1.0.0-draft; proposed, not approved for production)
- [Project Charter](blueprint/platform/PROJECT_CHARTER.md)
- [Architecture Baseline](blueprint/platform/ARCHITECTURE.md)
- [Authorization Model](blueprint/platform/AUTHORIZATION.md)
- [App Onboarding Contract](blueprint/platform/APP_ONBOARDING.md)
- [Decisions and Open Questions](blueprint/platform/DECISIONS.md)

## Target stack (proposed)

- Frontend: Vue 3 + Vue Router + Pinia + Tailwind CSS + DaisyUI + Vite; GitHub repository / HTTPS hosting (evaluate GitHub Pages against organizational security requirements)
- Entry points: Web/PWA and LINE MINI App / LIFF
- Primary backend: Supabase Auth, PostgreSQL, RLS, Edge Functions
- Optional integrations: Google Apps Script and Google Sheets for reports/imports (not the authoritative authorization database)

## Core principles

1. One canonical user identity; single sign-on within a shared session context.
2. Default deny; app access is separate from permissions within each app.
3. A user may hold multiple roles, scoped to apps and organizations.
4. App admins manage only delegated apps/scopes; privileged grants require appropriate approval and audit.
5. Backend and database enforce authorization. Hiding UI is not security.
6. App registration is not sufficient for SSO with third-party systems; external apps must implement a trusted SSO integration.
7. New apps should not require rewriting the platform authentication core.
8. No credentials, real personnel records, vehicle-owner records, or operationally sensitive data in this public repository.

## Application 001 — MT Vehicle Contact

- [Vehicle Contact app documentation / implementation entrypoint](apps/vehicle-contact/README.md)
- [Product requirements](apps/vehicle-contact/docs/PRODUCT_REQUIREMENTS.md)
- [Technical design](apps/vehicle-contact/docs/TECHNICAL_DESIGN.md)
- [Test & delivery](apps/vehicle-contact/docs/TEST_AND_DELIVERY.md)

## First reference application

**Vehicle QR** — register vehicles; issue opaque QR identifiers; verify plate, make, model, color, registered person and parking permissions. Android/iOS camera selection is a required proof-of-concept item.

## Change control

Update architecture docs via Git commits / Pull Requests. Mark proposals as proposed until explicitly accepted. Do not treat the current documents as deployed or security-certified.


## Mandatory web application standard
[MT Web Application Master Blueprint](blueprint/MASTER_WEB_APP_BLUEPRINT.md) applies to every application. Individual project documentation lives exclusively under `apps/<app-id>/docs/`. Historical document URLs retain relocation pointers. The QR POC is stored only in `apps/vehicle-contact/poc/qr-scanner/`; legacy URLs redirect through a generated deployment artifact.


## Single Source of Truth and App Directory
- **Canonical code:** `apps/<app-id>/`. For QR Scanner: [`apps/vehicle-contact/poc/qr-scanner/index.html`](apps/vehicle-contact/poc/qr-scanner/index.html).
- **Canonical app listing and directory template:** [`portal/`](portal/README.md).
- **Published files:** Built only in disposable `_site/` by `node scripts/build-pages.mjs _site`, never committed to `docs/`.
- **Deployment:** GitHub Actions Pages workflow. Configure Settings → Pages → Source = GitHub Actions.
- **Directory URL:** https://idev006.github.io/MT-Agency-Super-App-Framework/ (subject to successful deployment).
