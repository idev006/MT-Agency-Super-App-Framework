# P6 Vehicle Contact — Brand Catalog and Custom Entry Evidence

**Date:** 2026-11-21 (Asia/Bangkok)
**Candidates:** Backend `0.7.0`, Frontend `0.7.0`, API `v1`

## Delivered contract

- `BRAND` contains 524 unique nonblank values observed in Department of Land Transport first-registration open data: annual 2565–2568 plus January–February 2569.
- “ไม่ระบุ” is excluded. Codes are deterministic normalized identifiers; DLT labels remain visible.
- “ไม่พบยี่ห้อ? ระบุเอง” changes the same field to a required bounded free-text input. The human-entered value is submitted, not a sentinel.
- Model remains required free text. Brand remains advisory and custom values pass strict reference mode.
- Native DaisyUI/Tailwind controls are reused; no feature CSS or DaisyUI namespace override is added.

## Gates

| Gate | Status |
|---|---|
| Manifest 645 rows / 524 brands | PASS — focused Backend 11/11 |
| Custom/preset brand mapping | PASS — focused Frontend 6/6 |
| Frontend regression/build/audit | PASS — 134/134; Vite build; 0 vulnerabilities |
| GAS build | PASS — 53 modules plus manifest; largest generated module 727 lines |
| Mobile/desktop, corporate/dark | PASS — 3 browser cases; 0 axe violations; 0 horizontal overflow |
| Full Backend regression | PASS — `npm test`, including compiled GAS VM acceptance |
| GitHub CI | PENDING |
| GAS source push / Web App publication / seed apply | NOT RUN |

Browser evidence is stored in `docs/evidence/fe-brand-catalog-20261121/`. Axe color-contrast checks reported as incomplete still require manual review and are not represented as automated violations.

## Source

[Department of Land Transport first-registration dataset](https://data.go.th/th/dataset/stat_1_1_01_first_regis_vehicles_car), public Open Data Common source. Extraction is deterministic from the six published resources named above; blank and “ไม่ระบุ” values are excluded.
