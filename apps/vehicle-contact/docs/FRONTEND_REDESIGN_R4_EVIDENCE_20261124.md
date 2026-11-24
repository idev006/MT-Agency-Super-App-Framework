# P6VC — Frontend redesign R4 (stepped registration intake) evidence

**Date:** 2026-11-24 · **Frontend:** 0.8.2 → 0.8.3 · **Backend:** unchanged (V61 / 0.9.11)
Follows [FRONTEND_REDESIGN_R3_EVIDENCE_20261124.md](FRONTEND_REDESIGN_R3_EVIDENCE_20261124.md).

## 1. What changed

| Area | Change |
|---|---|
| Flow | One long form became 5 steps: แคมเปญ → ข้อมูลรถ → ผู้ประสานงาน → ภาพหลักฐาน → ตรวจทานและส่ง. Each step is checked before "ถัดไป" works: the campaign must be validated, required fields filled, and all 5 valid photos chosen. Inputs stay mounted (`v-show`), so going back keeps the data. |
| Review | The last step lists every value with its **Thai label** (not codes) plus the 5 thumbnails. It replaces the old confirm dialog. |
| Photos | Each slot shows a preview (object URL, revoked on change and unmount). A wrong type or a file over 5 MB is flagged **when picked**, in Thai. Upload progress shows "อัปโหลดภาพ n / 5". |
| Phone | Staff type `081-234-5678`. The app stores E.164 (`+66812345678`) and shows what will be saved. |
| Uncertain outcome | **Safety fix.** The old screen said "ห้ามส่งซ้ำทันที" and gave no safe way forward. Now the form is **locked**, and the only action is "ส่งซ้ำด้วยข้อมูลเดิม". It resends the **identical payload with the same idempotency key**, without re-uploading photos. The backend (0.9.11, G7 C1 fix) then replays the committed request instead of creating a second one. A changed payload under the same key would be refused (`IDEMPOTENCY_CONFLICT`), which is why editing is locked. |
| Next vehicle | "รับคันถัดไป (แคมเปญเดิม)" keeps the validated campaign, province, types and organisation. It clears plate, model, contact and photos, and makes no extra API call. |

## 2. Verification

| Check | Result |
|---|---|
| vitest | 37 files / **212 PASS**. New `registration-intake-r4.test.js` (5 tests): identical payload and key on resend, 5 uploads only, new key after success, campaign kept, phone conversion, photo checks. |
| build | PASS |
| Browser at 375 px, stubbed backend, full flow | The step-0 gate blocked without a validated campaign; the step-1 gate blocked empty fields. Phone `081-234-5678` was sent as `+66812345678`; province `65`. The first submit dropped (network) → `uncertain`, with the form locked and "ย้อนกลับ" disabled. The resend sent **2 submits with the same key and byte-identical payload**, 5 uploads total → success card. "รับคันถัดไป" went to step 2 with the campaign and province kept and no API call. |
| axe WCAG 2.0/2.1 A+AA (corporate) | Review step **0**; after "รับคันถัดไป" **0**; no horizontal overflow |

**Limits:**
- All screens were checked with a **stubbed backend**.
- The live submit, the Firestore request row, the 5 photos `CLAIMED` and the 5 Drive files are checked in step 4 (L9) against the SSOT.
