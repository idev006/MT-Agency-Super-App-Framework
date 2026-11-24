# P6VC — Frontend redesign R3 (search / QR → vehicle card) evidence

**Date:** 2026-11-24 · **Frontend:** 0.8.1 → 0.8.2 · **Backend:** unchanged (V61 / 0.9.11)
Follows [FRONTEND_REDESIGN_R1_R2_EVIDENCE_20261124.md](FRONTEND_REDESIGN_R1_R2_EVIDENCE_20261124.md).

## 1. Defect found while redesigning

The plate search asked for a free-text **province code** and showed the example `TH-10`. The real business key stored in Firestore uses the reference-seed code (`10` = กรุงเทพมหานคร, `65` = พิษณุโลก, …).
- An officer who followed the example got **"ไม่พบยานพาหนะ"** for a vehicle that exists.
- Officers also cannot be expected to know any province code.

## 2. What changed

| Area | Change |
|---|---|
| Search | The province is picked by **Thai name** from a searchable list. The code sent is the reference code. The plate input and search button are larger (48 px). While the backend works (about 6 s), the page shows "อาจใช้เวลาหลายวินาที". |
| Province list | `src/domain/reference/provinces.js` holds the 77 provinces. It is static because search roles do not hold `references.registration`. A test parses backend `ReferenceSeedV1` and **fails on any drift**. |
| Vehicle card | The plate is drawn like a Thai plate with the province name. Brand, model and colour are on one line. **The coordinator section comes before photos and history.** The primary contact is listed first with a "ผู้ติดต่อหลัก" badge. Numbers show in Thai national format (081-234-5678). There is a full-width **"โทร"** button (`tel:` built only from valid E.164) on each contact. |
| Photos | Slots are named in Thai (ด้านหน้า, ด้านหลัง…) instead of codes. |
| QR page | The camera scan is the main action. Manual entry is folded under "สแกนไม่ได้? กรอกรหัส QR เอง". The token is still `type=password` and never placed in the URL. |
| Wiring | `contacts.read` / `photos.list` are **not needed**: `vehicles.lookup` / `vehicles.detail` / `qr.resolve` already return contacts and photo metadata through the same permission gates (`vehicleView`). |

## 3. Verification

| Check | Result |
|---|---|
| vitest | 36 files / **207 PASS** (new `vehicle-card-r3.test.js`, 8 tests including the seed-drift guard) |
| build | PASS |
| Browser, 375 px, stubbed backend | The search sent `vehicles.lookup {plate:"กข 1234", province:"65"}` after selecting "พิษณุโลก" by typing "พิษณุ". The card rendered with the primary contact first. There was no horizontal overflow. |
| axe WCAG 2.0/2.1 A+AA (corporate) | Search + vehicle card **0**. QR page (manual entry open) **0**, after fixing one label contrast. |

**Limits:**
- The data on screen was a **stubbed response**, not live data. Live lookup and the audit row in `vc_lookup_audit` are verified against Firestore in step 4 (L9).
- **Photo images are not shown.** No operation returns approved-vehicle image bytes to search roles; only `registrations.photo` exists, and only for approvers.
  - Showing them needs a new backend operation plus a PDPA decision on photo disclosure to field officers. That decision belongs to the owner and is not part of this slice.
