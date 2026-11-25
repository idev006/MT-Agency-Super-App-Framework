# UI audit: Initial System Admin (2026-11-25)

**Owner request:** "คุณตรวจ ui ทั้งหมดของ Initial System Admin (ผู้ดูแลระบบ) เองได้เลย ถือเป็นการสำรวจ เพื่อเข้าใจ และประโยชน์ในการ refac redesign ไปด้วย"

**How it was run**
- Local FE 0.9.0 (`localhost:5173`, same code as Pages) → Worker → **Cloud Run (Bangkok)** → Firestore `(default)`.
- Account: the synthetic automation account, roles SYSTEM_ADMIN + REGISTRATION_ADMIN, 17 menu entries.
- Login was done by script, so no password was ever typed into a page. Only the session token was handed to the localhost page, and it was revoked by logging out at the end.
- Viewports: desktop and 375 × 812 (mobile).
- Synthetic DEV data only. Read-only: nothing was created or changed.

## 1. Speed (measured in the browser unless noted)

| What | Measured | Note |
|---|---|---|
| Page frame (heading visible) | **≈ 50 ms** | Every page except vehicle search |
| Vehicle search heading | **≈ 1,000 ms** | The page waits for reference data (provinces/brands) before rendering. Should render first and load lists in the background. |
| List pages (users, orgs, campaigns, registry) | **0.45–0.82 s** (1 API call) | Mostly server time of the list operation |
| Dashboard | 2 calls in parallel, ≈ 0.6 s | |
| Vehicle detail | 1.4 s for the detail call | Slower than the server's 0.26 s for the same operation (see concurrency below) |
| Vehicle photos (5, parallel, Drive bridge) | **all 5 visible after 3.9 s** | The accepted trade-off of VC-ADR-034 |
| Worker hop (Node, 10 samples) | +≈ 80 ms per call | health: 117 ms via Worker vs 35 ms direct |

**Finding (performance):**
- Cloud Run runs with **concurrency 1**, because the business code is synchronous.
- Parallel requests (5 photos, dashboard) therefore need several instances, and new instances pay a cold start.
- Fix options:
  1. Async I/O in the Node host, which allows concurrency > 1. Best.
  2. `min-instances` 1–2. Costs money.

## 2. Findings by severity

### P1: correctness and data quality
1. **Inconsistent labels:** the registry table shows the colour code (`WHITE`, `BLACK`, `SILVER`), while vehicle detail shows the Thai label (`ขาว`). Every list must use the same label mapping as detail.
2. **Test residue clutters admin screens:**
   - Users: dozens of suspended `P6VC Automated …` accounts.
   - Organizations: 60, mostly test.
   - Campaigns: 52, mostly revoked and unnamed.

   Needed:
   - default filters (active only);
   - a gated cleanup of synthetic residue;
   - live runners must leave no residue in lists (or tag it so it can be hidden).
3. **Audit page is not usable by people:**
   - it asks for a raw *vehicle id*;
   - it exports "JSON";
   - its description mentions "browser storage".

   It should search by plate + province (shared vehicle finder) and export a human-readable file (CSV/Excel).

### P2: pattern consistency
4. **Three list patterns:**
   - table: registry, users, audit, about;
   - `list-row`: organizations, review queues, retention, my vehicles;
   - cards: campaigns.

   Registry and users switch to cards on phones, which contradicts the owner's rule: **tables on desktop and phone, with horizontal scroll**.
5. **The context strip repeats on 15 pages** (role / system status / session expiry). On a phone, content starts at y ≈ 310 px of 812 (38 % of the first screen). That information now lives on the About page; keep only a compact session indicator in the header.
6. **The dashboard duplicates the menu:** 16 cards under "งานทั้งหมดของคุณ", each with an identical "พร้อมใช้" badge. The dashboard should show pending work and key counts only.
7. **The users page stacks three forms below the list** (actions, create, manage), so the user scrolls far and actions are not attached to rows. Pattern: a table with row actions, plus "สร้างบัญชี" opening a dialog or drawer.
8. **Loading states differ:** some pages use a skeleton, others a spinner (the registry leaves a spinner). One `PageState` component is needed.
9. **Status badges wrap on phones:** "ระงับการใช้งาน" breaks onto 3 lines. Badges must be `nowrap`.
10. **Technical words remain:**
    - "backend" and "session" (settings);
    - "Audit" in the menu title;
    - "JSON", "browser storage" (audit);
    - the Google-link alert mentions "Google Identity widget / client".

    The wording guard test should cover these too.
11. **Campaigns have no filter** (open / not started / expired / revoked), and the list is mostly revoked.

### P3: smaller
12. QR governance and Audit each have their own "find the vehicle" step. One shared **VehicleFinder** (plate + province combobox, the same as vehicle search) is needed.
13. **Security (DEV only):** the Worker accepts any `http://localhost:<port>` origin. Restrict it before production.

**What works well:**
- No horizontal overflow on any page at 375 px.
- Breadcrumbs, page titles and pagination are consistent.
- The vehicle detail tabs (facts / contacts / photos / history) are clear.
- The About page and footer behave as designed.

## 3. Redesign plan (proposal; each phase is one reviewable PR)

| Phase | Scope | Fixes |
|---|---|---|
| D1 | Design-system components: `DataTable` (sticky first column + header, horizontal scroll, row actions), `StatusBadge` (one vocabulary + colours), `PageState` (loading/empty/error/forbidden), `FilterBar`, `FormDialog`, `VehicleFinder`, compact page header (no context strip). Short UI guideline in docs + guard tests. | 4, 5, 8, 9, 10 |
| D2 | Admin lists: users, organizations, campaigns → table + filters (default active) + row actions + create dialog | 2, 7, 11 |
| D3 | Review queues: registration, change, retention → table + detail drawer | 4 |
| D4 | Registry/detail/audit/QR governance → VehicleFinder, labels everywhere, audit search by plate + CSV | 1, 3, 12 |
| D5 | Dashboard: pending work + counts only | 6 |
| Ops | Synthetic residue cleanup (gated, owner-approved); runners tag or clean their records | 2 |
| Perf | Async Node host → Cloud Run concurrency > 1; render vehicle search before reference data | §1 |

**Evidence limits:**
- Measurements come from one machine in Thailand, one session, synthetic data.
- No accessibility scan was run in this pass. Axe was used in earlier slices; D1 should re-run it.
