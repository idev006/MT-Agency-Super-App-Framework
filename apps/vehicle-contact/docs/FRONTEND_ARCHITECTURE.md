# P6 Vehicle Contact Frontend Architecture

> **Current state (2026-11-28):** the Cloudflare Worker sections below are history — the Worker was retired and deleted (VC-ADR-056 W1). The web app calls p6vc-core `/api/frontend` directly, configured by `VITE_CORE_API_URL` (+ `VITE_BASE_PATH`). Current status: [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md).

> **CURRENT HANDOFF (2026-11-22) — ARCHITECTURE/DESIGN REFERENCE.** The approved boundaries and composition guidance below are preserved; POC routes, allowlists and the 2026-11-18 acceptance section are historical, not the current runtime or frontend inventory. Defer current status and implementation structure to [Current Delivery Status](CURRENT_DELIVERY_STATUS.md), [Delivery Execution Plan](PROJECT_MANAGEMENT_PLAN_20261121.md), [Live API Automation](LIVE_API_AUTOMATION.md), and [Code Map](CODE_MAP_20261121.md). Do not resume the old POC as missing work.

Status: Vue SPA POC, Cloudflare `/api/frontend` and GitHub Pages deployment implemented and verified on 2026-11-18.

UI governance for every subsequent page is defined by:

- [Frontend Engineering Standard](FRONTEND_ENGINEERING_STANDARD.md)
- [Component Architecture and Design Patterns](FRONTEND_COMPONENT_ARCHITECTURE_PATTERNS.md)
- [UI/UX Principles](FRONTEND_UI_UX_PRINCIPLES.md)
- [Design System Blueprint](FRONTEND_DESIGN_SYSTEM_BLUEPRINT.md)
- [UI Compliance Checklist](FRONTEND_UI_COMPLIANCE_CHECKLIST.md)
- [Role Delivery Blueprint](FRONTEND_ROLE_DELIVERY_BLUEPRINT.md)
- [Frontend Reference Register](FRONTEND_REFERENCE_REGISTER.md)

## Runtime shape

```text
GitHub Pages / local Vite preview
└─ Vue SPA
   ├─ Direct mode ────────────────────────────────> GAS /exec
   └─ Worker mode ──> Cloudflare /api/frontend ──> GAS /exec
```

Both modes send the same logical envelope:

```json
{"apiVersion":"v1","group":"auth","action":"session","payload":{},"requestId":"...","sessionToken":"..."}
```

GAS remains the source of truth for identity, session status, roles, permissions, business rules and data. Cloudflare is a transport boundary/BFF, not a second business backend.

## Component composition

```text
App.vue
└─ RouterView
   ├─ SignInView
   │  ├─ ThemePicker
   │  └─ SignInForm
   │     └─ TransportSelector
   └─ AppShell
      ├─ AppHeader
      ├─ AppSidebar
      ├─ Main RouterView
      │  ├─ DashboardView
      │  │  └─ PageTemplateComponent
      │  │     └─ RoleMenuGrid
      │  └─ GatewayPocView
      │     └─ PageTemplateComponent
      │        ├─ default slot: route visualization
      │        └─ aside slot: TransportSelector
      ├─ AppFooter
      └─ ConfirmDialog
```

`AppShell` owns the persistent application chrome. Child routes replace only the main content through nested `RouterView`. Each routed PageComponent may use `PageTemplateComponent` as its page-level skeleton and fill named slots: `breadcrumbs`, `actions`, `status`, default content, `aside` and `footer`. Page components retain page-specific data/orchestration; the template remains presentation-only and does not call stores or APIs.

## State and SSOT boundaries

| State | Owner | Persistence | Rule |
|---|---|---|---|
| Users, roles, permissions, session validity | GAS | Server datastore | Authoritative |
| Session token | Pinia session store | `sessionStorage` per tab | Revalidated through `auth.session` |
| Role-driven menu | Pinia computed state | None | Derived from GAS roles and menu catalog |
| API transport selection | Pinia session store | `localStorage` | Non-sensitive preference |
| Theme and mobile navigation | Pinia UI store | Theme only in `localStorage` | UI-only global state |
| Sign-in field visibility/dialog state | Component `ref/reactive` | None | Local presentation state |
| Remembered username | Browser storage | `localStorage` after opt-in | POC convenience |
| Remembered password | Browser storage | `localStorage` after explicit opt-in | POC only; forbidden for production design |

Vue route metadata and menu filtering improve UX only. Every protected GAS operation must independently validate the session and role.

## Cloudflare Worker boundary

The POC route is `POST /api/frontend` with `OPTIONS` preflight support.

- GAS URL comes only from Worker variable `P6VC_GAS_EXEC_URL`.
- Browser cannot select an upstream URL.
- Initial allowlist: `system.health`, `auth.login`, `auth.session`, `auth.logout`.
- `FRONTEND_ALLOWED_ORIGINS` controls browser origins.
- No `BRIDGE_ACCESS_KEY` is shipped to the SPA.
- Existing test-console/job endpoints remain protected by their Bearer key and keep their separate response-redaction rules.

Origin allowlisting is not user authentication. Before production, add rate limiting, trusted ingress design, operational logs without credentials, incident controls and a formal review before expanding the operation allowlist.

## Routing

| Route | Component | Access |
|---|---|---|
| `#/signin` | `SignInView` | Public |
| `#/app/dashboard` | `DashboardView` inside `AppShell` | Valid GAS session |
| `#/app/connection` | `GatewayPocView` inside `AppShell` | Valid GAS session |

Hash history is intentional for GitHub Pages because it avoids server rewrite requirements. The global guard restores a session from `sessionStorage` through `auth.session`; invalid sessions return to Sign in.

## Current acceptance status

- Vue Composition API/component build: PASS
- Pinia global state and role menu unit tests: PASS
- Vue Router authentication guard browser check: PASS
- Direct local browser to GAS: FAIL; not selected as the deployment architecture
- Worker gateway unit/contract tests: PASS
- Live Cloudflare deployment and local browser login: PASS
- GitHub Pages deployment, assets, Pages-origin CORS and health: PASS
- Authenticated browser acceptance from the published GitHub Pages origin: NOT RUN
