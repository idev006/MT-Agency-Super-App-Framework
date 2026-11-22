# P6 Vehicle Contact — Frontend UI/UX Principles

**Document ID:** P6VC-FE-UX-001

**Status:** REQUIRED BASELINE

**Effective date:** 2026-11-18

**Authority:** Project Owner direction; applies to every new or revised frontend page

## 1. Purpose

เอกสารนี้เป็นหลักบังคับสำหรับ Vue frontend ของ P6 Vehicle Contact ทุก role และทุก viewport เป้าหมายคือระบบประสานข้อมูลยานพาหนะที่เจ้าหน้าที่เข้าใจได้เร็ว ใช้งานภายใต้แรงกดดันได้ และไม่ทำให้ผู้ใช้ต้องเข้าใจโครงสร้างทางเทคนิคของระบบ

เอกสารนี้ไม่แทนที่สิทธิ์จาก backend, กฎ PDPA, security review หรือ use-case specification หากข้อกำหนดขัดกัน ให้หยุด implementation และบันทึก decision ก่อนแก้ UI

เอกสารที่ต้องใช้งานร่วมกัน:

- [Frontend Architecture](FRONTEND_ARCHITECTURE.md)
- [Design System Blueprint](FRONTEND_DESIGN_SYSTEM_BLUEPRINT.md)
- [UI Compliance Checklist](FRONTEND_UI_COMPLIANCE_CHECKLIST.md)
- [Role Delivery Blueprint](FRONTEND_ROLE_DELIVERY_BLUEPRINT.md)

## 2. Product character

### 2.1 Subject and audience

- **Subject:** ศูนย์ประสานข้อมูลยานพาหนะของตำรวจภูธรภาค 6
- **Primary audience:** เจ้าหน้าที่ค้นหาข้อมูล ผู้ตรวจสอบการลงทะเบียน เจ้าของยานพาหนะ ผู้ดูแลระบบ และผู้ปฏิบัติงานด้าน retention
- **Primary job:** พาผู้ใช้ไปถึงงานที่ได้รับอนุญาตอย่างรวดเร็ว พร้อมบริบท สถานะ และผลลัพธ์ที่ตรวจสอบได้

### 2.2 Visual direction

บุคลิกต้องเป็น **calm operational clarity**: สุขุม แม่นยำ มีลำดับ ไม่ตกแต่งแบบแฟชั่น และไม่เลียนแบบ dashboard สำเร็จรูป

จุดจำของระบบคือ **แถบบริบทการปฏิบัติงาน** ซึ่งสรุปข้อมูลจริงที่จำเป็นต่อการตัดสินใจ เช่น บทบาท หน่วยงาน เส้นทางเชื่อมต่อ สถานะ session และเวลาที่ข้อมูลอัปเดตล่าสุด ห้ามใช้แถบนี้เป็นของตกแต่งหรือใส่ metric ที่ไม่มีแหล่งข้อมูล

ระบบไม่ใช้ตราสัญลักษณ์ เครื่องหมายตำรวจ หรือสีประจำหน่วยงานเพิ่มเติมจนกว่าจะมี asset และสิทธิ์ใช้งานที่ได้รับอนุมัติ

## 3. Mandatory principles

### P1 — งานของผู้ใช้มาก่อนโครงสร้างระบบ

ชื่อหน้า หัวข้อ ปุ่ม และข้อความอธิบายต้องบอกสิ่งที่ผู้ใช้ทำหรือได้รับ ห้ามแสดงคำอย่าง `PageComponent`, `AppShell`, `payload`, `transport`, `auth.session` หรือชื่อ class ในหน้าผู้ใช้

ตัวอย่าง:

- ใช้ “ตรวจสอบการเชื่อมต่อ” แทน “Gateway POC”
- ใช้ “เชื่อมต่อผ่าน Cloudflare” แทน “Worker transport”
- ใช้ “สิทธิ์ผู้ดูแลระบบ” แทน `SYSTEM_ADMIN` ในข้อความหลัก โดย technical code แสดงได้เฉพาะรายละเอียดสำหรับ support

### P2 — ภาษาไทยเป็นภาษาหลัก

- เมนู ปุ่ม สถานะ error และคำแนะนำใช้ภาษาไทยก่อน
- ชื่อมาตรฐานหรือ technical identifier แสดงในวงเล็บหรือส่วนรายละเอียดเมื่อจำเป็น
- ใช้คำเดียวกันตลอด flow เช่น “ออกจากระบบ” ทั้งปุ่ม dialog และ toast
- เขียนแบบ active voice และบอกวิธีแก้เมื่อเกิดข้อผิดพลาด

### P3 — GAS เป็น authority ของ identity และ permission

- Frontend ใช้ role/permission เพื่อจัดลำดับและลดความสับสนเท่านั้น
- ทุก protected operation ต้องให้ GAS ตรวจ session, permission และ resource scope ซ้ำ
- ห้ามสร้างสิทธิ์จาก route, query string, browser storage หรือ role ที่ client ส่งเอง
- ผู้ใช้หลาย role ต้องได้รับเมนูจาก permission union ที่ GAS คืนมา ไม่ใช่การเดาสิทธิ์จากชื่อ role

### P4 — Progressive disclosure

- แสดงงานที่พบบ่อยและสถานะที่ต้องรู้ก่อน
- รายละเอียดทางเทคนิค request ID, endpoint และ error code อยู่ใน “รายละเอียดสำหรับเจ้าหน้าที่สนับสนุน”
- destructive action ต้องแยกออกจาก primary flow และยืนยันผลกระทบอย่างเจาะจง

### P5 — One screen, one primary job

แต่ละหน้ามี primary action ไม่เกินหนึ่งกลุ่ม งานรองต้องลด visual weight ห้ามวางปุ่มสำคัญหลายสีแข่งขันกัน

### P6 — Status must be truthful

- สถานะต้องมาจากข้อมูลจริงและบอกเวลาอัปเดตเมื่ออาจล้าสมัย
- ห้ามใช้คำว่า “สำเร็จ” จาก HTTP 200 เพียงอย่างเดียว ต้องตรวจ canonical envelope และผลทางธุรกิจ
- loading, empty, partial, offline, forbidden และ error ต้องมีรูปแบบที่แยกจากกัน

### P7 — Mobile-first operational use

- งานหลักต้องทำได้ตั้งแต่ความกว้าง 360px โดยไม่เลื่อนแนวนอน
- touch target ไม่น้อยกว่า 44×44px
- ตารางต้องแปลงเป็น card/list หรือมี column priority ที่ชัดเจนบนจอเล็ก
- sidebar desktop ต้องเปลี่ยนเป็น DaisyUI drawer บน mobile

### P8 — Theme independence

- ใช้ DaisyUI semantic tokens เท่านั้นสำหรับสี UI
- ห้าม hardcode สีเพื่อทำให้ theme ใด theme หนึ่งสวยเป็นพิเศษ
- ทุก theme ที่เปิดให้ผู้ใช้เลือกต้องรักษา hierarchy, focus, selected, disabled และ error states ได้
- สีไม่ใช่สัญญาณเดียว ต้องมีข้อความ ไอคอน หรือรูปทรงประกอบ

### P9 — Native DaisyUI first

ใช้ component และ modifier ของ DaisyUI 5.8.x ก่อนสร้าง custom component หรือ override internals การเพิ่ม CSS ต้องมีเหตุผลด้าน product identity, layout contract หรือ accessibility ที่ component เดิมให้ไม่ได้

### P10 — Pridi with discipline

Pridi เป็น font หลักตามข้อกำหนด แต่ต้องควบคุมน้ำหนักและความหนาแน่น:

- body และ form: 400
- label, navigation และ button: 500
- heading: 600
- 700 ใช้เฉพาะจุดเน้นสั้น ห้ามใช้กับ paragraph
- ห้ามใช้ 200–300 กับข้อความสำคัญหรือข้อความขนาดเล็ก

### P11 — Accessible by default

- เป้าหมายการออกแบบคือ WCAG 2.2 AA
- ทุก flow ใช้ keyboard ได้ มี visible focus และลำดับ focus ตรงกับภาพ
- dialog ต้องคืน focus ไปยัง control ที่เปิด dialog
- motion ต้องเคารพ `prefers-reduced-motion`
- accessible name ต้องบอกหน้าที่ ไม่ใช่รูปร่างของ icon

### P12 — Privacy in the interface

- แสดงข้อมูลบุคคลเท่าที่จำเป็นต่อภารกิจและ permission
- mask ค่า sensitive ตาม use case และห้าม copy/export โดยปริยาย
- empty, error และ log ต้องไม่เปิดเผย token, password, phone หรือข้อมูลบุคคล
- POC notice ต้องชัดเจนเมื่อ environment ยังไม่อนุมัติข้อมูลจริง

### P13 — Key message และความหนาแน่นแบบ viewport-first (Owner directive 2026-11-22)

- ทุกหน้าต้องขึ้นต้นด้วย **key message** กระชับ: บอกวัตถุประสงค์และผลลัพธ์หลักที่ผู้ใช้จะได้รับ ไม่ใช่แค่ชื่อหน้า (สอดคล้อง P1 และ §4) key message ต้องเด่นพอที่ผู้ใช้เข้าใจงานของหน้าได้ใน glance เดียว
- **ลด whole-page scroll ให้มากที่สุดเท่าที่เป็นไปได้**: จัดงานหลักให้พอดี viewport; รายการหรือรายละเอียดที่ยาวให้ scroll **ภายใน panel ที่จำกัดความสูง** แทนการยืดทั้งหน้าให้ผู้ใช้เลื่อนไกล
- **control/form กระชับ**: ลด margin/padding/gap และขนาด visual footprint ของ element; จัดข้อมูลหนาแน่นขึ้นแต่ยังอ่านง่าย ไม่อัดจนติดกัน
- **ข้อจำกัดบังคับ:** ความกระชับต้องไม่ละเมิด P7 (touch target ≥44×44px บน mobile), P11/G6 (contrast, visible focus, WCAG 2.2 AA), G5 (body ≥16px, label ≥14px) และ P8 (DaisyUI semantic tokens) — ลด *whitespace* ไม่ใช่ *accessibility*; desktop เน้น density ได้เต็มที่ ส่วน mobile คง touch target ที่เข้าถึงได้
- ใช้ spacing token set ที่สม่ำเสมอรอบความหนาแน่นใหม่ ห้าม hardcode ค่ากระจัดกระจายแต่ละหน้า

## 4. Information hierarchy

ลำดับมาตรฐานของหน้าภายในระบบ:

1. ตำแหน่งปัจจุบันหรือ breadcrumb เมื่อจำเป็น
2. ชื่อหน้า + **key message** กระชับ (วัตถุประสงค์และผลลัพธ์หลักที่ผู้ใช้จะได้รับ — P13)
3. primary action หรือ filters
4. แถบบริบทการปฏิบัติงานเมื่อข้อมูลมีผลต่อการตัดสินใจ (รูปแบบกระชับ — P13)
5. เนื้อหาหลัก (พอดี viewport เท่าที่เป็นได้; panel ยาว scroll ภายใน — P13)
6. empty/error/help ที่อยู่ใกล้พื้นที่ที่เกี่ยวข้อง
7. support detail แบบเปิดดูเพิ่มได้

## 5. Content rules

- หัวข้อหน้าเป็นคำนามหรือผลลัพธ์ เช่น “รายการรอตรวจสอบ”
- ปุ่มเป็นคำกริยาเฉพาะ เช่น “อนุมัติการลงทะเบียน” ไม่ใช้ “ตกลง” เมื่อผลไม่ชัด
- error ระบุสามส่วน: เกิดอะไรขึ้น, ข้อมูลถูกเปลี่ยนหรือไม่, ผู้ใช้ควรทำอะไร
- empty state อธิบายว่าไม่มีรายการเพราะอะไร และมี action เฉพาะเมื่อผู้ใช้ทำต่อได้
- ห้ามใช้ placeholder เป็น label
- ห้ามแสดง role code เป็นชื่อบุคคลหรือหัวข้อหลัก

## 6. Prohibited patterns

- developer explanation ใน production-facing page
- Unicode/emoji หลายรูปแบบแทน icon system
- active navigation ที่ใช้ border ซ้อนคล้าย focus ring
- card ทุกอย่างโดยไม่มี hierarchy
- disabled content ที่ contrast ต่ำจนอ่านไม่ได้
- modal สำหรับข้อมูลที่แสดง inline ได้
- action สำคัญที่พึ่ง hover อย่างเดียว
- layout desktop ที่เพียงย่อขนาดลงบน mobile
- permission check เฉพาะ frontend
- raw backend error หรือ stack trace ใน UI

## 7. Compliance rule

หน้าใหม่หรือหน้าที่ redesign ต้องผ่าน [UI Compliance Checklist](FRONTEND_UI_COMPLIANCE_CHECKLIST.md) ทุก blocking gate ก่อน merge ผลทดสอบต้องระบุ viewport, theme, role/permission fixture, commit SHA และ reviewer ห้ามใช้คำว่า “world-class”, “production-ready” หรือ “ผ่าน UX” หากไม่มีหลักฐานตาม checklist
