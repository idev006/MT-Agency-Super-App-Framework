# P6 Vehicle Contact — P13 Key-Message & Viewport-First Density Evidence

**Document ID:** P6VC-FE-QA-002

**Status:** SOURCE-REVIEW EVIDENCE (partial gate matrix; full sign-off pending)

**Date:** 2026-11-22 (Asia/Bangkok)

**Code commit:** `63ac42f` (branch `codex/p6vc-ui-density-p13-20261122`)

**Directive:** Owner 2026-11-22 — every page leads with a key message; minimize whole-page scroll; compact control/form footprint. Encoded as [P13](../FRONTEND_UI_UX_PRINCIPLES.md) and [G11](../FRONTEND_UI_COMPLIANCE_CHECKLIST.md).

## 1. Evidence header

```text
Feature/page: shared shell (PageTemplateComponent, OperationalContextStrip) + RegistrationReviewPage
Role and permission fixture: live dev admin holding SYSTEM_ADMIN + REGISTRATION_ADMIN (vehicle.registration.approve)
Commit SHA: 63ac42f
Environment/URL: http://localhost:5173/#/app/registrations/review (vite dev → Cloudflare Worker → GAS v0.9.2)
Browser and OS: Qoder in-app browser (Chromium), Windows 10.0.26300
Themes tested: corporate (light) only
Viewports tested: 950x570 (in-app browser fixed; NOT resizable)
Reviewer: assistant (source + automated); second human visual/a11y review PENDING
Review date (Asia/Bangkok): 2026-11-22
Known exclusions: 360px / 768px / 1280px / 1920px matrix NOT RUN; multi-theme visual NOT RUN; real-device touch NOT RUN
```

## 2. What changed (density without breaking accessibility)

- `PageTemplateComponent.vue`: content gap-6→gap-4; article space-y-8/p-4..8 → space-y-4/p-3..5; title text-xl/sm:text-2xl; breadcrumb+eyebrow text-sm (14px); **key message (description) kept text-base (16px)** at /80 opacity so it stays prominent (P13) and ≥G5 body minimum.
- `OperationalContextStrip.vue` + `styles.css`: `.operational-context .stat` padding 0.5rem 0.85rem; stat-title/desc 0.875rem (14px), stat-value 1rem (16px). Compact via padding, not sub-minimum type.
- `RegistrationReviewPage.vue`: reduced margins/padding/gaps (mt-5→mt-3, p-5→p-3, gap-4→gap-2, alerts py-2); detail panel `xl:max-h-[calc(100vh-13rem)] xl:overflow-y-auto` so long detail scrolls **inside** the panel at ≥1280px instead of stretching the page; hero capped `max-h-64` keeping `aspect-[4/3]`; checkbox label keeps `min-h-11` (44px touch); primary actions stay native `btn`.
- Accessibility fix: thumbnail buttons previously used `aria-label="ดูภาพ…"` which axe flagged `label-content-name-mismatch` (serious). Moved the prefix to an in-button `sr-only` span so the accessible name derives from content and includes the visible caption. `aria-pressed` + `work.selectPhoto` retained.
- Typography guard: no body text <16px and no label <14px introduced; an accidental `.route-mini` font bump was reverted to keep the diff scoped.

## 3. Verification run

| Check | Command / method | Result |
|---|---|---|
| Unit/contract tests | `npm test` (vitest) | 34 files / 192 tests PASS |
| Production build | `npm run build` (vite) | PASS (175 modules) |
| Native DaisyUI sizing contract | `tests/native-daisy-components.test.js` | PASS (no global min-height; no .form-control override; .field-stack present) |
| Automated a11y (WCAG 2.0/2.1/2.2 A+AA) | axe-core 4.14.1 in page, corporate theme | **0 violations** (31 passes) after thumbnail fix; was 1 serious (5 nodes) before |
| Horizontal overflow @950 | `document.documentElement.scrollWidth > innerWidth` | false |
| Key message size | computed style of description | 16px |
| Field label size | computed style of `dl dt` | 14px |
| Golden path G7 | live: inspect → detail+5 photos; approve disabled until checkbox; checkbox→approve enabled | PASS |
| Correct-empty copy | live empty-state explains queue shows only PENDING_APPROVAL | PASS |

Screenshots (950x570): [full page](evidence/ui-density-p13-20261122/review-detail-fullpage-950x570.png), [viewport](evidence/ui-density-p13-20261122/review-detail-viewport-950x570.png). The full-page image shows the sticky app header once mid-capture (a fullPage+fixed stitching artifact); the viewport image confirms no real overlap.

## 4. Gate matrix (honest)

| Gate | Result | Evidence / note |
|---|---|---|
| G1 User task/content | PASS | key message + Thai copy + correct-empty explanation (live) |
| G2 Authority/privacy | PASS | session-derived roles; GAS re-authorizes; photos memory-only; no secrets in UI |
| G3 DaisyUI/theme | PARTIAL | structural theme-contract test PASS; multi-theme visual NOT RUN |
| G4 Responsive | PARTIAL | no h-overflow @950; checkbox touch 44px kept; 360px matrix NOT RUN; default `btn`≈40px pre-existing (see follow-up) |
| G5 Typography/hierarchy | PASS | measured body 16px / label 14px; hierarchy title>section>body>meta |
| G6 Accessibility | PARTIAL | axe 0 critical/serious @corporate; keyboard/focus/dialog + reduced-motion manual re-check PENDING |
| G7 Interaction/state | PASS | double-submit guard; approve gated; uncertain=no-retry; live checkbox→enable |
| G8 Engineering | PARTIAL | tests+build PASS; dependency audit / secret scan not re-run this slice |
| G9 Visual review | PARTIAL | screenshots @950 only; full viewport matrix + second reviewer PENDING |
| G10 Release | NOT RUN | deployment gate; this is a source slice |
| G11 Key message/density | PASS | key message prominent; xl internal panel scroll; compact token-based spacing |

## 5. Best practice recorded

- **Reduce whitespace, not accessibility.** Density must come from margin/padding/gap and internal panel scroll; never from shrinking body <16px, labels <14px, or touch <44px. Encode the constraint in the principle (P13) so future pages inherit it.
- **Accessible name from content beats aria-label override** for buttons that already show a caption: an `sr-only` prefix keeps the name descriptive AND satisfies `label-content-name-mismatch`.
- **Correct-empty vs broken-empty:** an empty queue is only a defect if persisted PENDING rows exist; always read back the store before "fixing" an empty state (see [system audit](../SYSTEM_AUDIT_EMPTY_REVIEW_QUEUE_20261121.md)).

## 6. Owner / QA follow-ups (not self-approved)

1. Full viewport matrix (360/768/1280/1920) + multi-theme visual review on a resizable browser or real device; the in-app browser is fixed at 950x570.
2. Real-device touch-target audit: default DaisyUI `btn`≈40px and `btn-sm`≈32px are pre-existing app-wide; decide a mobile ≥44px policy (scoped CSS) before claiming G4 PASS on mobile.
3. Second human visual/accessibility reviewer per DoD (developer must not sole-approve).
4. Re-run dependency audit + secret scan for G8 before merge.
5. G10 deployment evidence + production/real-data approval remain separate owner gates.