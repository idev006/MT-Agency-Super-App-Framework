# FE-REFERENCE-CATALOG-01 evidence — 2026-11-20

## Scope

Registration reference data is wired as one bounded vertical slice:

`GAS references.registration -> Cloudflare Worker allowlist -> frontend repository -> Pinia/session cache -> assisted registration form -> registrations.submit referenceVersion`

The slice uses the existing AppShell, PageTemplate and OperationalContextStrip. It adds no DaisyUI namespace overrides and no feature-specific CSS.

## Observed runtime facts

- GAS source push workflow [44701663467](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44701663467) passed and created Apps Script source Version 22 from main commit `cf2e7771df1482e0dfce887724a27e165ee23abb`.
- The Project Owner reported publishing the new Web App deployment.
- Independent unauthenticated live GET and POST checks returned `status=ready`, `apiVersion=v1`, `backendVersion=0.5.0`.
- A live anonymous request to `references.registration` returned `UNAUTHENTICATED`, confirming the new route is published and fail-closed.
- No authenticated catalog values or personal/business records were captured in this evidence.

## Frontend behavior

- Frontend source version is `0.6.0`.
- The protected catalog is loaded after a verified sign-in when the user has access to the registration workspace.
- Pinia memory plus `sessionStorage` reuses the catalog across refresh without another reference request.
- Cache context includes user, transport and endpoint; logout, session removal or a context change prevents cross-context reuse.
- Load failure keeps the authenticated session but blocks the dependent form with an explicit retry.
- `LEGACY` is shown explicitly and preserves the old text-entry form without sending `referenceVersion`.
- `ADVISORY` and `ENFORCED` use canonical codes for province, plate type, vehicle type, relationship and organization, and send the catalog version.
- Native DaisyUI selects are used for short lists. Searchable keyboard-accessible comboboxes are used for brand and organization; model options depend on the selected brand.
- A stale catalog response requires an explicit reload/review/re-submit; the frontend never automatically repeats the write.

## Verification gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Frontend unit/contract suite | PASS | 28 files, 133/133 tests |
| Frontend production build | PASS | 125 modules; JS 309.50 kB / 87.93 kB gzip |
| Frontend dependency audit | PASS | 0 vulnerabilities |
| Worker contract/security suite | PASS | 28/28 tests |
| Repository SSOT | PASS | 0 errors / 0 link warnings |
| Use-case SSOT | PASS | 20 diagrams; 51/51 operations |
| Desktop dark browser evidence | PASS | Edge headless, 1440x900, axe 0 violations, no horizontal overflow |
| Mobile corporate browser evidence | PASS | Edge headless, 360x800, axe 0 violations, no horizontal overflow |
| Real approved reference dataset | BLOCKED | Data Owner-approved values have not been supplied or seeded |
| Authenticated live catalog content | NOT RUN | Avoided reading internal data before the migration/data approval gate |
| Worker deployment | PASS | Version `277b4d77-dbe4-49f9-98a5-91405a1a1fe3`; text bindings declared in `wrangler.toml` |
| Frontend Pages deployment | NOT RUN | Merge/deploy follows Worker compatibility deployment |

Browser artifacts: [evidence/fe-reference-catalog-20261120](evidence/fe-reference-catalog-20261120/).

## Residual risk and next gates

- The live spreadsheet may not yet contain `vc_reference_values`; in that case GAS intentionally returns `LEGACY` and the UI labels the fallback.
- Real province, plate, vehicle, make/model, color and relationship data must not be guessed. A named Data Owner must approve the dataset before migration/seed and before enabling `ENFORCED`.
- Worker deployment is backward compatible, but the frontend must not be released through the Worker path until that deployment is verified.
- Public/anonymous catalog access remains out of scope; only authenticated assisted intake receives the protected catalog.

## Worker deployment recovery evidence

Two initial uploads omitted version-bound text variables and returned `GATEWAY_NOT_CONFIGURED`. Each was immediately rolled back to the last working version. No business request reached GAS during those failed probes. The non-secret bindings were then made explicit in `wrangler.toml`; passwords and access keys were not added. Final version `277b4d77-dbe4-49f9-98a5-91405a1a1fe3` passed:

- public health through Worker: HTTP 200, `ok=true`, Backend `0.5.0`;
- protected reference request with a synthetic 64-character token: HTTP 200 logical `UNAUTHENTICATED` with matching request ID;
- no authenticated catalog content and no write operation executed.
