# GAS Sheets number-format display corruption — root cause, every-sheet repair & build-wrapper drift

**Date:** 2026-11-21 (Asia/Bangkok)
**Severity:** original DEV data-display corruption across **21 sheets / 6,659 cells** (grid showed comma-repeat custom formats and `#VALUE!`). In that original incident, **stored cell VALUES were not changed** — display formats only; the later numeric-backed legacy-value case is documented separately below.
**Status:** RESOLVED — the original format incident was repaired idempotently (25 sheets, `valuesUntouched:true`). A follow-up audit on the same day found and resolved **9 numeric-backed legacy `province_code` values** plus a blank `vc_vehicles!A1`; final all-sheet display audit: `status:OK`, `auditedSheets:25`, `incompleteSheets:[]`, `totalErrorsBefore:0`, `totalErrorsAfter:0`, `totalRepaired:0`. Published API remains Version 48 / `0.9.1`; the editor-only follow-up repair is in GAS HEAD.
**Source fixes:** `SheetStore.js` (plural `setNumberFormats`), `scripts/build.mjs` (derive GAS wrappers from exports), `NumberFormatRepair.js` (format-only repair + numeric-General equivalence), `DisplayErrorRepair.js` (all-sheet error audit + narrowly matched legacy value restoration), `WebApp.js` (editor entrypoints). Branches `codex/p6vc-numberformat-rootcause-20261121`, `codex/p6vc-sheet-error-repair-20261121`.
**Related SSOT:** `SHEETSTORE_COERCION_FIX_AND_SHEETS_BEST_PRACTICES_20261121.md`, `REFERENCE_SEED_COERCION_INCIDENT_20261121.md`, `GAS_CLASP_WEBAPP_MANIFEST_INCIDENT_20261121.md`.

## Follow-up recurrence — legacy values and schema-header drift (2026-11-21)

The first format-only repair could not correct nine remaining `#VALUE!` cells in `vc_vehicles.province_code` (`C6`, `C8:C15`). These were **numeric-backed legacy values**, not clean stored strings with only a bad display format. Changing the number format cannot change the stored type. Separately, `vc_vehicles!A1` was blank instead of the canonical `vehicle_id`; strict readers and the audit correctly treated that as schema drift rather than silently guessing column positions.

Resolution:

1. Restored the canonical A1 header from `DATABASE_SCHEMA`; no business-data column was inferred or shifted.
2. Added `repairVehicleDisplayErrorsFromEditor()` / `DisplayErrorRepair.js`. It audits **every schema sheet** for `#VALUE!`, `#REF!`, `#DIV/0!`, `#N/A`, `#NAME?`, `#NUM!`, `#NULL!` and `#ERROR!` using display values.
3. The only automatic value write is `vc_vehicles.province_code`. It requires a non-formula target, exactly one `APPROVED` registration snapshot, matching `vehicle_id` **and** `plate_normalized`, and a valid province code. It never uses `IFERROR`, never masks unrelated errors, and never rewrites other sheets.
4. First live value-restoration pass: `totalErrorsBefore:9`, `totalErrorsAfter:0`, `totalRepaired:9`, with zero `FORMULA_ERROR`, `SOURCE_NOT_FOUND` or `SOURCE_MISMATCH` skips. Second pass: zero errors and zero repairs.
5. Strengthened audit completeness: a missing/drifted sheet returns `AUDIT_INCOMPLETE` with `incompleteSheets`, never a false global `OK`. Final live pass at **21:56:45 Asia/Bangkok**: `status:OK`, `auditedSheets:25`, `incompleteSheets:[]`, `totalErrorsBefore:0`, `totalErrorsAfter:0`, `totalRepaired:0`.
6. Regression coverage `display-error-repair.test.mjs`: matched restoration + idempotency, formula/unmatched-source protection, unrelated-sheet reporting without writes, and schema-drift fail-closed behavior. GAS-VM-03 requires both maintenance entrypoints and callable wrappers for every export; it no longer asserts a brittle fixed wrapper count.
7. Post-seed live audit at **22:23:39 Asia/Bangkok**, after cancelling 11 old synthetic vehicles and creating 10 replacements through the real API lifecycle: `status:OK`, `auditedSheets:25`, `incompleteSheets:[]`, `totalErrorsBefore:0`, `totalErrorsAfter:0`, `totalRepaired:0`. All ten numeric-looking province codes were written as strings without recreating visible errors.

This follow-up was pushed to **GAS HEAD only** for editor maintenance. It did not create a new anonymous Web App version; live API publication remains separately controlled.

## Symptom (owner report)

The owner opened the production spreadsheet and saw, on **many sheets**, cells rendering as a comma-joined repeat of `@` (e.g. `@,@,@,@,…`) or `#VALUE!` — notably `vc_sessions.reviewed_at` and rows 101–116. Owner directive: *"มันเป้นหลายชีทเลยนะ คุณต้องตรวจทุกชีท และ แก้ปัญหา root cause น่าจะเป้นที่ source code"* (it affects many sheets; check **every** sheet and fix the root cause in source).

Critical distinction confirmed by reading the cells: the **formula bar / stored value was clean** (a normal ISO-8601 timestamp or text); only the **grid display** was wrong. This is a *number-format* defect, not a *data* defect.

## Root cause #1 — singular `setNumberFormat` called with an array

`Range.setNumberFormat(format)` (**singular**) takes a single **String** applied to the whole range.
`Range.setNumberFormats(formats)` (**plural**) takes a **2D `String[][]`** matrix (one format per cell).

`SheetStore.writeRow` built a per-column format **array** (`['@','@','General',…]`) but passed it to the **singular** API:

```js
range.setNumberFormat(cells.map(v => typeof v === 'string' ? '@' : 'General')); // WRONG: array → singular
```

Sheets coerced the array to a string by **comma-joining** it, then stored that as a *custom number format* (`@,@,@,…`). A custom format that repeats the text placeholder `@` renders the cell value repeated/comma-joined, and numeric cells under a text-repeat format render `#VALUE!`. The **value itself was written correctly** by the subsequent `setValues` — only the display format was poisoned. Every row written through this path inherited the bad format, which is why the corruption spanned 21 sheets.

### Fix (permanent, in source)

```js
if (typeof range.setNumberFormats === 'function')
  range.setNumberFormats([cells.map(v => typeof v === 'string' ? '@' : 'General')]); // plural + 2D matrix
range.setValues([cells]);
```

Live in v45 onward; new writes can no longer poison formats.

## Root cause #2 — build wrapper drift hid the repair entrypoint

`scripts/build.mjs` flattened ES modules into `.gs` and emitted **global GAS wrapper functions** for entrypoints from a **hardcoded 16-name list**. When `normalizeVehicleNumberFormatsFromEditor` was added to `WebApp.js`, it compiled into the module body but received **no global wrapper** → it never appeared in the GAS Editor *Run* dropdown ("No functions" / uncallable). The maintenance tool existed in source but was unreachable at runtime.

### Fix (permanent, in source)

Derive the wrapper list from the **actual exported functions** so a new entrypoint can never be silently unwrapped:

```js
const entrySource = readFileSync(join(root, 'src/entrypoints/WebApp.js'), 'utf8');
const entrypoints = [...entrySource.matchAll(/export\s+function\s+([A-Za-z0-9_]+)/g)].map(m => m[1]);
if (!entrypoints.includes('doGet') || !entrypoints.includes('doPost'))
  throw new Error('WebApp entrypoints must export doGet and doPost');
```

Regression guard **GAS-VM-03** (`tests/gas-staging-editor-vm.test.mjs`) loads the built bundle in a fake GAS VM and asserts **every** exported `WebApp` function has a callable global wrapper, so this drift fails CI rather than reaching the editor. Required maintenance entrypoints are named explicitly; a hardcoded function-count assertion is forbidden because it breaks whenever a legitimate entrypoint is added.

## Root cause #3 (false-positive during repair) — numeric "General" equivalence

The format-only repair compares each cell's current format against the desired per-column format. Sheets does **not** report numeric `General` cells as the literal string `'General'`; `getNumberFormats()` returns its internal auto numeric format **`'0.###############'`**. Both display numbers/booleans plainly. A naive `actual === desired` comparison flagged every integer/boolean column as mismatched **forever**, rewriting conforming sheets on every pass (1,035 phantom mismatches in pass 2).

### Fix

```js
const NUMERIC_GENERAL = new Set(['General', '0.###############']);
function formatMatches(actual, desired) {
  return desired === 'General' ? NUMERIC_GENERAL.has(actual) : actual === desired;
}
```

Regression test: `tests/number-format-repair.test.mjs` — *"numeric General-equivalent format (0.###############) is conforming, not a perpetual mismatch"*. After this fix the final pass reported **0** mismatches.

## The repair tool — format-only, values-untouched, every-sheet

`NumberFormatRepair.normalizeNumberFormats({spreadsheetApp, spreadsheetId, lockService})`:

- Iterates **every table in `DATABASE_SCHEMA`** (25 sheets) — satisfies "ตรวจทุกชีท".
- Acquires `lockService.getScriptLock().tryLock(15000)` (fail-closed `BUSY`).
- Skips absent tables (`MISSING_TABLE`) and column-count mismatches (`SCHEMA_MISMATCH`) — reported, never fatal, never mis-formatted.
- Reads **only** `getNumberFormats()` over the data range `(2,1,lastRow-1,lastCol)`; builds the desired per-column matrix from column types (`string`/`datetime-iso8601` → `@`, `integer`/`boolean` → `General`).
- Calls `setNumberFormats(matrix)` (**plural**) **only** on sheets with ≥1 mismatch; conforming sheets are not rewritten (idempotent).
- **NEVER reads or writes cell VALUES** (`getValues`/`setValues` are not called; tests throw if they are). Returns `valuesUntouched:true` plus per-sheet `dataRows`, `mismatchedCellsBefore`, `applied`, and `mismatchDetail` (column/type/desired/count/sample actuals).

Editor entrypoint `normalizeVehicleNumberFormatsFromEditor()` (in `WebApp.js`) reads `VEHICLE_SHEET_ID` from script properties, runs the repair, and `Logger.log`s the JSON result. Editor-only; not part of the anonymous web-app surface.

## Live evidence (every-sheet repair)

**Pass 1 — actual corruption repaired:** `totalMismatched:6659`, `totalApplied:21`, `valuesUntouched:true`. Per-sheet mismatched cells:

| Sheet | Mismatched cells | Sheet | Mismatched cells |
| --- | ---: | --- | ---: |
| vc_change_audit | 1448 | vc_registration_requests | 126 |
| vc_sessions | 1044 | vc_idempotency | 98 |
| vc_vehicle_photos | 630 | vc_operation_journal | 98 |
| vc_photo_staging | 630 | vc_user_roles | 76 |
| vc_reference_values | 645 | vc_campaigns | 60 |
| vc_security_events | 500 | vc_retention_jobs | 33 |
| vc_lookup_audit | 406 | vc_change_requests | 24 |
| vc_qr_tokens | 240 | vc_migration_journal | 14 |
| vc_vehicles | 224 | vc_settings | 8 |
| vc_users | 180 | vc_organizations | 35 |
| vc_vehicle_contacts | 140 | | |

(4 empty schema sheets reported 0; 21 sheets repaired; total 6,659.)

**Pass 2 — phantom mismatches:** 1,035 cells flagged as `'0.###############'` on integer/boolean columns → diagnosed as root cause #3 (benign numeric-General equivalence), fixed in source.

**Pass 3 — final, idempotent (verbatim):**

```json
{"status":"OK","totalMismatched":0,"totalApplied":0,"valuesUntouched":true,"nonZeroSheets":[],"sheetCount":25,"completedCount":1}
```

All 25 schema sheets now carry correct display formats; no values touched; re-running changes nothing.

**Display-vs-storage verification:** the formula bar showed clean stored values throughout (timestamps/text intact); only the grid format was wrong. `valuesUntouched:true` on every pass confirms the repair never read or wrote values.

## Deploy reconciliation (this incident)

- Live Web App deployment `AKfycby15c-…` repointed to **Version 47** (final source: plural fix + wrapper derivation + numeric-General equivalence + repair entrypoint; **webapp-only manifest**, `executeAs:USER_DEPLOYING` / `access:ANYONE_ANONYMOUS` intact).
- A speculative owner-only `executionApi` deployment (`AKfycbwlU6Z…` @46) created while exploring `clasp run` was **deleted** — `clasp run` requires the GCP Apps Script API enabled in the script's Cloud project (owner action), so the surface was unused. Manifest reverted to webapp-only; `.clasp.json` restored to `scriptId`+`rootDir`.
- Health verified: direct `/exec` GET → `200 {"ok":true,…,"status":"ready","backendVersion":"0.9.0"}`.
- Full GAS suite **134/134 PASS** (incl. GAS-VM-03 wrapper guard + 3 number-format-repair tests).

## Best practices (team SSOT)

1. **Singular vs plural Sheets APIs are not interchangeable.** `setNumberFormat(String)` applies one format to a range; `setNumberFormats(String[][])` applies a per-cell matrix. Passing an array to the singular form silently comma-joins it into a *custom format* — a display-corruption bug that does **not** throw. Always match the API arity to the data shape; guard with a fake that rejects non-string singular / non-array plural (see `gas-staging-editor-vm.test.mjs`).
2. **Display corruption ≠ data corruption.** Before assuming data loss, read the **formula bar / `getValues()`**: if the stored value is clean and only the grid is wrong, it is a number-format defect. Repair formats only; never rewrite values to "fix" a display bug.
3. **Format-only repair must be values-untouched and idempotent.** Read `getNumberFormats()`, compare per-column, write `setNumberFormats(matrix)` only where mismatched, and prove `getValues`/`setValues` are never called (tests throw on them). Re-running must report 0 changes.
4. **Sheets reports numeric General as `0.###############`, not `General`.** Treat them as equivalent when auditing formats, or integer/boolean columns mismatch forever (false positive). Encode the equivalence in one predicate + a regression test.
5. **Derive build-time wiring from source, never a hardcoded list.** A hardcoded entrypoint array drifted from the real exports and hid a maintenance function from the GAS Editor. Generate wrappers from `export function` declarations and add a VM-level guard (GAS-VM-03) asserting every export is callable.
6. **Check every sheet, report scope per sheet.** Iterate the full schema; report `MISSING_TABLE`/`SCHEMA_MISMATCH` as non-fatal skips with per-sheet counts so the owner sees exactly what was checked and changed.
7. **Avoid cross-sheet joins.** The repair reads each sheet independently (no joins) — Sheets is not an RDBMS; per-sheet scans keep it fast and lock-safe.
8. **No secrets in artifacts.** `.clasp.json`/`.clasprc.json` gitignored; clasp creds in named profile `-u p6vc`; never in repo/docs/logs/chat.
9. **Never mask spreadsheet errors with `IFERROR`.** Find the underlying value/formula/format problem. An automated value repair must be narrowly scoped to a provable source and exact business-key match; unmatched or formula errors remain visible in the report for human diagnosis.
10. **Format repair and value repair are different operations.** `setNumberFormats()` cannot convert a numeric-backed legacy cell into a string. Verify stored type and display separately, then restore only values that have an authoritative snapshot.
11. **A skipped sheet invalidates global success.** Missing tables, blank/drifted headers, extra non-empty columns or column-count mismatches must produce `AUDIT_INCOMPLETE`; never report `OK` for a partial audit. Schema headers come from the canonical schema, not column-position guesses.

## Repair runbook (maintenance, editor-only)

1. Ensure HEAD has the latest source (`clasp -u p6vc push --force` after `npm run build`).
2. In the GAS Editor, open the `WebApp` file (the runtime module file has no runnable globals; use the file containing the wrapper functions).
3. Select `normalizeVehicleNumberFormatsFromEditor` in the Run dropdown → **Run**. (Editor *Run* executes **HEAD**, not a deployed version; reload the page if the dropdown/model is stale.)
4. Read the `Logger.log` JSON: confirm `valuesUntouched:true`, inspect `totalMismatched`/`totalApplied` and per-sheet `mismatchDetail`.
5. Re-run once more: a correct repair is **idempotent** (`totalMismatched:0`, `totalApplied:0`).
6. To make the fix live for anonymous traffic, `create-version` + `update-deployment AKfycby15c-… -V <N>` and verify `/exec` health (the runtime `SheetStore` fix is what protects new writes).

For visible spreadsheet error values, run `repairVehicleDisplayErrorsFromEditor` instead. Require `status:OK`, `auditedSheets:25`, `incompleteSheets:[]` and `totalErrorsAfter:0`; investigate `AUDIT_INCOMPLETE` or `ERROR_VALUES_REMAIN` rather than masking cells. Re-run to prove zero repairs. This tool writes only exact-match legacy `vc_vehicles.province_code` values; all other errors are report-only.

> `clasp run` automation is **not** currently available: it needs an API-executable deployment **and** the Apps Script API enabled in the script's GCP Cloud project (owner action). Until then, use the editor-UI path above.

## Residual / owner gates

- Authenticated live E2E (negative probes, approval flow) still requires the gitignored DEV `.env` secrets — owner action.
- Production sign-offs (PDPA / security / UAT / release) and decision ratifications (D-E1/D3/D5/B3, ADR-014/015) remain owner gates; the assistant never self-approves them.
- C5 RETENTION_WORKER console is gated on D5+B3.
- This fix is merged to `main` so future CI pushes and assistant self-deploys carry the plural-format fix, the wrapper-derivation guard, and the idempotent repair tool automatically.