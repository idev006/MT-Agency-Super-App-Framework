# Frontend-to-GAS POC Evidence — 2026-11-18

## Scope

Vue 3 + Vite SPA เพื่อพิสูจน์ browser → Cloudflare Worker → GAS Web App รวม Sign in, session และ role-based dashboard

## Environment

- Frontend origin: `http://127.0.0.1:5173`
- Browser: Brave on Windows
- Operations: `system.health`, `auth.login`, `auth.session`
- Transport: HTTPS POST ผ่าน Worker `/api/frontend`
- Worker target: `https://p6vc-api-test-console.thaipoliceregion6.workers.dev/api/frontend`

## Evidence

| Check | Result | Evidence |
|---|---|---|
| Vue SPA renders | PASS | Thai responsive shell, daisyUI theme selector and GAS connection form visible |
| Endpoint validation | PASS | Accepts only `https://script.google.com/macros/s/.../exec` |
| Browser direct POST | FAIL | Direct GAS chain remains unsuitable for this browser POC |
| Worker CORS preflight | PASS | HTTP 204 and exact `Access-Control-Allow-Origin` for local origin |
| Worker `system.health` | PASS | HTTP 200 canonical envelope; service status `bootstrap` |
| Worker Sign in | PASS | Browser completed `auth.login` and `auth.session` |
| Role-based dashboard | PASS | Dashboard rendered with active session and `SYSTEM_ADMIN` menu |
| Frontend tests | PASS | 11/11 Vitest tests |
| Worker contract tests | PASS | 23/23 Node tests |
| Production build | PASS | Vite build with daisyUI 5.8.1 |

Initial Worker-mode browser attempts returned `NETWORK_ERROR` although server-side calls passed. Browser console evidence isolated the client defect as `TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation`. The API client had stored native `window.fetch` as an object method, changing its receiver. Binding the injected fetch implementation to `globalThis` fixed the browser path while retaining test injection.

## Decision gate

**Worker-mode frontend integration: PASS for the tested local origin.** Direct browser-to-GAS remains FAIL and is not the selected deployment architecture.

Remaining release gates:

1. Merge the feature branch so the existing Pages workflow publishes the SPA under the repository subpath.
2. Repeat `system.health`, `auth.login`, `auth.session` and `auth.logout` from the GitHub Pages origin.
3. Record GitHub Pages-origin evidence separately before enabling vehicle/contact operations.
4. Add rate limiting/Cloudflare Access and approve the production ingress model before real data.

## SPA shell extension

The next POC increment added Vue Router nested layouts, Pinia session/UI stores, Sign in, session restore, role-derived dashboard menus, explicit Sign out confirmation and Direct/Worker transport selection.

- Frontend unit tests: 11/11 PASS
- Frontend production build: PASS
- Cloudflare Worker tests including `/api/frontend`: 23/23 PASS
- Browser route guard: PASS; unauthenticated root route redirected to `#/signin?redirect=/app/dashboard`
- Live Worker deployment/browser authentication: PASS on development credentials; no credential or session token recorded in this evidence
