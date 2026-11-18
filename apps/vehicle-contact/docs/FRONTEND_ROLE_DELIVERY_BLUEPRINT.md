# P6 Vehicle Contact — Role-based Frontend Delivery Blueprint

**Document ID:** P6VC-FE-ROLE-001

**Status:** DELIVERY BASELINE

**Version:** 1.0 — 2026-11-18

**Authority source:** GAS `SessionService.ROLE_PERMISSIONS` and approved use cases

## 1. Delivery model

ระบบเป็น SPA เดียว ไม่สร้าง frontend แยกห้าชุดตาม role แต่พัฒนาเป็น vertical slices ที่ใช้ shared shell, shared feature components และ server-authoritative permission contract เดียวกัน

ผู้ใช้หนึ่งคนอาจมีหลาย role ดังนั้น frontend ต้องประกอบ capability จาก `roles` และ `permissions` ที่ GAS คืนมา ห้ามใช้ `if role === ...` เป็น authorization rule แม้ใช้เพื่อเลือกข้อความหรือ dashboard emphasis ได้

## 2. Confirmed role baseline

| Role | Thai label | Confirmed baseline permissions | Frontend emphasis |
|---|---|---|---|
| `STAFF` | เจ้าหน้าที่ค้นหาข้อมูล | organization read, vehicle lookup, contact/photo read, vehicle history read | ค้นหาเร็ว เห็นข้อมูลเท่าที่จำเป็น และมี audit context |
| `REGISTRATION_ADMIN` | ผู้ตรวจสอบการลงทะเบียน | STAFF-like lookup plus registration approval, vehicle update/change approval, QR management, retention read | queue, comparison, evidence review และ explicit decision |
| `OWNER` | เจ้าของยานพาหนะ | submit vehicle change | ดูข้อมูลของตนและส่งคำขอเปลี่ยนแปลงโดยไม่เห็นงานเจ้าหน้าที่ |
| `SYSTEM_ADMIN` | ผู้ดูแลระบบ | settings, users, organizations, campaigns, QR, retention approval, audit | administration, governance และ high-impact confirmation |
| `RETENTION_WORKER` | ผู้ปฏิบัติงานลบตามนโยบาย | execute retention work | job execution ที่ผูกกับ approval และ audit evidence |

ข้อห้ามสำคัญ:

- `SYSTEM_ADMIN` ไม่มีสิทธิ์ค้นหายานพาหนะหรืออนุมัติการลงทะเบียนโดยอัตโนมัติ
- `REGISTRATION_ADMIN` ไม่ได้สิทธิ์จัดการ user/system settings
- `RETENTION_WORKER` ไม่ได้สิทธิ์อนุมัติ deletion ของตนเอง
- role code ไม่ใช่ permission และเมนูที่ซ่อนไม่ใช่ security control

## 3. Shared foundation before role pages

### FE-SHARED-01 — Shell redesign

- AppHeader, desktop sidebar และ mobile drawer ตาม Design System Blueprint
- Thai-first navigation และ role label mapping
- OperationalContextStrip
- unified icon system decision
- global loading/error/toast host
- responsive and theme matrix tests

### FE-SHARED-02 — Identity and session

- Sign in, forced password change handoff, session restore/expiry และ sign out confirmation
- permission list จาก `auth.session`
- forbidden/unauthenticated handling ที่ไม่เปิดเผย resource
- ห้ามจำ password ใน production configuration

### FE-SHARED-03 — Data interaction primitives

- PageTemplate, toolbar, filters, responsive table/list, pagination
- loading/empty/error/forbidden states
- support details และ request ID disclosure pattern
- confirmation pattern สำหรับ high-impact action

## 4. Recommended delivery sequence

ลำดับนี้ลดความเสี่ยงโดยเริ่มจาก read-only operational slice ก่อนงานอนุมัติและงานทำลายข้อมูล:

### Slice 1 — STAFF

Pages:

- หน้าค้นหายานพาหนะ
- ผลการค้นหาและข้อมูลผู้ประสานงานตาม permission
- ประวัติยานพาหนะ

Acceptance focus:

- plate/province search, no mass enumeration UI
- contact/photo disclosure เฉพาะผลที่ได้รับอนุญาต
- no-result, forbidden, stale และ rate-limit states
- mobile search-to-result flow
- audit event and request ID evidence

### Slice 2 — REGISTRATION_ADMIN

Pages:

- รายการรอตรวจสอบ
- รายละเอียดและหลักฐานการลงทะเบียน
- เปรียบเทียบข้อมูลเดิม/ข้อมูลเสนอแก้
- ตัดสินใจอนุมัติหรือปฏิเสธ
- จัดการ QR ภายใต้ permission

Acceptance focus:

- queue filters and stable pagination
- decision reason and evidence requirements
- stale/concurrent decision handling
- no implicit permission from role name
- confirmation copy states exact business consequence

### Slice 3 — OWNER

Pages:

- ยานพาหนะของฉัน
- รายละเอียดที่เจ้าของได้รับอนุญาต
- ส่งและติดตามคำขอเปลี่ยนแปลง

Acceptance focus:

- record ownership enforced by GAS
- no cross-owner identifier probing
- mobile-first form, draft-loss protection และ attachment policy
- status timeline based on backend state

### Slice 4 — SYSTEM_ADMIN

Pages:

- ผู้ใช้และการมอบสิทธิ์
- หน่วยงาน
- campaign/QR governance
- system settings
- retention approval
- audit review

Acceptance focus:

- self-suspend/self-demotion denial
- role assignment allowlist and session revocation consequence
- destructive/high-impact actions separated from routine editing
- audit trail and before/after summary
- no vehicle lookup unless separate permission is present

### Slice 5 — RETENTION_WORKER

Pages:

- งาน retention ที่ได้รับอนุมัติ
- job detail และ execution confirmation
- execution result/reconciliation

Acceptance focus:

- worker cannot approve its own job
- approval identity and scope visible before execution
- idempotency, timeout, partial failure และ retry safety
- no raw deleted personal data in report

## 5. Route and navigation contract

Route metadata ระบุ `requiredPermissions` เป็นข้อมูล UX/guard เท่านั้น Router guard ใช้ session permissions เพื่อนำทางไป forbidden page แต่ GAS ต้อง authorize ทุก request

```js
{
  path: 'vehicles/search',
  name: 'vehicle-search',
  component: VehicleSearchView,
  meta: { requiredPermissions: ['vehicle.lookup'] },
}
```

เมนูควรเปลี่ยนจาก role catalog ไปเป็น permission catalog:

```js
{
  id: 'vehicle-search',
  label: 'ค้นหายานพาหนะ',
  route: 'vehicle-search',
  permissionsAny: ['vehicle.lookup'],
}
```

## 6. Page work-package contract

ทุก page/flow ต้องมี work package ดังนี้:

```text
Work ID:
Actor/permission:
User job:
Primary action:
API operations and DTO links:
PII classification:
States: loading / success / empty / forbidden / error / stale
Mobile adaptation:
Acceptance tests:
UI compliance evidence:
Security/privacy dependencies:
Reviewer and approver:
```

## 7. Reuse boundaries

- shared by workflow: search form, result summary, evidence viewer, decision panel, audit timeline
- shared by presentation: PageHeader, OperationalContextStrip, EmptyState, ErrorState, SupportDetails
- role-specific views orchestrate shared components butไม่ fork component เพียงเพื่อเปลี่ยน label หรือสี
- backend DTO mapping อยู่ใน API adapter ไม่กระจายใน Vue component

## 8. Delivery gates per slice

1. **Contract gate:** GAS operation, permission, DTO และ error codes ยืนยันแล้ว
2. **Design gate:** wireframe/content ผ่าน UI/UX Principles
3. **Build gate:** component/page tests และ production build ผ่าน
4. **Compliance gate:** G1–G9 ใน UI Compliance Checklist ผ่าน
5. **Environment gate:** live browser acceptance ด้วย synthetic/development data
6. **Release gate:** security, privacy, operational owner และ production approval แยกต่างหาก

## 9. Next executable slice

เริ่มจาก **FE-SHARED-01 Shell redesign** เพื่อแก้ layout/visual hierarchy ปัจจุบันให้ผ่าน blueprint ก่อน จากนั้นทำ **STAFF read-only vehicle lookup** เป็น role slice แรก การเริ่มหน้าของ role อื่นก่อน shell ผ่าน compliance จะทำให้เกิด design drift และงานย้อนแก้
