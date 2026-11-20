# REFERENCE-CATALOG-BACKEND-01 evidence — 2026-11-20

## Scope

This source-only slice adds the backend contract for registration reference data. It does not migrate a spreadsheet, seed business data, push Apps Script source, publish a Web App deployment, change the Cloudflare Worker, or deploy the frontend.

## Observed source facts

- Canonical schema draft: `0.3.0-draft`, 25 tables, including normalized `vc_reference_values`.
- Backend source version: `0.5.0`; API remains `v1`.
- New protected operation: `references.registration`.
- Required permission: `vehicle.registration.approve`.
- Response is bounded, deterministic and versioned. Only active reference values and active organizations are returned.
- Organizations remain authoritative in `vc_organizations`; they are not copied into `vc_reference_values`.
- Rollout modes are `LEGACY`, `ADVISORY` and `ENFORCED`. Missing or incomplete reference data fails back to `LEGACY`; the source does not enable enforcement automatically.
- Registration validation executes before campaign lookup or business-data writes.

## Verification

| Gate | Result | Evidence |
| --- | --- | --- |
| GAS build and full regression | PASS | `npm run check`, exit 0; 51 generated GAS modules |
| Reference catalog unit/contract tests | PASS | 5/5, including active filtering, bounds, duplicates, formula-like values, model parent, stable version, stale version, invalid code/organization, and zero writes on rejection |
| Authorization matrix | PASS | 5 roles x 45 protected operations = 225 checks |
| Compiled GAS VM | PASS | authentication 19/19 and lifecycle 21/21 |
| Owner development runner | PASS | 5/5 |
| Diff whitespace check | PASS | `git diff --check`, exit 0; Windows line-ending warning only |
| Live deployment | NOT RUN | exact owner authorization `PUSH_VEHICLE_GAS` was not provided for this slice |
| Real catalog data | BLOCKED | requires a Data Owner-approved dataset; no province, plate, vehicle, make/model, color or relationship values were guessed |

## Safety and rollout

- The additive migration executor may propose/create the new table only when separately invoked through the existing guarded migration process.
- Default `ADVISORY` behavior preserves legacy clients that omit `referenceVersion`.
- `ENFORCED` must not be enabled until the approved catalog is loaded and Worker/frontend compatibility is deployed and verified.
- The public campaign registration path needs an explicit product decision before any unauthenticated client is required to obtain a catalog version.
- Historical inactive values may remain stored, but they are excluded from options for new submissions.

## Compliance assessment

This slice defines technical structure and validation; it does not assert a legal taxonomy or import personal data. Applicable privacy, retention and lawful-processing decisions remain governed by the existing project compliance SSOT. Residual risk is that unapproved list content could misclassify a registration; the control is Data Owner approval plus a separate migration/deployment gate. Owner: Project Owner / designated Data Owner. Human approval remains required before seeding or enabling enforcement.

## Downstream work

1. Add the protected operation and optional `referenceVersion` to the Cloudflare Worker allowlist/contract tests.
2. Implement the frontend one-load-per-sign-in cache and responsive select/combobox controls.
3. Obtain and review the authoritative catalog dataset.
4. Run the guarded Sheet migration, GAS push/publish, Worker deployment and end-to-end acceptance as separate explicit gates.
