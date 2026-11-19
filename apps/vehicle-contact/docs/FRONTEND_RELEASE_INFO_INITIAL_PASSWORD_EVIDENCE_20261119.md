# P6 Vehicle Contact — Release Info, Initial Password UX and Synthetic Bootstrap Evidence

Date: 2026-11-19 (Asia/Bangkok)  
Branch: `codex/p6vc-release-info-seed-20261119`

## Observed defect and root cause

- The active sidebar label used only a minimum height; explicit flex cross-axis alignment was missing. The narrow active item could therefore render its text against the top edge.
- Live authenticated acceptance reported `mustChangePassword=true` for the initial administrator.
- GAS intentionally rejects protected operations with `PASSWORD_CHANGE_REQUIRED` until that password is changed. This single policy explains the simultaneous settings, campaigns, organizations and users load failures in the supplied captures.
- Empty Sheets data is not treated as this error. After password policy clearance, list operations return an array and the frontend renders its empty state.

## Delivered behavior

- Every sidebar link uses native Tailwind flex alignment: `flex min-h-11 items-center`.
- An initial-password session is routed to Account Security and sees only that permitted menu item.
- Account Security explains that reads and writes remain suspended until password change, instead of allowing repeated feature-level failures.
- Footer reports frontend package version plus server-reported API and backend service versions.
- Public `system.health` reports `status=ready`, `apiVersion=v1`, `backendVersion=0.3.0` and `releaseChannel=development`.
- The consolidated live-acceptance workflow includes a guarded `bootstrap-system-admin-records` mode. It uses the existing GitHub login secret, fails closed while password change is required, creates only missing synthetic settings/organization/campaign records, never logs a session token or campaign token, and logs out in `finally`.

## Automated evidence

| Gate | Result | Evidence |
|---|---|---|
| Frontend unit/contract | PASS | `npm test`: 22 files, 92 tests passed |
| Frontend production build | PASS | `npm run build`: Vite 8.3.8 build completed |
| GAS build | PASS | `npm run build`: 49 `.gs` modules + manifest; no deployment |
| GAS full regression | PASS | `npm test`: contract, RBAC 5×44, compiled VM auth 19/19, lifecycle 21/21 and synthetic bootstrap 3/3 passed |
| Worker regression | PASS | `node --test tools/p6vc-api-test-console/worker.test.mjs`: 24/24 passed |
| Desktop dark + mobile corporate | PASS | 8 pages × 2 viewports/themes; 16 cases |
| axe-core | PASS | 0 violations |
| Horizontal overflow | PASS | 0 cases |
| Refresh/navigation evidence | PASS | `refreshFailed=false`, `navigationFailed=false` |

Browser results and screenshots: [evidence/fe-release-info-initial-password-20261119](evidence/fe-release-info-initial-password-20261119/).

## Release boundary

- Repository changes and tests do not publish GAS or GitHub Pages by themselves.
- The synthetic bootstrap has not been executed against live data in this evidence run.
- Before live bootstrap, the owner must change the initial administrator password and update the `P6VC_HTTP_LOGIN_PASSWORD` GitHub Secret. The manual workflow will otherwise stop at `PASSWORD_CHANGE_REQUIRED` without creating records.
- GAS source push still requires exact confirmation `PUSH_VEHICLE_GAS`; Web App publication remains a separate owner action.
