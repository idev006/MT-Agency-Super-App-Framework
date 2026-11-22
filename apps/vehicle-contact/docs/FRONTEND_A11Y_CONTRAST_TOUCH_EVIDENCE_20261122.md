# P6 Vehicle Contact — Semantic Contrast (WCAG AA) + Touch-Target Evidence

**Document ID:** P6VC-FE-QA-003

**Status:** SOURCE-REVIEW EVIDENCE (partial gate matrix; full sign-off pending)

**Date:** 2026-11-22 (Asia/Bangkok)

**Branch:** `codex/p6vc-a11y-contrast-touch-20261122` (off `main` `9f5a5e7`, after PR #120 merged)

**Directive:** Owner 2026-11-22 "อนุมัติทั้งหมด" — proceed with the app-wide contrast fix (task #61) and the mobile ≥44px touch policy. Engineering autonomy only; human compliance gates remain with the Owner.

**Related:** discovered defect recorded in [P13 density evidence §8](FRONTEND_UI_DENSITY_P13_EVIDENCE_20261122.md).

## 1. Evidence header

```text
Feature/page: shared design system (src/styles.css) — affects every page using DaisyUI semantic surfaces
Role and permission fixture: live dev admin (SYSTEM_ADMIN + REGISTRATION_ADMIN); registry vehicle.list
Commit SHA: <this slice>
Environment/URL: http://localhost:5173/#/app/vehicles/registry (vite dev → Cloudflare Worker → GAS v0.9.2)
Browser and OS: Qoder in-app browser (Chromium, contrast-color() supported), Windows 10.0.26300
Themes tested: all 35 approved themes (structural contrast probe); corporate authoritative axe
Viewports tested: 712x570 (in-app browser fixed; NOT resizable)
Reviewer: assistant (source + automated); second human visual/a11y review PENDING
Known exclusions: real-device touch NOT RUN; bitmap visual review NOT RUN (surface hidden); older-browser fallback NOT RUN
```

## 2. Problem (pre-existing, app-wide)

DaisyUI 5.8 semantic `*-content` tokens fall below WCAG 2.2 AA (4.5:1 for normal text) on their own color in several themes. A 35-theme × 8-token badge probe (oklch→luminance math) found **20 failing combos**:

| Token | Failing themes (ratio) |
|---|---|
| error | cupcake 4.12, bumblebee 3.54, retro 3.34, valentine 3.59, pastel 3.43, autumn 4.45, business 4.47, caramellatte 3.54 (8) |
| primary | dark 4.14, **corporate 4.23**, valentine 3.67, garden 4.15, winter 3.66 (5) |
| success | **corporate 3.36**, pastel 3.66, black 3.90 (3) |
| neutral | pastel 3.83, autumn 3.84 (2) |
| warning | retro 3.30, pastel 3.08 (2) |
| accent / info / secondary | none |

`corporate` is the **default** theme, so primary and success surfaces failed AA out of the box. Automated axe reports these as **incomplete** (not violations) because DaisyUI paints a `fractalNoise` SVG `background-image` over badges/buttons/alerts, blocking background-color detection. "axe 0 violations" therefore did **not** prove contrast compliance.

## 3. Fix (one design-system rule block, `src/styles.css`)

```css
:root[data-theme] {
  --color-primary-content: contrast-color(var(--color-primary));
  --color-secondary-content: contrast-color(var(--color-secondary));
  --color-accent-content: contrast-color(var(--color-accent));
  --color-neutral-content: contrast-color(var(--color-neutral));
  --color-info-content: contrast-color(var(--color-info));
  --color-success-content: contrast-color(var(--color-success));
  --color-warning-content: contrast-color(var(--color-warning));
  --color-error-content: contrast-color(var(--color-error));
}

@media (pointer: coarse) {
  .btn { min-height: 2.75rem; } /* 44px */
}
```

- **`contrast-color()`** (CSS Color 5) auto-selects black or white, whichever contrasts more with the semantic color. The worst case over all backgrounds is ≈4.58:1 (at background luminance 0.179), so it **guarantees ≥4.5:1 on every theme** without per-theme tuning. `:root[data-theme]` (specificity 0,2,0) overrides the DaisyUI theme tokens.
- **Progressive enhancement:** browsers without `contrast-color()` drop the declaration and keep the original DaisyUI token — no regression, but also no AA guarantee there (see §6 caveat).
- **Touch policy:** `@media (pointer: coarse)` targets touch devices only; desktop (`pointer: fine`) keeps the P13 compact density. Scoped to `.btn`, so the native sizing contract (`button,input,select,textarea` has no global `min-height`) is untouched.

## 4. Verification

| Check | Method | Result |
|---|---|---|
| All-theme contrast | 35 themes × 8 tokens badge probe, **real committed CSS** (no injection), oklch/rgb→luminance | **280 combos, 0 fail, 0 null, min 4.65:1** |
| Authoritative axe (corporate) | isolated probe, noise stripped, `axe.run(color-contrast)` | badge-success **6.37:1 PASS** (was 3.29 FAIL); btn-success 14.04:1 PASS |
| Live registry badge | computed style on real page @corporate | color `rgb(0,0,0)` on `#00a43b`, **6.25:1** (was white 3.36) |
| Page a11y | axe WCAG 2.0/2.1/2.2 A+AA on registry | **0 violations**, 27 passes, 1 incomplete (noise-masked contrast, now AA per probe) |
| Unit/contract tests | `npm test` (vitest) | **34 files / 192 tests PASS** (native-daisy + theme-contract intact) |
| Production build | `npm run build` (vite/Lightning CSS) | PASS; compiled CSS retains all 8 `contrast-color()` + `pointer:coarse` rules |
| SSOT validators | `validate-ssot.mjs` + `validate-usecase-ssot.mjs` | PASSED (0 errors; 56/56 UC operations) |
| Dependency audit (G8) | `npm audit` (prod + all) | **0 vulnerabilities** |
| Secret scan (G8) | `git grep` tracked files for dev password / private keys / hardcoded secrets | clean; `.env` + `.env.local` gitignored |

## 5. Visual trade-off (honest)

`contrast-color()` picks **pure black or white**. Where a token previously used a tinted near-white/near-black that failed AA, text flips to the opposite extreme. Example: corporate `badge-success` / `alert-success` text goes **white → black** (3.36 → 6.37); corporate `primary` text goes white → black (4.23 → ~4.96). This is the accessible outcome and is consistent across all pages. It is a visible design change — the Owner should visually accept it in PR review (bitmap review pending; in-app surface hidden). If a tinted look is preferred, the alternative is per-theme token darkening (larger effort, changes brand shades); not chosen here.

## 6. Browser-support caveat

`contrast-color()` is CSS Color 5 (Chromium 2025+; this in-app browser supports it, verified `CSS.supports('color','contrast-color(red)') === true`). On older browsers the declaration is ignored and the original DaisyUI tokens apply — i.e. the **current shipped behavior**, no regression, but AA is not guaranteed there. If the production audience requires AA on older browsers, a precomputed-token fallback is a follow-up decision (Owner).

## 7. Gate matrix (honest)

| Gate | Result | Note |
|---|---|---|
| G3 DaisyUI/theme | PARTIAL | theme-contract test PASS (35 themes unchanged); structural contrast verified all themes; bitmap multi-theme visual NOT RUN |
| G4 Responsive/touch | PARTIAL | `.btn` ≥44px on coarse pointers (CSS verified); real-device touch NOT RUN; desktop density preserved |
| G5 Typography | PASS | no type-size change; contrast fix only |
| G6 Accessibility | PARTIAL→ improved | semantic contrast now AA all themes (probe + axe); keyboard/focus/dialog manual re-check still PENDING |
| G8 Engineering | PASS | tests + build + validators + dependency audit + secret scan all green |
| G9 Visual review | PARTIAL | structural only; second human reviewer + bitmap PENDING |
| G10 Release | NOT RUN | deployment/publication is an Owner gate |

## 8. Best practice recorded

- **"axe 0 violations" ≠ contrast-safe.** DaisyUI noise/gradient `background-image` makes axe report `incomplete`, masking real AA failures. Re-probe colored surfaces in isolation with the texture stripped, or compute oklch→luminance, before claiming AA. (UI analogue of the Owner's "API said OK but read back the real data" rule.)
- **Fix token defects at the token, theme-agnostically.** `contrast-color()` guarantees ≥4.58:1 for any solid background and adapts per theme, avoiding 35×8 manual tuning and keeping all pages consistent.
- **Scope touch policies by pointer, not width.** `@media (pointer: coarse)` gives ≥44px on touch devices while preserving desktop density and the native sizing contract.

## 9. Owner / QA follow-ups (not self-approved)

1. Visual acceptance of auto-black/white semantic text (bitmap review on a visible/resizable browser; second human reviewer per DoD).
2. Real-device touch-target audit (coarse-pointer ≥44px) on phone/tablet.
3. Older-browser AA decision: accept progressive enhancement, or commission a precomputed-token fallback (§6).
4. Publication / G10 deployment evidence and PDPA/Security/UAT/Release sign-offs remain Owner-executed.