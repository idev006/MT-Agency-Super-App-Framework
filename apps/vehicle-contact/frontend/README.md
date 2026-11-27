# P6 Vehicle Contact Frontend

Vue 3 + Vite SPA เชื่อมต่อ `p6vc-core` ที่ `/api/frontend` โดยตรงผ่าน HTTPS. ตัว core ส่งต่อ operation ที่ยังย้ายไม่เสร็จไปยัง legacy API; เบราว์เซอร์ไม่เรียก GAS หรือ Cloudflare Worker. GAS API จัดการไฟล์รูปบน Google Drive ให้ backend เท่านั้น.

## UI/UX governance

ทุกหน้าใหม่และ redesign ต้องปฏิบัติตามเอกสาร SSOT ต่อไปนี้:

- [`../docs/FRONTEND_ENGINEERING_STANDARD.md`](../docs/FRONTEND_ENGINEERING_STANDARD.md)
- [`../docs/FRONTEND_COMPONENT_ARCHITECTURE_PATTERNS.md`](../docs/FRONTEND_COMPONENT_ARCHITECTURE_PATTERNS.md)
- [`../docs/FRONTEND_UI_UX_PRINCIPLES.md`](../docs/FRONTEND_UI_UX_PRINCIPLES.md)
- [`../docs/FRONTEND_DESIGN_SYSTEM_BLUEPRINT.md`](../docs/FRONTEND_DESIGN_SYSTEM_BLUEPRINT.md)
- [`../docs/FRONTEND_UI_COMPLIANCE_CHECKLIST.md`](../docs/FRONTEND_UI_COMPLIANCE_CHECKLIST.md)
- [`../docs/FRONTEND_ROLE_DELIVERY_BLUEPRINT.md`](../docs/FRONTEND_ROLE_DELIVERY_BLUEPRINT.md)
- [`../docs/FRONTEND_REFERENCE_REGISTER.md`](../docs/FRONTEND_REFERENCE_REGISTER.md)

## ขอบเขต POC

- เปลี่ยนธีม daisyUI 5.8.x ได้ทั้งหมดและบันทึกเฉพาะชื่อธีมใน `localStorage`
- เรียก `system.health` เพื่อพิสูจน์ browser CORS/API envelope
- เรียก `auth.login`, `auth.session` และ `auth.logout` ด้วยข้อมูลที่ผู้ใช้กรอกเอง
- Endpoint มาจาก build เท่านั้น (`VITE_CORE_API_URL`) และต้องตรงกับ core ใน trusted-endpoints contract
- เก็บ session token ใน `sessionStorage` เพื่อรองรับ refresh ภายใน tab และล้างเมื่อ sign out
- จดจำ username ได้ และมีตัวเลือก POC ให้จดจำ password พร้อมคำเตือนชัดเจน
- Dashboard และ sidebar สร้างเมนูจาก permission ที่ `auth.session` คืนมา โดย backend เป็น SSOT ของสิทธิ์
- แสดง logical error และ request ID สำหรับวิเคราะห์ปัญหา

SPA มี vehicle search และ QR resolver แล้ว โดย QR camera adapter เริ่มใช้งานกล้องเมื่อผู้ใช้กดเท่านั้น รองรับสลับ/เลือกกล้องและอ่านไฟล์ภาพแบบจำกัดชนิด/ขนาด พร้อมปิด decoder และ media tracks เมื่ออ่านสำเร็จ ล้มเหลว ซ่อนหน้า หรือออกจากหน้า การรองรับจริงบน Android/iOS ยังคงต้องมีหลักฐาน physical-device acceptance แยกจาก automated tests

## การพัฒนาบน localhost

ใช้ Vite และ Playwright กับ mock API เพื่อทดสอบโดยไม่ส่งคำขอไป cloud. หากต้องการเชื่อมต่อ DEV core จาก Vite ให้ตั้ง `VITE_CORE_API_URL` ตามผลของ `node ../../../scripts/print-core-frontend-url.mjs` ใน `.env.local` ที่ไม่ commit. Core อนุญาต CORS จาก localhost สำหรับการทดสอบนี้. ผลทดสอบ browser ปี 2026-11-18 ใน `../docs/FRONTEND_POC_EVIDENCE_20261118.md` เป็นประวัติของเส้นทางเดิม.

## เริ่มใช้งาน

```powershell
npm ci
$env:VITE_CORE_API_URL = (node ../../../scripts/print-core-frontend-url.mjs).Trim()
npm run dev
```

เปิด URL ที่ Vite แสดง แล้วกด **ทดสอบการเชื่อมต่อ** ก่อนทดลอง login ด้วยบัญชีสังเคราะห์บน DEV. สำหรับการทดสอบแบบไม่แตะระบบ cloud ให้ใช้ `npm run test:e2e` ซึ่งสกัดทุกคำขอออกนอกเครื่องและตอบด้วย mock API.

### Local visual QA โดยไม่ใช้บัญชีจริง

ตั้ง `VITE_UI_PREVIEW=true` เฉพาะตอนรัน Vite development server เพื่อเปิด shell ด้วยข้อมูลสังเคราะห์สำหรับตรวจ responsive layout และ theme โหมดนี้ทำงานเฉพาะเมื่อ `import.meta.env.DEV` เป็นจริง ไม่บันทึก session token และไม่เรียก backend

## ตรวจสอบก่อนส่งงาน

```powershell
npm test
npm run build
npm run preview
```

## GitHub Pages

Pages workflow เดิม build SPA และรวม `dist/` เข้า artifact ที่ path:

```text
/MT-Agency-Super-App-Framework/apps/vehicle-contact/frontend/
```

URL หลัง merge เข้า `main` คือ `https://idev006.github.io/MT-Agency-Super-App-Framework/apps/vehicle-contact/frontend/` โดยใช้ workflow เดิมเพียงตัวเดียวเพื่อไม่ให้ deployment แข่งขันกัน

## End-to-end tests (Playwright)

`npm run test:e2e` starts the app on port 4317 and drives a real Chromium browser at **desktop 1280×800**
and **phone 375×812** against an in-memory **mock API** (`e2e/mock-api.js`). Every test gets the mock
automatically and every other host is blocked, so nothing reaches the live system and no credentials are
needed. First time: `npx playwright install chromium`.

Covered: sign-in, admin lists (server filters, drawers, create dialogs), audit, vehicle detail tabs, QR
card, QR print page, the sticker link `#/q/<code>` (no API call before sign-in), the owner's table rules
(every column ≤ 350px, short values never wrap, no sideways page scroll) and axe accessibility
(serious/critical). CI runs it on every pull request (`validate-p6vc.yml`); on failure the HTML report
and traces are uploaded as the `p6vc-e2e-report` artifact.
