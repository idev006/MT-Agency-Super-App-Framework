# Decisions & Open Questions

## Recorded decisions
- **D-001 (2026-10-30):** This repository is the documentation SSOT for MT Agency Super App Framework. **Status: user-designated**.
- **D-002:** One-login multi-app goal, independent per-app roles, permissions and scopes. **Status: architecture requirement**.
- **D-003:** Vehicle QR is first reference application. **Status: proposed sequence**.

## Proposed, not yet approved
- **P-001:** Supabase Auth/PostgreSQL/RLS/Edge Functions as platform core.
- **P-002:** React/TypeScript shared Super App Shell and Web/PWA + LINE MINI App access.
- **P-003:** GAS/Google Sheets restricted to non-authoritative integration/reporting.
- **P-004:** Modular monolith for MVP; explicit contract for external apps.

## Open questions
- Official platform/app owners and approval authorities.
- Identity proofing/onboarding for agency personnel and external visitors.
- LINE login bridge POC and session behavior across webviews/browsers.
- Hosting, domain, data residency, retention, backup and security approval.
- Who may define high-risk permissions, approve grants, and administer organization scopes.

## Documentation policy
Decisions become binding only when explicitly approved and committed with status updated. No production readiness is implied by these documents.
