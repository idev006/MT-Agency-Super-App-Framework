# P6VC — Step 4: integration test through the real UI, verified at the SSOT

**Date:** 2026-11-24 · **Stack under test:** GitHub Pages frontend 0.8.4 → Cloudflare Worker → GAS V63 / 0.9.13 → Firestore DEV + Google Drive
**Owner direction:** "ทำ intrigate test และ บันทึกผล" · "ทุกอย่างอย่าเชื่อ api รายงาน ให้ไปตรวจสอบที่ SSOT".
**Session:** the owner signed in as admin in the app's browser pane. The assistant never types passwords or secret tokens into a hosted page. The owner pasted the campaign token in step 1 of the intake; everything else was driven by the assistant. All data is synthetic.

## 1. Pre-conditions (live, same day)

- G6 on V63: **103/103** (DATA_PROOF), p50 6,024 / p95 13,862 ms.
- SSOT scenarios on V63: **9/9 PASS**, including **C4** (approve ∥ reject → REJECTED + 0 vehicles) and **C6** (3 concurrent change approvals → version +2 exactly, 1 audit row per change). Cleanup 0 failed.
- Evidence: [BACKEND_FIRESTORE_LIVE_CUTOVER_EVIDENCE_20261123.md](BACKEND_FIRESTORE_LIVE_CUTOVER_EVIDENCE_20261123.md) §5.14.

## 2. Flow through the UI and the SSOT read-back after each write

| # | UI action | Screen | Firestore (independent SA read) | Drive |
|---|---|---|---|---|
| 1 | Dashboard | pending registrations 0, changes 0 | 0 / 0 ✅ | — |
| 2 | Create campaign (max 5) | one-time token shown | ACTIVE, max 5, count 0. Only `token_digest` stored; the raw token is not stored ✅ | — |
| 3 | Intake, 5 steps (plate ฮฮ 0154, พิษณุโลก, 5 synthetic JPEGs, phone typed `081-000-0099`) | review step with Thai labels → "ส่งคำขอแล้ว" | request `PENDING_APPROVAL`; province `65`; phone `+66810000099`; 5 photos `image/jpeg`; 5 staging `CLAIMED`; campaign count **1/5**; 1 idempotency row ✅ | **5/5 files** exist, not trashed, same folder, `image/jpeg`, **byte sizes equal** Firestore (12,408 / 11,935 / 12,679 / 10,259 / 11,310) ✅ |
| 4 | Dashboard | pending registrations **1** | matches ✅ | — |
| 5 | Review → open detail → photos → approve | Thai labels; the 5 photos rendered from Drive show exactly what was uploaded; QR shown once with a copy button | request `APPROVED`; vehicle `ACTIVE` v1; 5 photos `ACTIVE` with the **same storage refs**; 1 primary contact; 1 `ACTIVE` QR; audit `REGISTRATION_PHOTO_VIEWED` ×5 + `REGISTRATION_APPROVED` ×1; journals submit + review `APPLIED` ✅ | same 5 files ✅ |
| 6 | Search: plate + province picked by Thai name | card found; call button `tel:+66810000099` | exactly **1** `vc_lookup_audit` row (`PLATE:FOUND`) ✅ | — |
| 7 | Edit vehicle model (maintenance page) | version shown as 2 | model updated; version **2**; other fields untouched; 1 `VEHICLE_UPDATED` audit ✅ | — |
| 8 | Cleanup: cancel vehicle; revoke both campaigns | success messages | vehicle `INACTIVE` v3; QR `REVOKED`; retention job `WAITING_RETENTION`; 0 active campaigns; active vehicles back to 10 ✅ | files kept (retention is BLOCKED on D5+B3) |

**Not driven through the UI:** QR resolve (it needs the one-time QR token typed into a hosted page) and owner-role change submit (the admin account has no `vehicle.change.submit`). Both are proven live at API level (G6, S4, C6).

## 3. Measured latency (browser, real stack)

| Action | Time | Note |
|---|---|---|
| Campaign validate | 4.4–4.6 s | |
| **Intake submit** | **≈ 46 s** | 5 photo uploads **one after another** (6.7–9.4 s each) + submit 6.6 s → **fix: upload in parallel (expect ≈ 15 s)** |
| Review detail photos | ≈ 30 s for 5 | loaded one by one → **fix: parallel** |
| Approve | ≈ 5 s | |
| Plate search | **11.9 s** | `vehicles.lookup` then `vehicles.history`, sequential → **fix: one call or parallel** |
| Dashboard counts | 5.2 s | |

## 4. UI/UX findings from the real run (prioritised)

**P1 — correctness or task failure**
1. **The one-time campaign token is easy to lose.** It has no copy button and no warning before leaving the page. This happened during this test, and a second campaign was needed.
2. **The vehicle card shows codes, not labels** (`RY01`, `WHITE`, `OWNER`). Search roles cannot load the reference catalog. Fix: the backend returns labels in the vehicle view, or a public label catalog is used.
3. **History is empty for a newly approved vehicle.** The approval audit is stored under the *request* id, while `vehicles.history` reads by *vehicle* id. Fix: include the registration events (or also audit under the vehicle id).
4. **The maintenance page edits raw codes** (province `65`, type `RY01`, colour `WHITE`, owner by raw user id, phone in E.164) as free text, and shows **no success message** after saving.

**P2 — speed**

5. Parallel photo upload (intake) and parallel photo load (review).
6. Search: the history call should not delay the vehicle card.

**P3 — clarity and layout**

7. The campaign list is oldest-first, so a new campaign lands on the last page. Campaigns also have **no name**, and the status "สิ้นสุด/เพิกถอน" merges two states.
8. The header shows a technical user id (`6e95a05c…`). The dashboard lists "ภาพรวม" (itself) and "ตรวจสอบการเชื่อมต่อ" (a developer tool) as work items.
9. On mobile, the context strip (roles / connection / session end) takes about a third of the first screen on **every** page. It should collapse.
10. In the cancel-vehicle dialog, "ยกเลิก" (close) sits beside "ยืนยันการยกเลิก" (cancel the vehicle). The same word means two things.
11. A new browser tab requires signing in again (per-tab session, by design for security). This should be stated on the sign-in page.

## 5. Verdict

**Data correctness through the real UI: PASS.** Every write was confirmed in Firestore, every photo was confirmed in Drive, and every count matched the SSOT.

**Ready for real users: NOT YET.** P1 items 1–4 and the P2 latency items need fixing first. Real-data go-live also stays blocked on the legal/DPO gates (#55).

## 6. Fixes for P1 + P2 (FE 0.8.5 / backend 0.9.14, offline-proven; live re-run pending deploy)

| Finding | Fix | Proof |
|---|---|---|
| P1.1 one-time secrets lost | A **copy** button for the campaign token. While the campaign token or the approval QR is on screen, leaving the page (route change, reload, tab close) asks for confirmation. The campaign status is split into เปิดรับอยู่ / ยังไม่เริ่ม / เต็มโควตา / หมดเวลาแล้ว / เพิกถอนแล้ว. | FE tests (status matrix, guard wired on both pages) |
| P1.2 codes on the vehicle card | The backend view returns `labels` (vehicle type / colour / plate type) read by reference id in the **same parallel round** (no new composite index: live has none for catalog/vehicle_id queries). Relationship labels come from a static FE list with a **drift test** against the backend seed. | BE `VIEW-01/02`; FE mapper + seed-drift tests |
| P1.3 empty history | The approval is also audited under the **vehicle id** (same commit). The view embeds history (sanitised: no actor ids). | BE `VIEW-01` |
| P1.4 maintenance page | Province / plate type / vehicle type / colour are **selects with Thai labels** (an unknown current value is kept as "(ค่าเดิม)"). The phone is typed in Thai format and converted to E.164 with an inline error. A **success message** shows after each save. The cancel dialog reads "ยืนยันยกเลิกยานพาหนะ" / "ไม่ใช่ กลับไป". | FE contract test |
| P2 intake 46 s | The 5 uploads run **in parallel**. Successful ones are kept, so a retry resends only the failed slot. | FE test: peak 5 concurrent, retry = 1 extra upload |
| P2 review photos 30 s | Loaded in parallel. | FE test: peak 5 |
| P2 search 11.9 s | History is embedded in `vehicles.lookup` / `vehicles.detail` / `qr.resolve`: **1 call instead of 2**. Older backends fall back to the separate call. | FE repository tests |

**Not changed (noted):**
- `vehicles.lookup` still scans `vc_vehicles` and filters in memory. It is fine at DEV size; a query by plate needs a composite index or an equality-only query and is planned separately.
- The campaign list order (P3) is unchanged.
