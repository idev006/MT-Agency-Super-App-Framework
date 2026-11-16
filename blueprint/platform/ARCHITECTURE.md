# Architecture Baseline — Proposed v0.1

## Logical layers
1. **Clients**: Responsive Web/PWA, LINE MINI App / LIFF entry point.
2. **Super App Shell**: authenticated home, My Apps, routing, profile, common UI.
3. **Identity**: Supabase Auth; organization-approved account mapping and optional LINE identity linking.
4. **Central authorization**: application access, roles, permissions, scoped role assignments, policy decisions.
5. **Enforcement**: app APIs/Edge Functions and PostgreSQL RLS enforce every protected operation.
6. **Domain modules**: Vehicle QR (first), Meeting Room (integration proof), future apps.
7. **Optional integrations**: GAS / Google Sheets for imports, reporting and automation; never trusted as authority for rights.

## Delivery pattern
Prefer a **modular monolith / shared shell** for MVP, with explicit module boundaries and typed APIs. Integrations for separately deployed apps must use standards-based OIDC/OAuth flows and secure token validation. A link in the app registry alone does not implement SSO.

## Trust and deployment boundaries
- GitHub Pages is static client hosting, **not a secure secrets store or backend**.
- Browser client may use publishable Supabase keys with RLS; NEVER expose service role/secret keys.
- High-risk mutations use protected server endpoints and auditable authorization checks.
- Browser camera functionality requires HTTPS, permission, and real device testing.
- Browser and LINE webview do not necessarily share session cookies; SSO semantics must be validated per context.
- Avoid putting raw long-lived authentication tokens in URLs, logs, or QR stickers.
- Public repository: never commit real personnel or vehicle data.

## Vehicle QR
Opaque unpredictable identifier resolves to vehicle metadata only after access control. Compare plate, type, make, model, color and registered vehicle photo with actual vehicle. A copied QR does not prove physical identity; human confirmation and incident workflow remain required.

## Architecture decisions pending validation
- Confirm LINE identity-to-Supabase login bridge and supported provider configuration.
- Select hosting/domain and production compliance controls.
- Confirm security review for personal-data processing and retention.
- Confirm governance and approval workflows for elevated roles.
