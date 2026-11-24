# P6VC — Frontend redesign R5 (review queues) evidence

**Date:** 2026-11-24 · **Frontend:** 0.8.3 → 0.8.4 · **Backend:** unchanged (V61 / 0.9.11)
Follows [FRONTEND_REDESIGN_R4_EVIDENCE_20261124.md](FRONTEND_REDESIGN_R4_EVIDENCE_20261124.md).

## 1. What changed

| Page | Change |
|---|---|
| Registration review | Values show **Thai labels** instead of reference codes: province, vehicle type, plate type, brand, colour, relationship. The phone shows in national format. The status badge reads "รอตรวจ". Each queue item shows its age ("รอ 5 ชม."). The one-time QR token has a **copy** button, and the note says how to recover if it is missed (an admin reissues it at "จัดการ QR"). |
| Registration review: uncertain outcome | The old copy said "ห้ามกดซ้ำ ให้โหลดรายการใหม่". The page now offers **"ส่งการตัดสินใจเดิมซ้ำ"**, which resends exactly `{requestId, decision, platePhotoVerified}`. This is safe because `registrations.review` replays an APPLIED decision and returns the **same deterministic QR token** (`reviewResult` + `reviewToken`, verified in source). A different decision is never offered. |
| Change review | The title shows plate + Thai province instead of the vehicle id. Rows read old value (struck through) → new value, and phones are formatted. The badge reads "รอตรวจ". |
| Change review: uncertain outcome | The page offers **"ตรวจสถานะคำขอ"**, which re-reads the queue and reports one of: `decided` (gone from the only page), `still-pending` (safe to decide again) or `unknown` (other pages exist). The decision is **never resent** automatically. |

## 2. Backend defect found (not fixed in this FE slice)

Reading `changeReview` (VehicleOperations.js) while designing the retry showed it is **not idempotent and not atomic**:
- It makes 3 separate writes: the vehicle `version+1`, the primary contact, and the request status.
- It has no `updateTime` precondition.

This is the suspected **C6** case in [TEST_SUITE_SSOT_DESIGN_20261124.md](TEST_SUITE_SSOT_DESIGN_20261124.md).

**Risks:**
- Two concurrent approvals can both pass the `PENDING` check and apply twice.
- A failure mid-way can leave the vehicle updated while the request is still `PENDING`.

**Fix needed:** the same pattern as `commitReview`/0.9.11. Use one `writeMany` with `ifVersion` on the change request (and the vehicle), and replay an already-applied same decision. Then prove it with a live C6 race. This needs a GAS push (`PUSH_VEHICLE_GAS`).

## 3. Verification

| Check | Result |
|---|---|
| vitest | 38 files / **217 PASS**. New `review-queues-r5.test.js` (5 tests): identical resend + replayed QR shown; change outcome decided / still-pending / unknown; the change page never resends. |
| build | PASS |
| Browser, stubbed backend: registration | Thai labels rendered (พิษณุโลก, รถเก๋ง / รถส่วนบุคคล, Toyota · ขาว, เจ้าของ, 081-234-5678). Approve → dropped → "ส่งการตัดสินใจเดิมซ้ำ" sent **2 identical** `registrations.review` calls → QR alert shown. |
| Browser, stubbed backend: change | The diff showed `081-234-5678 → 089-876-5432` and `Yaris → Yaris Ativ`. Approve → dropped → "ตรวจสถานะคำขอ" → "ระบบบันทึกผลการตัดสินใจไปแล้ว", with exactly **1** `changes.review` call (no resend). |
| axe WCAG 2.0/2.1 A+AA (corporate) | Both pages, detail open: **0** |

**Limit:** all checks used a stubbed backend. Live decisions are checked against Firestore in step 4.
