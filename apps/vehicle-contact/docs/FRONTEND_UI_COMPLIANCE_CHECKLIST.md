# P6 Vehicle Contact — Frontend UI Compliance Checklist

**Document ID:** P6VC-FE-QA-001

**Status:** REQUIRED MERGE GATE

**Version:** 1.0 — 2026-11-18

## 1. How to use

Checklist นี้ใช้กับหน้าใหม่ redesign และ shared component ที่กระทบหลายหน้า Reviewer ต้องระบุผลเป็น `PASS`, `FAIL`, `BLOCKED` หรือ `NOT RUN` พร้อมหลักฐาน ห้ามใช้ความเห็นว่า “ดูสวยแล้ว” แทนผลตรวจ

Blocking gate ที่เป็น `FAIL`, `BLOCKED` หรือ `NOT RUN` ห้าม merge เว้นแต่ Project Owner อนุมัติ exception เป็นลายลักษณ์อักษรพร้อมขอบเขตและวันหมดอายุ

## 2. Required evidence header

```text
Feature/page:
Role and permission fixture:
Commit SHA:
Environment/URL:
Browser and OS:
Themes tested:
Viewports tested:
Reviewer:
Review date (Asia/Bangkok):
Known exclusions:
```

## 3. Gate matrix

### G1 — User task and content — BLOCKING

- [ ] ชื่อหน้าบอกงานหรือผลลัพธ์ของผู้ใช้
- [ ] primary action มีหนึ่งกลุ่มและใช้คำกริยาชัดเจน
- [ ] ไม่มี `PageComponent`, `AppShell`, API operation หรือ developer explanation ใน UI
- [ ] เมนู ปุ่ม error และ help เป็นภาษาไทยก่อน
- [ ] technical code อยู่ใน support detail เมื่อจำเป็น
- [ ] loading, empty, forbidden และ error copy บอกทางไปต่อ

### G2 — Backend authority and privacy — BLOCKING

- [ ] route/menu ใช้ session-derived role/permission เท่านั้น
- [ ] GAS ตรวจ permission และ resource scope ของทุก protected operation
- [ ] ไม่มี role, permission หรือ user identity ที่เชื่อจาก browser storage/query
- [ ] UI ไม่เปิดเผยข้อมูลเมื่อได้ `FORBIDDEN` หรือ `UNAUTHENTICATED`
- [ ] log/error/evidence ไม่มี password, token หรือข้อมูลบุคคลที่ไม่จำเป็น
- [ ] destructive action แสดงผลกระทบและขอ confirmation ที่เจาะจง

### G3 — DaisyUI and theme compliance — BLOCKING

- [ ] ใช้ native DaisyUI component ก่อน custom implementation
- [ ] ไม่มี arbitrary hardcoded color ใน production component
- [ ] selected และ focus states แยกจากกันได้
- [ ] disabled content ยังอ่านได้เมื่อจำเป็นและไม่ดูเหมือน available action
- [ ] structural theme test ผ่านทุก theme ที่เปิดให้เลือก
- [ ] visual review ผ่าน representative light/dark/saturated/muted themes

### G4 — Responsive layout — BLOCKING

- [ ] 360px ไม่มี horizontal page scroll
- [ ] touch target อย่างน้อย 44×44px
- [ ] mobile ใช้ drawer ไม่ใช่ sidebar ที่ถูกบีบ
- [ ] tablet และ notebook ไม่มี content cut-off
- [ ] 1920px ใช้ max-width และไม่ทำให้บรรทัดยาวเกินอ่าน
- [ ] table/filter มี mobile adaptation ที่ตั้งใจออกแบบ

### G5 — Typography and visual hierarchy — BLOCKING

- [ ] ใช้ Pridi ตาม weight/size tokens
- [ ] body ไม่ต่ำกว่า 16px และ label ไม่ต่ำกว่า 14px
- [ ] page title, section heading, body และ metadata แยกชั้นชัดเจน
- [ ] spacing ใช้ token set และมี rhythm สม่ำเสมอ
- [ ] card ใช้เมื่อ content เป็นกลุ่มจริง ไม่ใช่ครอบทุก element
- [ ] icon มาจากระบบเดียวกันและมี accessible label

### G6 — Accessibility — BLOCKING

- [ ] flow หลักทำได้ด้วย keyboard
- [ ] focus visible และลำดับ focus ตรงกับ visual order
- [ ] control มี accessible name และ form มี persistent label
- [ ] dialog trap/return focus ถูกต้อง
- [ ] status ไม่สื่อด้วยสีอย่างเดียว
- [ ] reduced motion ถูกเคารพ
- [ ] automated accessibility scan ไม่มี critical/serious issue

### G7 — Interaction and state integrity — BLOCKING

- [ ] ป้องกัน double submit
- [ ] success แสดงหลัง backend business result สำเร็จ
- [ ] request ID แสดงเฉพาะ support detail
- [ ] retry ไม่ทำ write ซ้ำโดยไม่มี idempotency/confirmation
- [ ] session expiry และ forbidden มีทางกลับที่ปลอดภัย
- [ ] unsaved changes ไม่สูญหายเงียบสำหรับ form สำคัญ

### G8 — Engineering quality — BLOCKING

- [ ] PageComponent อยู่ใน AppShell/PageTemplate contract
- [ ] PageTemplate ไม่มี API/store coupling
- [ ] shared pattern ถูกย้ายเป็น shared component ไม่ copy/paste
- [ ] component/unit tests ครอบคลุม role/permission/state สำคัญ
- [ ] production build ผ่าน
- [ ] no secret scan และ dependency audit ผ่าน
- [ ] local links และ SSOT validation ผ่าน

### G9 — Visual review — BLOCKING

- [ ] มี screenshot ครบ viewport matrix ที่เกี่ยวข้อง
- [ ] ไม่มี overlap, overflow, clipped content หรือ unexpected scrollbar
- [ ] active navigation ไม่เหมือน focus/error state
- [ ] primary action เด่นกว่างานรองโดยไม่พึ่งสีอย่างเดียว
- [ ] empty/loading/error states ไม่ทำให้ layout แตก
- [ ] reviewer ระบุ defect และรอบแก้ ไม่เพียงให้คะแนนความสวย

### G10 — Release evidence — BLOCKING FOR DEPLOYMENT

- [ ] CI อ้างถึง commit ที่จะ deploy จริง
- [ ] deployment URL ตอบ HTTP 200 และ assets โหลดครบ
- [ ] CORS/API health ผ่านจาก deployment origin
- [ ] authenticated browser acceptance ผ่านด้วยบัญชี development ที่อนุมัติ
- [ ] rollback path และ environment notice ถูกตรวจ
- [ ] production/real-data approval แยกจาก technical deployment

### G11 — Key message & viewport density (P13) — BLOCKING

- [ ] ทุกหน้าขึ้นต้นด้วย key message กระชับ (วัตถุประสงค์ + ผลลัพธ์หลัก) เข้าใจงานได้ใน glance เดียว
- [ ] งานหลักพอดี viewport เท่าที่เป็นไปได้; รายการ/รายละเอียดที่ยาว scroll ภายใน panel ที่จำกัดความสูง ไม่ใช่ยืดทั้งหน้า
- [ ] control/form กระชับ (ลด margin/padding/gap, visual footprint เล็ก) โดยไม่ละเมิด G4 touch ≥44px, G5 body ≥16px/label ≥14px, G6 contrast/focus
- [ ] ลด whitespace ไม่ใช่ accessibility; mobile คง touch target ที่เข้าถึงได้
- [ ] spacing สม่ำเสมอรอบ token set ความหนาแน่นใหม่ ไม่ hardcode กระจัดกระจาย

## 4. Result template

| Gate | Result | Evidence | Owner | Follow-up |
|---|---|---|---|---|
| G1 User task/content | NOT RUN |  |  |  |
| G2 Authority/privacy | NOT RUN |  |  |  |
| G3 DaisyUI/theme | NOT RUN |  |  |  |
| G4 Responsive | NOT RUN |  |  |  |
| G5 Typography/hierarchy | NOT RUN |  |  |  |
| G6 Accessibility | NOT RUN |  |  |  |
| G7 Interaction/state | NOT RUN |  |  |  |
| G8 Engineering | NOT RUN |  |  |  |
| G9 Visual review | NOT RUN |  |  |  |
| G10 Release | NOT RUN |  |  |  |
| G11 Key message/density | NOT RUN |  |  |  |

## 5. Definition of Done

Frontend work is `DONE-EVIDENCED` only when G1–G9 และ G11 เป็น PASS สำหรับ source review และ G10 เป็น PASS สำหรับ target environment ผู้พัฒนาหน้าไม่ควรเป็นผู้อนุมัติ visual/accessibility review เพียงคนเดียว และ security/privacy approval สำหรับข้อมูลจริงต้องมาจากผู้มีอำนาจที่ได้รับแต่งตั้ง
