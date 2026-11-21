# P6 Vehicle Contact — Reference Seed Coercion Incident & Recovery Evidence

**Date:** 2026-11-21 (Asia/Bangkok)
**Scope:** DEV seed apply failure, root cause, fix (Backend `0.7.1`) and gated recovery runbook
**Severity:** DEV data-write verification failure; no credential, session or PII exposure

## Timeline (owner-reported sanitized editor logs)

| Time | Event | Result |
|---|---|---|
| 05:55 | Owner published Web App Version 26 (source Version 25, Backend `0.7.0`) | Live health verified direct + Worker |
| 07:03 | `previewVehicleReferenceSeedFromEditor()` | `READY`, rowCount 645, addCount 645, existingCount 0, `dataModified:false`, checksum `d561c7d6f0ed9832843c77523b324bcc916b6fb1ad569c5bc11b8d3e705846cb` |
| 07:03 | Local recomputation of manifest SHA-256 from canonical source | Identical checksum — preview gate PASS |
| 07:06 | `applyVehicleReferenceSeedFromEditor()` with exact checksum property | **Error `REFERENCE_SEED_VERIFICATION_FAILED`** at installer verify step |
| ~07:20 | Owner-confirmed push of Backend `0.7.1` fix | Source Version 27 created (run 44843016692) |
| 07:38 | `recoverVehicleReferenceSeedFromEditor()` with recovery approval | **Error `TypeError: ...clearContents is not a function`** — the fix used a non-existent GAS method name; real API is `clearContent()` (singular). Failed before any data change; journal stayed `RECOVERY_REQUIRED`, recovery approval consumed |

## Root cause

GAS `Range.setValues()` uses USER_ENTERED semantics: Google Sheets coerced numeric-looking
strings (province codes such as `"10"` became number `10`) and the ISO timestamp
`2026-11-20T00:00:00.000Z` became a Date object. The installer verified by comparing
`getValues()` read-back against the manifest, so verification failed after the write.

The unit-test fake Sheets stored raw values without emulating this coercion, so the full
backend regression and CI passed while the live write path was broken. This is a test
strategy gap, now closed by a coercion-emulating fake.

## Fail-closed state after the incident (verified by design and code path)

- Whole-spreadsheet Drive backup created **before** the write (`backupRef` in journal).
- Journal `VEHICLE_REFERENCE_SEED_JOURNAL` set to `RECOVERY_REQUIRED` with the error code.
- One-time checksum approval property consumed in `finally` — a blind rerun is rejected
  with `REFERENCE_SEED_RECOVERY_REQUIRED`.
- The 645 written rows are coercion-dirty; the catalog reader rejects non-string codes,
  so no corrupted dropdown list can be served. API/UI remain effectively `LEGACY`.
- No public API operation was added or changed by the incident.

## Fix — PR #78, Backend 0.7.1 (merged to main `1b6d85d`)

1. Apply writes the data range with plain-text number format `@` and all-string values;
   Sheets can no longer coerce codes or timestamps.
2. Verification compares `getDisplayValues()` against stringified manifest rows.
3. New editor-only `recoverVehicleReferenceSeedFromEditor()`:
   - requires Script Property `VEHICLE_REFERENCE_SEED_RECOVERY_APPROVED=true`;
   - requires journal status `PREPARED`/`APPLYING`/`RECOVERY_REQUIRED` **with** `backupRef`;
   - clears data rows only when every row is seed-owned (`REF-*` reference_id and
     `updated_by=REFERENCE_SEED_V1`); foreign rows raise `REFERENCE_SEED_RECOVERY_CONFLICT`;
   - journals `RECOVERED` (keeping `backupRef` and `previousStatus`) and consumes the approval.
4. Manifest unchanged: checksum remains `d561c7d6f0ed9832843c77523b324bcc916b6fb1ad569c5bc11b8d3e705846cb`;
   the owner's 07:03 preview stays valid.
5. **Backend 0.7.2 follow-up:** the 0.7.1 recovery path called `clearContents()`, which does
   not exist in the GAS Range API (correct name: `clearContent()`); the unit fake mirrored
   the typo and passed. Renamed in installer and fakes, and added an API-surface guard test
   asserting every fake Range method is a real documented GAS Range method, so typo'd
   platform calls can no longer pass CI.

## Verification gates

| Gate | Result | Evidence |
|---|---|---|
| Coercion-emulating apply test | PASS | `@` format keeps `"10"` and ISO timestamp as strings; APPLIED + ALREADY_APPLIED |
| Coerced legacy rows detection | PASS | Preview returns BLOCKED, never ALREADY_APPLIED |
| Recovery gates | PASS | Approval required; journal+backup required; foreign rows refused; approval consumed |
| Recover -> reapply cycle | PASS | Under coercion fake: RECOVERED -> READY -> APPLIED -> ALREADY_APPLIED |
| Full backend regression | PASS | All suites, 0 failures (Backend 0.7.1) |
| GAS build | PASS | 53 `.gs` modules + manifest |
| SSOT validators | PASS | 0 errors; 20 diagrams; 51/51 operations |
| CI (PR #78) | PASS | Run [44842843561](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44842843561) |
| GAS source push (0.7.1) | PASS | Owner confirmation `PUSH_VEHICLE_GAS`; run [44843016692](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44843016692) from main `1b6d85d`; tests/build PASS; source Version 27 created; no Web App publication |
| GAS Range API-surface guard | PASS | 13/13 seed tests incl. fake-method-name whitelist against real GAS Range API (Backend 0.7.2) |
| GAS source push (0.7.2) | PASS | Fresh owner confirmation `PUSH_VEHICLE_GAS`; run [44845690152](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44845690152) from main `3b3c6be` (PR #80); tests/build PASS; source Version 28 created; no Web App publication |
| Web App publication (0.7.2) | NOT RUN | Separate manual owner step |
| Live recovery + reapply | NOT RUN | Gated runbook below |

## Gated recovery runbook (owner executes in Apps Script editor)

1. Publish the new source version to the development Web App deployment; verify
   `system.health` reports Backend `0.7.2`.
2. Add Script Property `VEHICLE_REFERENCE_SEED_RECOVERY_APPROVED` = `true`.
3. Run `recoverVehicleReferenceSeedFromEditor()` — expect `RECOVERED`, `clearedCount:645`.
   On `RECOVERY_CONFLICT` or any other error: stop and report; do not retry blindly.
4. Delete the recovery approval property (the function also consumes it automatically).
5. Run `previewVehicleReferenceSeedFromEditor()` — expect `READY`, rowCount 645, same checksum.
6. Add Script Property `VEHICLE_REFERENCE_SEED_APPROVED_SHA256` =
   `d561c7d6f0ed9832843c77523b324bcc916b6fb1ad569c5bc11b8d3e705846cb`.
7. Run `applyVehicleReferenceSeedFromEditor()` — expect `APPLIED`, rowCount 645,
   `backupCreated:true`. The approval is consumed automatically.
8. Run preview again — expect `ALREADY_APPLIED`.
9. Sign in to the frontend again; the intake form must show canonical province/brand/color
   lists in `ADVISORY` mode. `ENFORCED` remains a separate, unapproved gate.

## Lessons / prevention

- Fake repositories must emulate platform storage semantics (USER_ENTERED coercion),
  not just API shape; added permanently to the seed test suite.
- Read-back verification after write is mandatory and stayed fail-closed under failure.
- Recovery is a distinct, explicitly approved operation — never an automatic retry.