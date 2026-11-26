# B2b — Durable journaling for `registrationReview` and `assignRoles`

**Document ID:** P6VC-B2B-001 | **Date:** 2026-11-22 (Asia/Bangkok) | **Classification:** SOURCE + SYNTHETIC CI EVIDENCE — engineering hardening, **not** a production/security/PDPA/UAT/release approval.
**Slice:** B2b (PM plan WS-B follow-up to B2 / [VC-ADR-016](DECISION_LOG.md)). Closes the D-SEQ-09 durable-journaling deferral for `registrations.review` and `users.assignRoles`.
**Source baseline:** `main` @ `4daf25b` (PR #116). **Runtime boundary:** this is a **source** change; the published anonymous Web App remains **V48 / 0.9.1** until a separate owner-authorized publication. Source merge ≠ Web App publication.
**Companions:** [B2 journal recovery evidence](BACKEND_JOURNAL_RECOVERY_EVIDENCE_20261121.md), [recovery runbook](OPERATION_JOURNAL_RECOVERY_RUNBOOK_20261121.md), [ER diagram §3 audit/recovery](DATA_MODEL_ER_DIAGRAM_20261122.md).

## 1. Problem (what B2 left open)

Google Sheets has no ACID multi-row transaction. B2 delivered automatic state-driven reconciliation for `registrations.submit` plus a **manual** runbook for `registrationReview` and `assignRoles`, because those two ops wrote **no journal and no compensation**. An abrupt Apps Script timeout/restart (6-minute limit, quota, deploy) between their multi-row writes left partial state — an orphan `ACTIVE` vehicle with missing contacts/photos/QR, or a user stripped of all roles — recoverable only by hand.

## 2. What B2b implements (source)

Both ops now run inside `store.withLock` with a durable `vc_operation_journal` lifecycle **PREPARED → APPLIED / ROLLED_BACK / RECOVERY_REQUIRED**, single bounded per-sheet reads only (**no cross-sheet join**, owner latency directive):

- **`users.assignRoles`** ([IdentityOperations.js](../backend/gas/src/application/use-cases/IdentityOperations.js)): writes a `PREPARED` journal carrying `{beforeRoles, desiredRoles, auditId, correlationId}`; replaces roles; writes a deterministic `ROLES_CHANGED` audit; marks `APPLIED`. On a caught failure it restores `beforeRoles` and journals `ROLLED_BACK` (or `RECOVERY_REQUIRED` if compensation itself fails). On restart it converges a `PREPARED`/`RECOVERY_REQUIRED` partial to the desired set and is **idempotent** on replay (no duplicate journal/audit). Self-demotion/expansion guards now compare against the journal's `beforeRoles` baseline during recovery, so a restart cannot bypass them.
- **`registrations.review`** ([VehicleOperations.js](../backend/gas/src/application/use-cases/VehicleOperations.js)): writes a `PREPARED` journal carrying `{decision, contactId, qrId, auditId, correlationId}`. The QR token is **deterministic** — `security.deriveSecret('registration-review:'+eventId+':'+requestId)` ([GasSecurity.js](../backend/gas/src/infrastructure/security/GasSecurity.js)) — so a restart replays the **same** token instead of minting a second QR. `completeReviewState` verifies vehicle `ACTIVE` + exactly one primary contact + the exact five photos + QR digest match before finalizing; `rollbackReviewPartial` removes only the orphan state this attempt created and resets the request to `PENDING_APPROVAL`. `DUPLICATE_VEHICLE` excludes the request's own `vehicle_id` on re-apply. Restart converges `PREPARED` partials, finalizes stale `PREPARED` markers left after terminal writes, and **fails closed** (`OPERATION_RECOVERY_REQUIRED`) on a mismatched retry intent (e.g. journal `APPROVE`, retry `REJECT`).

`executeDeletion` remains job-tracked and retry-safe (unchanged). Destructive retention stays behind `allowDestructiveRetention` (default false); B2b touches no retention enable.

## 3. Injected-failure / restart safety tests (synthetic, offline)

[journal-recovery.test.mjs](../backend/gas/tests/journal-recovery.test.mjs) — 6 new B2b cases, all PASS:

| Test | Proves |
|---|---|
| **B2B-ROLE-01** | Injected insert failure mid-replace → prior roles restored (`['STAFF']`), journal `ROLLED_BACK`, **zero** `ROLES_CHANGED` audit |
| **B2B-ROLE-02** | Seeded `PREPARED` partial (restart) → converges to desired roles, `APPLIED`, exactly 1 audit; idempotent replay adds no journal/audit |
| **B2B-REVIEW-01** | Injected contact-write failure → orphan vehicle compensated (removed), request back to `PENDING_APPROVAL`, no contact/QR, `ROLLED_BACK` |
| **B2B-REVIEW-02** | Seeded `PREPARED` + orphan vehicle (restart) → cleans + replays the **same derived 64-hex token**, `APPLIED`, 1 vehicle / 1 contact / 5 photos / 1 QR with matching digest; replay returns same token, 1 audit, 1 QR |
| **B2B-REVIEW-03** | Stale `PREPARED` marker **after** terminal writes (crash before journal update) → replay finalizes without duplicates, same token, `APPLIED` |
| **B2B-REVIEW-04** | Mismatched retry intent (`PREPARED APPROVE`, retry `REJECT`) → fails closed `OPERATION_RECOVERY_REQUIRED`, request unchanged, no vehicle |

## 4. Suite result

`npm --prefix apps/vehicle-contact/backend/gas run check` → **EXIT 0**, aggregate **164/164 tests PASS, 0 fail** (includes the 6 B2b cases, the 4 B2 `RECOVERY-01..04`, RBAC matrix, contracts, inventory and compiled-GAS artifact gates). **No contract / DTO / permission / operation-inventory / Worker change** — operation count stays **56/56**; this is internal persistence hardening only, so no Worker redeploy is required. Fakes emulate real GAS coercion/row-expansion ([acceptance-fixture.mjs](../backend/gas/tests/acceptance-fixture.mjs)).

## 5. Security invariants preserved

Server-authoritative RBAC unchanged; `SELF_DEMOTION_DENIED` / `SELF_ROLE_EXPANSION_DENIED` still enforced (baseline-aware on recovery); `PLATE_PHOTO_NOT_VERIFIED` and `DUPLICATE_VEHICLE` still enforced; `RETENTION_WORKER` still cannot be combined with other roles; two-person retention + `legal_hold` untouched; no plaintext secrets, no PII in journals (deterministic ids + digests only). Compensation removes **only** the orphan rows created by the failed attempt — it is transaction rollback, **not** retention deletion.

## 6. SSOT updates in this slice

- [Recovery runbook](OPERATION_JOURNAL_RECOVERY_RUNBOOK_20261121.md) §3.3 / §3.5 / §5 corrected: review/assignRoles are now durable + idempotent; manual procedures retained **only** as the `RECOVERY_REQUIRED` fallback.
- [DECISION_LOG](DECISION_LOG.md): **VC-ADR-018** records B2b durable journaling (engineering decision); VC-ADR-016 deferral closed.
- [CURRENT_DELIVERY_STATUS](CURRENT_DELIVERY_STATUS.md) + [PM plan](PROJECT_MANAGEMENT_PLAN_20261121.md): B2b TODO → DONE-engineering.

## 7. Boundary

Source delivered, offline-green, and **published to the DEV Web App via the owner-authorized clasp self-deploy path** (§9). Publication to DEV is distinct from production release: production security/PDPA/UAT/release sign-offs, credential rotation and physical-device acceptance remain separate OPEN human gates. B2b is engineering hardening and does not self-approve any of them. Destructive retention stays disabled.

## 8. Reproduce

```
npm --prefix apps/vehicle-contact/backend/gas run check
node --test apps/vehicle-contact/backend/gas/tests/journal-recovery.test.mjs
```

## 9. Live publication + re-verification (2026-11-22, owner-authorized clasp + browser + `.env`)

Recorded as separate facts (source push ≠ version ≠ publication ≠ health):

| Step | Result |
|---|---|
| Build | `npm run build` → 56 `.gs` + manifest; `webapp:{executeAs:USER_DEPLOYING,access:ANYONE_ANONYMOUS}` verified (no 404 risk) |
| Source push | `clasp -u p6vc push --force` → GAS project source updated |
| Version | `create-version` → immutable **Version 49** |
| Publication | `update-deployment AKfycby15c-… -V 49` → live `/exec` redeployed **@49**; `list-deployments` confirms pin `@49 - B2b durable journaling 0.9.2` (second deployment `AKfycbyHGNhn…` stays @HEAD) |
| Health probe | direct `/exec` → `status:ready`, `apiVersion:v1`, **`backendVersion:0.9.2`** |
| **Full live API suite** | `run-live-api-suite.mjs --require-authenticated` (synthetic-DEV write guard + cleanup) → **97/97 PASS, 0 fail** = 11 public direct-GAS + 14 Worker fail-closed + 72 authenticated direct-GAS; **56/56 operations, missing 0, cleanupFailed 0**; all 3 stages PASS |
| **Independent Sheets data audit** | read-only gviz CSV via logged-in browser, post-suite → **25/25 sheets, 0 display errors, 0 header fails, 0 fetch fails**; **10/10 ACTIVE ฑฆ1000–1009 fixtures complete** (1 contact / 5 photos / 1 QR / 1 APPROVED reg); 12 clean FK checks (7 `NO_MATCH` sentinels excluded; 31 `vc_user_roles.role_id` "orphans" = BY DESIGN code catalog); ACTIVE 10 / INACTIVE 27 |
| **B2b journal health (live)** | `vc_operation_journal` 42 rows, **all terminal APPLIED**: `registrations.review` APPLIED 1, `users.assignRoles` APPLIED 4, `registrations.submit` APPLIED 37; **0 stuck PREPARED / RECOVERY_REQUIRED** — durable journaling commits cleanly live, no partial state left by the suite |

The audit tool ([sheets-data-audit.browser.js](https://github.com/idev006/MT-Agency-Super-App-Framework/blob/15dae00/apps/vehicle-contact/backend/gas/scripts/sheets-data-audit.browser.js "removed 2026-11-26 (VC-ADR-044); last version")) now also returns an `operationJournal` summary (`byOperationStatus`, `stuckPreparedOrRecovery`) so future full tests verify B2b journal health, not just display errors. **API OK (97/97) and data OK (0 errors, journals APPLIED) are both confirmed independently.** Rollback if needed = re-pin the live deployment to V48 (`update-deployment … -V 48`).