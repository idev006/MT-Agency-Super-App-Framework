# P6 Vehicle Contact Frontend POC

Vue 3 + Vite SPA สำหรับพิสูจน์การเชื่อมต่อจากเบราว์เซอร์ไปยัง GAS Backend API โดยตรง

## ขอบเขต POC

- เปลี่ยนธีม daisyUI 5.8.x ได้ทั้งหมดและบันทึกเฉพาะชื่อธีมใน `localStorage`
- เรียก `system.health` เพื่อพิสูจน์ browser CORS/redirect/API envelope
- เรียก `auth.login`, `auth.session` และ `auth.logout` ด้วยข้อมูลที่ผู้ใช้กรอกเอง
- เลือก transport ได้ทั้ง Direct GAS และ Cloudflare Worker `/api/frontend`
- เก็บ session token ใน `sessionStorage` เพื่อรองรับ refresh ภายใน tab และล้างเมื่อ sign out
- จดจำ username ได้ และมีตัวเลือก POC ให้จดจำ password พร้อมคำเตือนชัดเจน
- ไม่ใช้ Cloudflare bridge key ใน SPA
- Dashboard และ sidebar สร้างเมนูจาก role ใน Pinia โดย GAS เป็น SSOT ของสิทธิ์
- แสดง logical error และ request ID สำหรับวิเคราะห์ปัญหา

POC นี้ยังไม่มี vehicle search หรือ QR scanner ใน SPA เมนูเหล่านั้นแสดงเป็นงานลำดับถัดไป

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
