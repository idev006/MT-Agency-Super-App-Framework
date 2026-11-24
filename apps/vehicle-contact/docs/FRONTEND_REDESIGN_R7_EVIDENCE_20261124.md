# P6VC — R7: owner review of the live UI (alignment, tabs, registry, vehicle detail + photos)

**Date:** 2026-11-24 · **Frontend:** 0.8.6 → 0.8.7 · **Backend:** 0.9.15 → 0.9.16 · **Worker:** allowlist + `vehicles.photo`
Owner feedback on the live system:
1. Does the database match "no pending requests"?
2. How is the approved-vehicle registry page?
3. Why does the detail page show no vehicle photos, and is the information enough to decide?
4. The search button "drops" below the inputs, and this happens in many places.
5. Use tabs.

## 1. Answers from the SSOT (Firestore, independent SA read, 11:35Z)

| Screen says | Firestore |
|---|---|
| ไม่มีคำขอลงทะเบียนที่รอตรวจสอบ | `PENDING_APPROVAL` **0** (APPROVED 33, REJECTED 29) ✅ |
| ไม่มีคำขอเปลี่ยนแปลงที่รอตรวจสอบ | `PENDING` **0** (APPROVED 11) ✅ |

## 2. Changes

| # | Change |
|---|---|
| 4 | **Alignment fixed at the root.** Inline rows used a guessed `md:mt-8` offset and mixed control heights. A shared `.p6-form-row` now uses **CSS subgrid**: every cell shares the label / control / help tracks, and all controls are 3rem high. Applied to vehicle search, QR manual entry and the intake campaign row. Measured in the browser: inputs and button **414–462 px, identical**; QR row identical. |
| 5 | **Tabs:** vehicle detail (ข้อมูลรถ / ผู้ประสานงาน / ภาพหลักฐาน / ประวัติ) and vehicle maintenance (ข้อมูลรถ / ผู้ประสานงาน / รูปประกอบ / ยกเลิกรถ). Inactive tab text raised to AA. |
| 3 | **Vehicle photos.** New backend op `vehicles.photo` (permission `vehicle.photos.read`, the permission that already listed them): only an ACTIVE photo of an ACTIVE vehicle; every view is logged in `vc_lookup_audit` (`PHOTO`), not in the change history. Wired through the contracts (57 routes), the RBAC matrix, the Worker allowlist (+ test) and G6 coverage (`VEHICLES.PHOTO`). The 5 photos load in parallel when the tab is opened and stay in memory. |
| 3 | **Decision facts.** The view adds the **registering agency name**, the registration (approval) and last-update dates, the **active QR status + issue date**, and the data version. These are equality-only reads in the same parallel round, so no new composite index. The detail header shows the plate, status and QR badge. |
| 2 | **Registry.** A **table** on wide screens (plate / province / brand-model / colour / status / approved at / action) and plate cards on phones, plus "ค้นหาทะเบียนเฉพาะคัน". Detail links carry `?from=registry`, so the breadcrumb and back button return to the registry. |

## 3. Verification

| Check | Result |
|---|---|
| FE vitest | 40 files / **239 PASS** |
| FE build | PASS |
| BE `npm run check` | EXIT 0 (+ VIEW-03 `vehicles.photo`, VIEW-04 agency/dates/QR; inventory 56 → 57; RBAC 255 checks) |
| Worker tests | 32/32 PASS (new: exact-DTO allow + 2 rejects) |
| Browser (preview session, stubbed backend) | detail tabs show the facts with Thai labels, agency, dates and version; the photo tab made **5 parallel `vehicles.photo` calls** and rendered all images; breadcrumb "ทะเบียนยานพาหนะ" |
| axe WCAG A/AA (corporate) | search **0** · detail with photos **0** (after the tab-contrast fix) |

**Limits:**
- The maintenance tabs are covered by the contract test only (the preview account lacks `vehicle.update`).
- The registry table and the photo tab are not yet checked on live data. They will be after deploy.
- The registry still lists codes for the DEV seed vehicles (`TH-10`, `SEDAN`, `WHITE`). Those are seed-data codes outside the reference catalog, not a UI defect.

## 4. Deploy order

1. Merge.
2. Owner `PUSH_VEHICLE_GAS` → GAS V66.
3. `wrangler deploy` of the Worker allowlist. Self-serve is authorised: see CODE_MAP "Worker deploy".
4. G6 (now 57 ops) + SSOT scenarios.
5. Live check of the photo tab.
