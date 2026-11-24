# P6VC — Frontend redesign R6 (P3 findings + frequently used pages)

**Date:** 2026-11-24 · **Frontend:** 0.8.5 → 0.8.6 · **Backend:** 0.9.14 → 0.9.15 (campaign order)
Follows [INTEGRATION_E2E_UI_SSOT_EVIDENCE_20261124.md](INTEGRATION_E2E_UI_SSOT_EVIDENCE_20261124.md) §4 (P3).

## 1. Changes

| Area | Change |
|---|---|
| Mobile context strip | On phones (< md) it is one folded line ("role · valid until HH:MM น.") that expands for connection and session details. Tablet and desktop keep the full strip. Before, it took about 1/3 of the first screen on every page. |
| Header | Shows the user's role instead of the technical user id. |
| Dashboard | The home page itself and the developer connection check are no longer listed as work items. They stay in the side menu. |
| Sign-in | States that sessions are per tab: a new tab needs a new sign-in. |
| Campaigns | `campaigns.list` returns **newest first** (backend 0.9.15), so a new campaign is on page 1. |
| **My Vehicles (owner)** | **Defect fixed:** the change form was pre-filled with the current brand, model and colour, and every request **re-sent those unchanged values** as "changes". The form now starts empty, shows current values as placeholders, and sends only fields that differ from the current ones. Other changes: Thai phone input is converted to E.164 with an inline error; plate-style list with province names; no raw ids shown; the detail scrolls into view on phones. |
| **QR management** | It asked for the raw 64-character vehicle id, which made it unusable in practice. It now **finds the vehicle by plate and province** (or opens from the vehicle detail page with `?vehicleId=`), shows the vehicle, and explains each action (issue / replace / revoke). The one-time QR token gets a copy button and the leave guard. |
| Vehicle detail | Adds a "จัดการ QR" link for `qr.manage`. |
| Vehicle registry | Shows province names. Low-contrast text was raised to /80. |

## 2. Verification

| Check | Result |
|---|---|
| FE vitest | 40 files / **236 PASS** (new `r6-pages.test.js`, 9 tests) |
| FE build | PASS |
| BE `npm run check` | EXIT 0 (new `ACTOR-R6` newest-first test) |
| Browser at 375 px (preview session, stubbed backend for the QR "found" state) | dashboard: context collapsed to 1 line, no self/dev cards; QR page: search form → vehicle card (กข1234 · พิษณุโลก, ขาว) → 3 explained actions; no horizontal overflow |
| axe WCAG A/AA (corporate) | dashboard **0** · QR page (empty) **0** · QR page (vehicle found) **0** |

## 3. Not done (needs a decision or is a separate slice)

- **Campaign name:** needs a schema change (`database.schema.json` column + migration). This is a governed change, so it is kept separate.
- **Theme list:** about 15/35 DaisyUI themes fail AA for faded text. Owner decision pending on which themes to keep.
- Users & roles, organisations, settings, audit, account security, retention and the connection page are **functional but not redesigned yet**.
- Re-seed the DEV vehicles with reference codes. `reset-dev-data.mjs` uses `TH-10` / `SEDAN` / `PRIVATE`, which the UI cannot search for or label.
