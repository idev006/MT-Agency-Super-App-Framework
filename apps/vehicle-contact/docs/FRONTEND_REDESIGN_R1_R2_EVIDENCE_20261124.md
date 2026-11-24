# P6VC — Frontend redesign R1 (sign-in) + R2 (role home) evidence

**Date:** 2026-11-24 · **Frontend:** 0.8.0 → 0.8.1 · **Backend:** unchanged (V61 / 0.9.11, no GAS push needed)
**Owner direction (step 3):** "redesign frontend ui/ux then wired to backend".

## 1. What changed

| Slice | Change | Why |
|---|---|---|
| R1 | Sign-in shows product wording ("เข้าสู่ระบบ", what the system is for, "ใช้เฉพาะเจ้าหน้าที่") plus a visible **"ระบบทดสอบ · ข้อมูลสมมติเท่านั้น"** badge. The developer copy ("APPLICATION SHELL", "ยืนยันตัวตนกับ GAS", "บัญชี development", the SPA→WORKER→GAS strip) is gone. | End users should not see infrastructure. |
| R1 | The connection selector moved into a collapsed **"ตั้งค่าการเชื่อมต่อ (สำหรับผู้ดูแลระบบ)"** panel. It opens by itself when the endpoint is invalid. | Keeps the fallback for support without blocking normal users. |
| R1 | A first visit defaults to the **Cloudflare Worker** when the build sets a valid Worker URL. A choice saved on the device still wins. | The Worker is the origin-locked, allowlisted path. |
| R1 | The Pages build now sets `VITE_WORKER_API_URL` and `VITE_GAS_API_URL` (public endpoints). | Before this, the Pages build had no default endpoint, so every user had to paste a URL by hand. |
| R1 | Thai sign-in errors that say what to do next for `INVALID_CREDENTIALS`, `LOGIN_RATE_LIMIT`, `NETWORK_ERROR` and `HTTP_5xx`. The error code stays visible in small text. | Users need to know what to do next. |
| R2 | Role home has a new **"งานรอดำเนินการ"** section. It counts pending registrations (`vehicle.registration.approve`) and pending change requests (`vehicle.change.approve`), each linking to its queue. | Staff see waiting work first. |
| R2 | Each count asks for `pageSize 1` and reads `total` from the paginated contract. Each count has its own loading skeleton, and a failed count shows an error with a retry button, never a fake 0. | p50 latency is about 6 s, so loading and error states must be honest. |
| a11y | Contrast fixes on the sign-in badge, connection hints and footer labels. Errors use a solid `alert-error`. | axe WCAG 2.1 AA |

## 2. Wiring proof (before change)

- The live Worker (`/api/frontend`, Origin `https://idev006.github.io`) answers `system.health` with `backendVersion 0.9.11` and `persistence.engine firestore`.
- Sessionless `registrations.listPending`, `changes.listPending` and `vehicles.listMine` all reach the session check (`INVALID_SESSION_PAYLOAD`). None is refused by the allowlist.
- Worker allowlist vs frontend: **all 53 frontend operations are allowlisted** (diff of `worker.mjs` `FRONTEND_PAYLOAD_FIELDS` vs frontend sources = empty).

## 3. Verification

| Check | Result |
|---|---|
| `npm test` (vitest) | 35 files / **199 tests PASS** (new `role-home-and-sign-in.test.js` has 7 tests) |
| `npm run build` | PASS |
| `validate-ssot.mjs` | PASSED |
| axe WCAG 2.0/2.1 A+AA, default theme `corporate`, sign-in (connection panel open) | **0 violations** |
| axe, dashboard: loading, error and ready states | **0 violations** in each |
| Mobile 375 px | no horizontal overflow |

**Honest limits:**
- The "ready" dashboard state was checked with a **stubbed fetch in the browser** (3 and 0 items), not live data.
- The live count against Firestore is part of step 4 (L9 E2E with SSOT read-back).
- Other DaisyUI themes still have a **systemic** contrast gap: opacity text such as `text-base-content/70` fails in about 15 of 35 themes. This was already true before this change and is planned as a design-token slice.
