# MT Agency Super App Framework

> **Project status:** Architecture baseline (proposed) — not yet approved for production.

ระบบแพลตฟอร์มกลางสำหรับแอปพลิเคชันของตำรวจภูธรภาค 6 โดยตั้งเป้าหมายให้ผู้ใช้ **เข้าสู่ระบบครั้งเดียว** และใช้แอปที่ได้รับอนุญาตได้ โดยแต่ละแอปมีบทบาท (Roles), สิทธิ์ (Permissions) และขอบเขตข้อมูล (Scopes) เป็นของตัวเอง

## Source of Truth

**This GitHub repository is the Single Source of Truth (SSOT) for project documentation.** Decisions, changes, acceptance criteria, and architecture must be version-controlled here. Chats and generated summaries are working material until committed here.

## Start here

- **[MASTER BLUEPRINT — primary project design reference](docs/MASTER_BLUEPRINT.md)** (v1.0.0-draft; proposed, not approved for production)
- [Project Charter](docs/PROJECT_CHARTER.md)
- [Architecture Baseline](docs/ARCHITECTURE.md)
- [Authorization Model](docs/AUTHORIZATION.md)
- [App Onboarding Contract](docs/APP_ONBOARDING.md)
- [Decisions and Open Questions](docs/DECISIONS.md)

## Target stack (proposed)

- Frontend: React + TypeScript; GitHub repository / HTTPS hosting (evaluate GitHub Pages against organizational security requirements)
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

## First reference application

**Vehicle QR** — register vehicles; issue opaque QR identifiers; verify plate, make, model, color, registered person and parking permissions. Android/iOS camera selection is a required proof-of-concept item.

## Change control

Update architecture docs via Git commits / Pull Requests. Mark proposals as proposed until explicitly accepted. Do not treat the current documents as deployed or security-certified.
