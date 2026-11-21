# P6 Vehicle Contact — SheetStore Coercion Fix & Google Sheets Engineering Best Practices

**Date:** 2026-11-21 (Asia/Bangkok)
**Scope:** DEV runtime write-path coercion bug, root cause, fix (Backend `0.8.1`), regression evidence, and durable Sheets/GAS engineering rules for the team
**Severity:** DEV primary-journey blocker (`vehicles.lookup` returned `null` for approved vehicles); no credential, session or PII exposure
**Status:** Fix merged to `main` (`0d3b1f6`, PRs #86 + #87); deployment verification pending owner publication of the `0.8.1` source version
**Why this doc exists:** the project is document-driven (SSOT). Every confirmed bug, its solution, and the resulting best practice MUST be recorded here so the whole team inherits the knowledge instead of re-discovering it.

---

## 1. The bug (runtime write-path coercion)

### Symptom
The owner-approved synthetic approval E2E (through the Cloudflare Worker) approved a registration successfully (`registrations.review` → `APPROVED` + `qrToken`), but the very next step `vehicles.lookup` returned `null`, throwing `LOOKUP_MISMATCH`. Reproduced on a **freshly approved** vehicle (`ฑฆ 9902`), proving it was not limited to legacy data.

### Root cause
`SheetStore.insert`/`update` (`infrastructure/persistence/sheets/SheetStore.js`) wrote rows via `appendRow` / `setValues` **without forcing a text number format**. Real Google Sheets `USER_ENTERED` semantics then coerced:
- numeric-looking **strings** → numbers (`province_code "10"` → `10`)
- ISO timestamp strings → `Date` objects

The live handler `VehicleOperations.vehicleLookup` filtered with **strict `===`**:
```js
v.province_code === province   // 10 === "10"  → false  → NO_MATCH → null
```
So any vehicle whose `province_code` is a numeric code (all Thai province codes `10`–`77`) could never be found by plate lookup. The whole registration → approval → lookup → QR primary journey was blocked.

### Why it was latent
This is the **same bug class** as the earlier [reference seed coercion incident](REFERENCE_SEED_COERCION_INCIDENT_20261121.md), but in a **different writer**. The seed fix only hardened the seed installer (`ReferenceSeedInstaller`, `vc_reference_values`). The **runtime** `SheetStore` (vehicles, contacts, photos, QR, sessions, …) was never hardened. Submit writes hex IDs / JSON snapshots (not coercion-prone), so the bug only surfaced on the **first approval**, which writes `vc_vehicles.province_code`.

### Detection layers (how we proved it)
1. **Code analysis:** live dispatcher (`OperationController`) uses `createVehicleOperations`, whose `vehicleLookup` uses strict `===`; `SheetStore` writes had no text format.
2. **Live read-only probe:** `vehicles.lookup` returned `null` for the approved plate under every plate/province variant.
3. **Local regression test with a coercion-accurate fake:** FAILED before the fix (`'number' !== 'string'`), PASSED after.

---

## 2. The solution (merged)

| Change | File | Purpose |
|---|---|---|
| Text-preserving writes | `SheetStore.js` (`writeRow`) | Force per-cell `@` (text) on **string** cells, `General` on genuine numbers/booleans, before `setValues`. `insert` writes the next row via a formatted range instead of `appendRow`. Stops numeric-code **and** ISO-timestamp coercion at the runtime write path. |
| Read tolerance | `VehicleOperations.vehicleLookup` | Compare `plate/province/status` as **strings** (`String(v.…)`), matching `SheetsVehicleReadRepository`. Legacy rows approved before the fix stay lookup-able and can be repaired. |
| Deployment marker | `SystemGroup.js`, `package.json` | `backendVersion` `0.8.0` → **`0.8.1`** so `system.health` unambiguously confirms the fix is live. |
| Regression tests | `sheet-store-text-coercion.test.mjs`, `vehicle-lookup-coercion-tolerance.test.mjs` | Coercion-accurate fake (USER_ENTERED per-cell) + legacy numeric `province_code` lookup tolerance. Both wired into `npm test`. |
| Fake accuracy | `admin-password-reset.test.mjs` | `setValues` now auto-expands rows like real Sheets (the old per-cell fake threw on append). |

**Pattern proven in production-like conditions:** `setNumberFormat('@')` + `setValues` is the exact technique that successfully wrote 645 verified plain-text seed rows. The runtime fix reuses it.

**Evidence:** full backend `npm run check` (build + 35 test files) PASS, exit 0. PRs [#86](https://github.com/idev006/MT-Agency-Super-App-Framework/pull/86), [#87](https://github.com/idev006/MT-Agency-Super-App-Framework/pull/87); CI green; GAS push run [44863296125](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44863296125) from `0d3b1f6`.

### Data repair (post-deployment)
Two synthetic vehicles (`ฑฆ 9901`, `ฑฆ 9902`) were approved **before** the fix and hold a numeric-coerced `province_code`. After `0.8.1` is published: read-tolerant `vehicles.lookup` recovers their `vehicleId` → `vehicles.update` rewrites `province_code` as text via the fixed write path → rows become clean. No real data is involved.

---

## 3. Deployment verification lesson (version mismatch)

- The owner published a Web App version (reported "Version 33") that **did not serve the write fix**: a freshly approved vehicle still failed lookup. The assistant's push had created a different source version ("Version 32"). Because the fix did not change `backendVersion`, **health alone could not distinguish deployed versions**.
- **Rule:** a behavior fix MUST bump `backendVersion` (or expose a build marker) so `system.health` is a definitive deployment probe. Never assume "owner published" means "the fix is live" — **probe functionally**.
- **GAS source push ≠ Web App publication.** `clasp push` + `create-version` only updates source + an immutable version. The owner must explicitly publish that version in the editor (Deploy → Manage deployments → Edit → Version → Deploy). The editor runs HEAD source; the Web App serves the published version.
- The Apps Script editor does **not** auto-refresh after a clasp push (F5 required); a stale tab can mislead version selection.

---

## 4. Google Sheets engineering best practices (team standard)

> **Owner directive:** Google Sheets is **not an RDBMS**. Avoid joining data in Sheets wherever possible — it makes the system slow. Always design for real-world usage and latency.

### 4.1 Treat Sheets as a bounded key-value/document store, not a relational engine
- **No cross-sheet joins at query time.** Do not emulate SQL JOINs by scanning multiple sheets per request. The current design reads each table **once per execution** into an execution-local snapshot (`SheetStore` `snapshot` Map) and filters/joins **in memory**. This is acceptable only at DEV scale.
- **Bounded reads only.** `SheetStore` reads one rectangular range (`getRange(1,1,lastRow,lastCol).getValues()`), never `getDataRange()` over arbitrary contents, and enforces `MAX_SCAN_ROWS = 10000`. Keep this invariant.
- **Full-table scans do not scale.** `store.list('vc_vehicles').filter(...)` is O(rows) per execution. At production volume this is the primary latency risk. Plan a real datastore (or indexed/sharded access) before scaling; do not add more in-memory joins to compensate.

### 4.2 Minimize round-trips and reads
- One `openById` per execution; cache the spreadsheet handle.
- One bounded read per table per execution; invalidate the snapshot only on write/lock.
- Batch writes; avoid per-cell API calls in loops.
- `withLock` clears the snapshot (pre-lock caches are stale) — re-read inside the lock.

### 4.3 Preserve data types explicitly (the coercion rule)
- Sheets `USER_ENTERED` coerces numeric-looking strings → numbers and ISO strings → Dates on write.
- **Always force `@` (text) on string cells** (codes, IDs, plates, provinces, timestamps) before `setValues`; keep `General` for genuine numbers/booleans.
- Verify persisted text with `getDisplayValues()` (not `getValues()`, which returns coerced types).
- Escape formula-like strings (`= + @ -` prefix) — `literalCell` already does this; text format is defense-in-depth.

### 4.4 Use real GAS API names and semantics
- `clearContent()` (singular) exists; `clearContents()` does **not**.
- `setValues` on a range beyond the last row **auto-expands** the sheet.
- Test fakes MUST emulate real semantics: USER_ENTERED coercion, row auto-expansion, real method names. A fake that stores raw values silently hides coercion bugs (this is exactly how the runtime bug survived unit tests). The seed suite already has an API-surface guard test; extend that discipline to runtime writers.

### 4.5 Design for real-world usage
- Every read path that scans a growing table (`vc_vehicles`, `vc_lookup_audit`, `vc_change_audit`, `vc_operation_journal`) needs a retention/pagination strategy and, eventually, an indexed store.
- Audit/journal tables grow unbounded; `audit.query`/`vehicles.history` already cap results — keep caps and add archival before production.
- Prefer single-key lookups (`store.one(table,{primary_key})`) over scans where the access pattern allows.

---

## 5. Durable rules checklist (apply to every future slice)

- [ ] String codes/timestamps written to Sheets are forced to `@` text format; verified via `getDisplayValues()`.
- [ ] Business-key comparisons tolerate legacy coerced values (`String(...)`) OR data is repaired; never rely on strict `===` against Sheets-read values without normalization.
- [ ] No new cross-sheet joins / unbounded scans; reads stay bounded and cached per execution.
- [ ] Behavior fixes bump `backendVersion`; deployment confirmed by health probe + functional probe, not assumption.
- [ ] Test fakes emulate real GAS coercion/auto-expansion/method names.
- [ ] GAS push gated on owner `PUSH_VEHICLE_GAS` (a prior phrase does not carry over); publication is a separate owner action.
- [ ] Bug + solution + best practice recorded in this SSOT doc set.

---

## 6. References
- PRs: [#86](https://github.com/idev006/MT-Agency-Super-App-Framework/pull/86) (write fix), [#87](https://github.com/idev006/MT-Agency-Super-App-Framework/pull/87) (0.8.1 marker + read tolerance)
- GAS push runs: [44861537908](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44861537908) (V32), [44863296125](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44863296125) (0.8.1)
- Related incident: [Reference Seed Coercion Incident & Recovery](REFERENCE_SEED_COERCION_INCIDENT_20261121.md)
- Regression tests: `apps/vehicle-contact/backend/gas/tests/sheet-store-text-coercion.test.mjs`, `apps/vehicle-contact/backend/gas/tests/vehicle-lookup-coercion-tolerance.test.mjs`
- Runtime SSOT: [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md)