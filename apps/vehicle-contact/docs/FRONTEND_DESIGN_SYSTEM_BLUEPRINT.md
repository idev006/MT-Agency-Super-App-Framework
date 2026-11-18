# P6 Vehicle Contact — Frontend Design System Blueprint

**Document ID:** P6VC-FE-DS-001

**Status:** REQUIRED IMPLEMENTATION BLUEPRINT

**Version:** 1.0 — 2026-11-18

**Depends on:** [UI/UX Principles](FRONTEND_UI_UX_PRINCIPLES.md)

## 1. Design contract

Design system นี้กำหนด visual language และ component contract สำหรับ Vue 3, Composition API, Tailwind CSS 4 และ DaisyUI 5.8.x ทุก page ต้องประกอบจาก primitive ชุดเดียวกันและเติมเนื้อหาเฉพาะภารกิจ ห้ามแต่ละ role สร้าง shell, spacing หรือ interaction language ของตนเอง

## 2. Semantic theme model

ข้อกำหนด “ผู้ใช้เปลี่ยน DaisyUI theme ได้ทั้งหมด” มีอำนาจเหนือ fixed brand palette ดังนั้นระบบไม่ล็อก hex palette แต่ล็อก **semantic color roles**:

| Purpose | DaisyUI token | Rule |
|---|---|---|
| Canvas | `base-200` | พื้นหลัง app; ห้ามใช้เป็น card |
| Surface | `base-100` | card, drawer, modal และ table surface |
| Raised/soft surface | `base-300` | ใช้จำกัดสำหรับ grouped context |
| Primary action | `primary` / `primary-content` | หนึ่ง primary action group ต่อหน้า |
| Secondary accent | `secondary` | ใช้เมื่อมี semantic contrast จริง |
| Informational accent | `accent` | ใช้กับ context ที่ไม่แข่งขันกับ primary |
| Success | `success` | ใช้เมื่อผลทางธุรกิจสำเร็จแล้วเท่านั้น |
| Warning | `warning` | ผู้ใช้ยังดำเนินการต่อได้แต่ต้องเข้าใจความเสี่ยง |
| Error/destructive | `error` | failure หรือ irreversible/high-impact action |
| Neutral utility | `neutral` | technical/support utility ที่ไม่ใช่ primary action |

ห้ามใช้ arbitrary color เช่น `text-[#...]`, `bg-purple-*` หรือสีเฉพาะ theme ใน component production

### 2.1 Theme selector

- แสดงชื่อ theme เป็นชื่อที่อ่านได้ เช่น “แฟนตาซี (fantasy)”
- preview ต้องใช้ semantic swatches ไม่ใช้ screenshot คงที่
- บันทึกเฉพาะ theme ID ใน `localStorage`
- หาก theme หายหลัง upgrade ให้ fallback เป็นค่า default ที่กำหนดใน UI store

## 3. Typography

Font family หลักคือ `Pridi, serif` จาก Google Fonts พร้อม fallback ที่ไม่ทำให้ content หายเมื่อ network ช้า

| Token | Desktop | Mobile | Weight | Use |
|---|---:|---:|---:|---|
| `display` | 40/48px | 32/40px | 600 | landing/sign-in thesis เท่านั้น |
| `h1` | 32/40px | 28/36px | 600 | ชื่อหน้า |
| `h2` | 24/32px | 22/30px | 600 | section heading |
| `h3` | 20/28px | 18/26px | 500 | card/group heading |
| `body-lg` | 18/30px | 17/28px | 400 | intro ที่สั้น |
| `body` | 16/26px | 16/26px | 400 | content หลัก |
| `label` | 14/22px | 14/22px | 500 | form/navigation label |
| `caption` | 13/20px | 13/20px | 400 | metadata/support detail |

ข้อห้าม: body ต่ำกว่า 16px, label ต่ำกว่า 14px, all-caps ภาษาอังกฤษเป็นหัวข้อ, weight 700 ต่อเนื่องหลายบรรทัด

## 4. Spatial system

ใช้ฐาน 4px และเลือกค่าจากชุด `4, 8, 12, 16, 20, 24, 32, 40, 48, 64` เท่านั้น

- control gap: 8–12px
- card internal padding: 20px mobile, 24px desktop
- section gap: 32px mobile, 40–48px desktop
- page horizontal padding: 16px mobile, 24px tablet, 32px desktop
- content maximum width: 1440px
- reading/form column maximum width: 720px
- touch target minimum: 44×44px

Border radius ใช้ DaisyUI tokens; component ในระดับเดียวกันต้องใช้ radius เดียวกัน ห้ามผสมกล่องเหลี่ยม กล่องมนมาก และ pill โดยไม่มีความหมาย

## 5. Application shell

### 5.1 Desktop ≥ 1024px

```text
┌──────────── sidebar 272px ────────────┬──────── top bar 72px ───────────────┐
│ product + environment                 │ page context      theme user actions │
│ primary navigation                    ├───────────────────────────────────────┤
│                                       │ main: max 1440px / padding 32px        │
│ role-aware secondary navigation       │                                       │
│                                       │ page header                            │
│ support/environment notice            │ operational context strip              │
└───────────────────────────────────────┴─content────────────────────────────────┘
```

- Sidebar กว้าง 272px และไม่ขยายตามข้อความ
- Top bar มีข้อมูลที่ใช้ทุกหน้าเท่านั้น
- Main content ไม่ยืดเต็มจอกว้างโดยไร้ max-width
- Footer ไม่บังคับ sticky หากทำให้ content ถูกตัด

### 5.2 Tablet 640–1023px

- Sidebar เปลี่ยนเป็น DaisyUI drawer
- Top bar แสดงชื่อหน้า, theme compact และ user menu
- card grid สูงสุดสองคอลัมน์
- filters ยุบเป็นแถวแนวตั้งหรือ filter drawer ตามความซับซ้อน

### 5.3 Mobile < 640px

```text
┌──────────────── top bar ───────────────┐
│ menu | page title | user menu          │
├────────────────────────────────────────┤
│ page header                            │
│ primary action                         │
│ context strip (stacked/scroll-free)    │
│ content: one column                    │
└────────────────────────────────────────┘
```

- ห้าม horizontal page scroll
- navigation อยู่ใน drawer และปิดเมื่อเลือก route
- primary action อยู่ใน reach flow ไม่ลอยทับ content
- table ต้องเลือก column priority หรือเปลี่ยนเป็น list/card

## 6. Signature component: OperationalContextStrip

แถบนี้แทน stats card ทั่วไปและต้องแสดงเฉพาะบริบทที่มีผลต่อการทำงาน:

- role label ภาษาไทย; technical role code อยู่ใน accessible support detail
- organization/unit เมื่อ GAS คืนมาและได้รับอนุญาต
- session/connection state
- “อัปเดตล่าสุด” เมื่อข้อมูลอาจเปลี่ยน
- queue count เฉพาะเมื่อมาจาก backend จริง

บน desktop ใช้ DaisyUI `stats`; บน mobile stack เป็นรายการสองคอลัมน์หรือหนึ่งคอลัมน์ ห้ามแสดงค่า decorative เช่นจำนวนเมนูทั้งหมด

## 7. Component hierarchy

```text
AppShell
├─ AppHeader
├─ AppSidebar / MobileDrawer
├─ RouterView
│  └─ PageTemplateComponent
│     ├─ PageHeader
│     ├─ OperationalContextStrip (optional)
│     ├─ PageToolbar / Filters (optional)
│     ├─ PageContent
│     └─ SupportDetails (optional)
├─ AppFooter
└─ GlobalFeedbackHost
```

`PageTemplateComponent` จัด layout เท่านั้น ห้ามเรียก API/store และห้ามมีข้อความอธิบาย component architecture ใน rendered UI

## 8. Native DaisyUI mapping

| Need | Required starting component |
|---|---|
| Shell/mobile navigation | `drawer`, `navbar`, `menu` |
| Page actions | `btn`, `join` เมื่อ action เป็นชุดเดียวกัน |
| Status | `badge`, `alert`, `status` |
| Operational context | `stats` |
| Form | `fieldset`, `label`, `input`, `select`, `textarea` |
| Search/filter | `input`, `select`, `filter`, `collapse` |
| List/table | `table`, `list` |
| Cards | `card` เฉพาะ grouped task/content |
| Confirmation | `modal` พร้อม focus management |
| Loading | `skeleton`, `loading` |
| Empty/help detail | `alert`, `hero` ขนาดย่อม หรือ inline block |
| Toast | `toast` + `alert` |

Custom CSS ห้าม override DOM internals ของ DaisyUI และห้ามจำลอง component ที่มีอยู่แล้วด้วย border/padding จำนวนมาก

## 9. Navigation and iconography

- navigation แสดงเฉพาะงานที่ permission รองรับ
- selected item ใช้ background/foreground semantic state เพียงชั้นเดียว; focus ring ต้องยังมองเห็นแยกจาก selected state
- ใช้ SVG icon set เดียวทั้งระบบหลังมี decision บันทึกแล้ว
- ระหว่างยังไม่เลือก icon set ให้ใช้ข้อความโดยไม่มี Unicode icon ปะปน
- icon ไม่แทน label ใน primary navigation
- disabled future feature ไม่ควรปะปนกับงานใช้งานได้; แยก section “กำลังพัฒนา”

## 10. Forms and validation

- label อยู่เหนือ control และคงอยู่ตลอดเวลา
- required/optional ระบุด้วยข้อความ ไม่ใช้สีอย่างเดียว
- validate เมื่อ blur หรือ submit ตามความเหมาะสม; ห้าม error ขณะผู้ใช้ยังพิมพ์อักษรแรก
- error อยู่ติด control และ summary อยู่บน form เมื่อมีหลายจุด
- submit button บอกผล เช่น “บันทึกการเปลี่ยนแปลง”
- ป้องกัน double submit และแสดง pending label
- ข้อมูลที่แก้ไขแล้วแต่ยังไม่บันทึกต้องมี unsaved-change guard เมื่อผลกระทบสำคัญ

## 11. Data display

- default sort และ filter ต้องบอกได้
- วันที่แสดง timezone Asia/Bangkok และรูปแบบไทยที่สม่ำเสมอ
- technical ID ใช้ monospace เฉพาะ support detail; Pridi ยังคงเป็น UI font หลัก
- phone/contact แสดงเมื่อ permission และ use case อนุญาตเท่านั้น
- action ต่อ row ต้องใช้ menu เมื่อเกินสอง action
- pagination, total และ empty state ต้องมาจาก backend contract ไม่คำนวณหลอกบน subset

## 12. State patterns

ทุก data component ต้องรองรับ:

1. initial
2. loading โดยไม่ทำ layout กระโดดรุนแรง
3. success
4. empty พร้อมคำอธิบาย
5. forbidden โดยไม่เปิดเผย resource
6. recoverable error พร้อม “ลองอีกครั้ง”
7. non-recoverable error พร้อม request ID ใน support details
8. stale/offline เมื่อแสดงข้อมูล cache

## 13. Motion and feedback

- transition 120–200ms สำหรับ state change เล็ก
- ไม่มี page-load choreography ใน operational flow
- animation ต้องไม่หน่วง action หรือสื่อความสำเร็จก่อน backend ยืนยัน
- เคารพ `prefers-reduced-motion`
- toast ไม่ใช้แทน error ที่ต้องแก้ใน form

## 14. Theme and viewport verification matrix

Automated structural tests ต้องวนทุก theme ที่ UI เปิดให้เลือก ส่วน visual review ขั้นต่ำใช้ theme ตัวแทน light, dark, high-saturation, low-saturation และ theme ที่ Project Owner เลือกเป็น default

Viewport หลัก:

- 360×800 — mobile minimum
- 390×844 — common mobile
- 768×1024 — tablet portrait
- 1024×768 — tablet landscape/small notebook
- 1366×768 — notebook
- 1440×900 — desktop
- 1920×1080 — wide desktop; content ต้องไม่ยืดจนอ่านยาก

## 15. CSS governance

- shared tokens อยู่ใน design layer ไม่กระจาย arbitrary values ตาม page
- component scoped style ใช้เฉพาะ behavior เฉพาะ component
- ห้าม `!important` ยกเว้นมี ADR และ test ป้องกัน regression
- ห้าม selector ที่อิง DOM ภายในของ third-party component
- PR ที่เพิ่ม arbitrary color/spacing/z-index ต้องอธิบายเหตุผลและเพิ่ม token หากเป็น pattern ที่ใช้ซ้ำ
