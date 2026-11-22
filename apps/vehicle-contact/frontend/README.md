# P6 Vehicle Contact Frontend POC

Vue 3 + Vite SPA สำหรับพิสูจน์การเชื่อมต่อจากเบราว์เซอร์ไปยัง GAS Backend API ทั้งโหมดทดลองโดยตรงและโหมดหลักผ่าน Cloudflare Worker

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
- เรียก `system.health` เพื่อพิสูจน์ browser CORS/redirect/API envelope
- เรียก `auth.login`, `auth.session` และ `auth.logout` ด้วยข้อมูลที่ผู้ใช้กรอกเอง
- เลือก transport ได้ทั้ง Direct GAS และ Cloudflare Worker `/api/frontend`
- เก็บ session token ใน `sessionStorage` เพื่อรองรับ refresh ภายใน tab และล้างเมื่อ sign out
- จดจำ username ได้ และมีตัวเลือก POC ให้จดจำ password พร้อมคำเตือนชัดเจน
- ไม่ใช้ Cloudflare bridge key ใน SPA
- Dashboard และ sidebar สร้างเมนูจาก permission ที่ `auth.session` คืนมา โดย GAS เป็น SSOT ของสิทธิ์
- แสดง logical error และ request ID สำหรับวิเคราะห์ปัญหา

SPA มี vehicle search และ QR resolver แล้ว โดย QR camera adapter เริ่มใช้งานกล้องเมื่อผู้ใช้กดเท่านั้น รองรับสลับ/เลือกกล้องและอ่านไฟล์ภาพแบบจำกัดชนิด/ขนาด พร้อมปิด decoder และ media tracks เมื่ออ่านสำเร็จ ล้มเหลว ซ่อนหน้า หรือออกจากหน้า การรองรับจริงบน Android/iOS ยังคงต้องมีหลักฐาน physical-device acceptance แยกจาก automated tests

## ผล browser integration ล่าสุด

วันที่ 2026-11-18 ทดสอบจาก Brave ที่ origin `http://127.0.0.1:5173` แล้ว Direct GAS ยังไม่ผ่าน browser gate แต่ Cloudflare Worker mode ผ่านครบ `auth.login` → `auth.session` → Dashboard ด้วย role `SYSTEM_ADMIN` ดูหลักฐานที่ `../docs/FRONTEND_POC_EVIDENCE_20261118.md`

Source ของ Cloudflare BFF endpoint อยู่ที่ `../../../tools/p6vc-api-test-console/worker.mjs` เส้นทาง `/api/frontend` และตั้ง `VITE_WORKER_API_URL` ให้ชี้มายังเส้นทางนี้

## เริ่มใช้งาน

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

เปิด URL ที่ Vite แสดง แล้วกด **ทดสอบการเชื่อมต่อ** ก่อนทดลอง login

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
