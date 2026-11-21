# P6 Vehicle Contact — Synthetic Registration E2E Evidence (10 submissions)

**Date:** 2026-11-21 (Asia/Bangkok), run 08:22–08:29 local (01:22–01:29 UTC)
**Chain:** automation script -> Cloudflare Worker (`p6vc-api-test-console.thaipoliceregion6.workers.dev`) -> live GAS Web App (Version 26 / Backend `0.7.0` at run time)
**Authorization:** Project Owner explicitly instructed API-driven campaign creation and 10 synthetic registrations using the out-of-band DEV administrator credential. Credential used in memory only; never written to source, scripts, logs, docs or issues.
**Data classification:** 100% synthetic — generated plates `ฑฆ 9901`–`ฑฆ 9910`, synthetic contact names, synthetic E.164 numbers `+668100001xx`, generated 16×16 solid-color PNGs (5 slots per vehicle). No real PII, no real vehicle data.

## Executed operations (all through the Worker allowlist)

| Step | Operation | Result |
|---|---|---|
| 1 | `auth.login` (admin, DEV) | PASS; `mustChangePassword:false`; session kept in memory |
| 2 | `organizations.list` | PASS; one ACTIVE organization used |
| 3 | `references.registration` | **`ADVISORY` with seeded catalog live: 77 provinces, 524 brands, 16 colors, 17 vehicle types** — first live proof the applied seed is served end-to-end |
| 4 | `campaigns.create` (maxSubmissions 10, 7-day window) | PASS; campaignId `b2d8617ccf7796aa9d1f8653e16b1c66656e591a65a9cfcc3ad950de67862165` |
| 5 | `campaigns.validate` (public) | `valid:true` |
| 6 | `photos.upload` ×50 (public, 5 slots × 10 vehicles) | PASS; all staged |
| 7 | `registrations.submit` ×10 (public, canonical seed codes + `referenceVersion`) | **10/10 `PENDING_APPROVAL`** |
| 8 | Idempotent replay of submission 1 (same payload + idempotencyKey) | PASS — identical requestId returned, no duplicate |
| 9 | `registrations.listPending` `{page:1,pageSize:100}` | PASS — `total:10`, all 10 requestIds visible, all `PENDING_APPROVAL` |
| 10 | `auth.logout` | PASS (verification session) |

Canonical values used: plateType `STANDARD`, vehicleType `RY01`, relationship `OWNER`, provinces 10/50/30/40/20/11/12/13/14/15, brands TOYOTA/HONDA/ISUZU/MITSUBISHI/NISSAN/MAZDA/FORD/MG/BYD/SUZUKI, colors WHITE/BLACK/GRAY/SILVER/RED/BLUE/GREEN/YELLOW/BROWN/ORANGE. `referenceVersion` from the live ADVISORY catalog was supplied and accepted on every submit.

## Submitted registrations (record identifiers only; no tokens)

| # | Plate | Province | Brand | requestId | Status |
|---|---|---|---|---|---|
| 1 | ฑฆ 9901 | 10 | TOYOTA | `9a7d6094faf999ad5a6782278d825705fa9284980a3c830dd0d05066cffaa2d1` | PENDING_APPROVAL |
| 2 | ฑฆ 9902 | 50 | HONDA | `b544a86b39d33cdf15a3ba0cf5b3e1a595c43e6ff79a80eed58cbf4cfb0e80c8` | PENDING_APPROVAL |
| 3 | ฑฆ 9903 | 30 | ISUZU | `b75ad3b10003ad06086f66e4d1c24d4e3be31a5b66d7c2e4ebc2a3d4e08909be` | PENDING_APPROVAL |
| 4 | ฑฆ 9904 | 40 | MITSUBISHI | `17e49201c540b9b120e4769731b4248b42d13cd55601c654110816c62f4204c9` | PENDING_APPROVAL |
| 5 | ฑฆ 9905 | 20 | NISSAN | `033866f8d47de96e82a12c7772b06246e648c83aa73251c2e85ffbaa826ddf9c` | PENDING_APPROVAL |
| 6 | ฑฆ 9906 | 11 | MAZDA | `a2c46b884bcb84a3440f3768e72939e71da1c2474d016d5c94199757afa1eea7` | PENDING_APPROVAL |
| 7 | ฑฆ 9907 | 12 | FORD | `3a1ba0d85f31509aa81e299056d590ec77551d6a571b62cd19a965afba04a478` | PENDING_APPROVAL |
| 8 | ฑฆ 9908 | 13 | MG | `363961e150baeafc4bbbf3708bda3ad1dbd6c580d214ccce2cc0ff375e5ce59e` | PENDING_APPROVAL |
| 9 | ฑฆ 9909 | 14 | BYD | `73566e8c3b28de063601c1d08fbf901abb22cbf4ec074af09125d2d33237d791` | PENDING_APPROVAL |
| 10 | ฑฆ 9910 | 15 | SUZUKI | `4650e6f6496a87705e320c496e23617cdba2b9be11e69ff838a4292df58636e4` | PENDING_APPROVAL |

## Findings / residuals

- First `listPending` attempt used `{pageSize:100}` without `page` and was correctly rejected `INVALID_PAGINATION` (paired page+pageSize required). Retried with `{page:1,pageSize:100}` — PASS. Contract behaves as designed.
- The first script run aborted before its `auth.logout`; that session expires by the configured idle timeout. The verification session was explicitly revoked.
- Runtime was still Web App Version 26 / Backend `0.7.0` during this run; submit/read paths are unchanged in 0.7.2. Switching the deployment to Version 28 remains an open owner step.
- Campaign quota consumed 10/10; further submissions on this campaign will fail `CAMPAIGN_INVALID` by design.
- This is DEV synthetic acceptance, **not** production security/PDPA/UAT approval. `ENFORCED` mode remains gated.

## Next journey step

Owner (or a follow-up automated slice) reviews/approves the 10 pending requests in the SPA or via `registrations.review`, then vehicle/contact/QR creation and plate lookup continue the primary journey under Epic #61.