# P6VC API Test Console — POC ที่กรอกค่าทดสอบเองได้

> Version: POC 4 — เพิ่ม Frontend SPA Gateway โดย GAS Backend เดิมไม่เปลี่ยน

## เป้าหมาย

หลัง Deploy POC 3 **เพียงหนึ่งครั้ง** ผู้ใช้สามารถแก้ไขค่าทดสอบแต่ละครั้งผ่าน Input Box ได้ โดย **ไม่ต้อง Deploy ใหม่** ได้แก่ API Operation, Method, JSON Payload, Request ID และ Username/Password สำหรับบัญชีทดสอบแบบชั่วคราว

## ติดตั้งโดยไม่ต้องดาวน์โหลดไฟล์ (มือถือ)

1. เปิด [worker.mjs รุ่น POC 3 บน GitHub](https://github.com/idev006/MT-Agency-Super-App-Framework/blob/feat/p6vc-cloudflare-api-test-console-poc-20261118/tools/p6vc-api-test-console/worker.mjs)
2. กด **Copy raw file** หรือ **Raw** แล้วคัดลอกโค้ด (ถ้าปุ่มไม่แสดง ใช้ **Desktop site** ของ Chrome)
3. เข้า [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages → `p6vc-api-test-console` → **Edit code**
4. **แทนที่โค้ดเดิมทั้งหมด** ด้วยโค้ดรุ่นนี้ แล้วกด **Deploy** (Deploy นี้เป็นครั้งเดียวที่ต้องทำเมื่อเปลี่ยนฟังก์ชันของตัว Console ไม่ต้อง Deploy เมื่อเปลี่ยนค่าทดสอบในฟอร์ม)
5. **ห้ามลบ/Reset** GAS Login, Google Sheets หรือค่าที่ตั้งไว้ก่อนหน้า เพราะการทดสอบ Health และ Authentication รุ่นเดิมผ่านแล้ว

## เพิ่ม KV สำหรับ AI Job Bridge

1. Cloudflare Dashboard → **Workers & Pages → KV → Create namespace**
2. ตั้งชื่อ namespace เช่น `p6vc-api-test-jobs-dev`
3. เปิด Worker `p6vc-api-test-console` → **Settings → Bindings → Add binding → KV Namespace**
4. Variable name ต้องเป็น `TEST_JOB_STORE` และเลือก namespace ที่สร้างไว้
5. บันทึก Binding แล้ว Deploy โค้ดรุ่นนี้หนึ่งครั้ง

KV เก็บเฉพาะสถานะ Job และรายงานแบบ redacted ไม่เก็บ Payload ดิบจาก GAS, Password, Bridge Key หรือ Session Token ค่าเริ่มต้นหมดอายุภายใน 7 วัน

## Cloudflare Variables and Secrets

| Name | Type | ค่า |
|---|---|---|
| `P6VC_GAS_EXEC_URL` | Text | `https://script.google.com/macros/s/AKfycby15c-Aux2za0BuedeIYni8-tc6rkf9ZVNmw-6ZMTgPvG9SvFjuQVSzNoMouiMhqTmxrA/exec` |
| `BRIDGE_ACCESS_KEY` | **Secret** | คีย์ใหม่สุ่ม >=32 ตัวอักษร ไม่ใช่รหัสผ่าน GAS |
| `TEST_LOGIN_USERNAME` | Text (optional) | Username บัญชีทดสอบสำรอง |
| `TEST_LOGIN_PASSWORD` | **Secret (optional)** | Password บัญชีทดสอบสำรอง |
| `TEST_JOB_STORE` | **KV binding** | Namespace สำหรับ Job status/result และ idempotency |
| `TEST_JOB_TTL_SECONDS` | Text (optional) | อายุผลลัพธ์ 3600–604800 วินาที; ค่าเริ่มต้น 604800 |
| `FRONTEND_ALLOWED_ORIGINS` | Text | origin ที่เรียก `/api/frontend` ได้ คั่นด้วย comma เช่น `https://idev006.github.io,http://127.0.0.1:5173` |

## Frontend SPA Gateway

`POST /api/frontend` รับ canonical GAS envelope และ forward ไปยัง `P6VC_GAS_EXEC_URL` ที่กำหนดใน Worker เท่านั้น โดย POC อนุญาตเฉพาะ `system.health`, `auth.login`, `auth.session`, `auth.logout`

- รองรับ `OPTIONS` CORS preflight
- ไม่ใช้และไม่รับ `BRIDGE_ACCESS_KEY` จาก SPA
- ไม่รับ GAS target URL จาก browser
- GAS ยังคงเป็นผู้ตรวจ username/password, session และ role
- Origin allowlist เป็นเพียง browser boundary ไม่ใช่ authentication
- ต้องเพิ่ม rate limit/Cloudflare Access และทบทวน ingress ก่อนขยาย operation หรือใช้ข้อมูลจริง

ถ้าไม่ใช้ค่าบัญชีทดสอบที่เก็บเป็น Secret สามารถกรอกทั้ง Username และ Password ใน Input Box ของหน้าเว็บได้ชั่วคราว โดยส่งผ่าน HTTPS และไม่เก็บใน Local Storage / รายงานผล หากกรอกเพียงช่องเดียวจะไม่ยอมทดสอบ Credential Pair

## ช่องกรอกบนหน้าเว็บ

1. **Bridge Access Key** — คีย์สำหรับเปิดสิทธิ์เรียก API ไม่ใช่รหัสของ GAS
2. **Health API** — ปุ่มทดสอบ GET/POST เหมือนเดิม, คาดหวัง PASS 2/2
3. **Login 8 กรณี** — ใช้บัญชีจาก Cloudflare Secrets หรือกรอก Username/Password ในหน้าเว็บ แล้วกดปุ่ม
4. **API Explorer** — เลือก Operation ที่อยู่ใน Read-only Allowlist, เลือก GET เฉพาะ system.health หรือ POST, แก้ `Payload JSON` และ `Request ID` ได้เอง
5. **Use Test Session** — ถ้าเลือก ระบบ Login ชั่วคราวจากบัญชีทดสอบก่อนยิง Read-only API แล้วพยายาม Logout ใน `finally` โดยไม่ส่ง Session Token กลับ Browser
6. **Copy Report** — คัดลอกรายงานแบบตัดข้อมูลสำคัญ (ไม่รวม Response Data, PII, Password, Session Token)

## เรียกจาก AI/Codex ผ่าน HTTPS โดยตรง

เก็บคีย์ไว้ใน Environment Variable ของเครื่องที่รัน Codex ห้ามใส่ค่าจริงในไฟล์ Source:

```powershell
$headers = @{
  Authorization = "Bearer $env:P6VC_BRIDGE_ACCESS_KEY"
  "Idempotency-Key" = "p6vc-health-20261118-001"
}
$suite = @{
  suiteId = "health-smoke"
  cases = @(@{
    id = "H-01"
    operation = "system.health"
    method = "POST"
    payload = @{}
    expected = @{ ok = $true }
  })
} | ConvertTo-Json -Depth 8

$job = Invoke-RestMethod `
  -Uri "https://p6vc-api-test-console.thaipoliceregion6.workers.dev/api/jobs" `
  -Method Post -Headers $headers -ContentType "application/json" -Body $suite

Invoke-RestMethod `
  -Uri "https://p6vc-api-test-console.thaipoliceregion6.workers.dev/api/jobs/$($job.jobId)" `
  -Method Get -Headers @{ Authorization = "Bearer $env:P6VC_BRIDGE_ACCESS_KEY" }
```

การส่ง `Idempotency-Key` เดิมพร้อม JSON เดิมจะคืน Job เดิมและไม่ยิง GAS ซ้ำ หากใช้ key เดิมกับ JSON คนละชุดจะได้ HTTP 409 `IDEMPOTENCY_KEY_REUSED`

## POC Read-only Allowlist

`system.health`, `system.config.get`, `users.list`, `organizations.list`, `campaigns.list`, `registrations.listPending`, `vehicles.lookup`, `vehicles.history`, `changes.listPending`, `retention.jobStatus`.

API ทั้งหมดถูกเลือกจาก `apps/vehicle-contact/contracts/api-inventory.v1.json` ใน GitHub SSOT แต่การมีชื่อในรายการ **ไม่ได้ยืนยันว่า GAS Endpoint เปิดใช้จริง** หรือผู้ใช้มีสิทธิ์เรียก

**ไม่รองรับ API กลุ่ม Write / Mutate** เช่น `users.create`, `vehicles.update`, `auth.changePassword`, `registrations.submit`, `photos.upload` และทุก URL นอก `P6VC_GAS_EXEC_URL`. การเพิ่มรายการ Read-only ใน Allowlist ยังคงเป็นการแก้โค้ด/Deploy ใหม่โดยมีการตรวจ Review — นั่นเป็น Security Gate ไม่ใช่ข้อจำกัดการกรอก Payload

## อ่านผลอย่างถูกต้อง

- `transport: "PASS"` หมายถึง Worker รับ JSON Response จาก GAS ได้ **ไม่ได้หมายความว่า Business API ตอบ `ok:true`**
- `backend.ok: true` = GAS ยอมรับคำขอ
- `backend.ok: false` + `backend.errorCode` = GAS ปฏิเสธคำขอ เช่น `UNAUTHENTICATED`, `PASSWORD_CHANGE_REQUIRED`, `SERVICE_UNAVAILABLE`
- `logoutRevoked: true` = GAS ยืนยัน Logout สำหรับ Probe ที่ใช้ Session; ถ้า false ต้องตรวจ Session ค้างใน `vc_sessions`
- `dataType` ระบุชนิดข้อมูลเท่านั้น ไม่ส่งเนื้อหากลับ Browser

## กติกาความปลอดภัย

- ใช้เฉพาะ POC บนระบบทดสอบ และเฉพาะข้อมูลสังเคราะห์; ห้ามใช้ทะเบียนรถ/ข้อมูลบุคคลจริงใน Payload
- ไม่ใส่ `BRIDGE_ACCESS_KEY` หรือ Credential ใน GitHub, Issue, ภาพหน้าจอ หรือแชท
- ต้องหมุนเวียน Password ที่เคยเปิดเผยในแชทก่อนการใช้งานจริง และสร้างบัญชีทดสอบสิทธิ์จำกัดแทน `admin`
- ต้องเพิ่ม Cloudflare Access, Rate Limit, บัญชีทดสอบที่ไม่ใช่ System Admin และ Audit ก่อนขยาย API หรือใช้ Production
- ห้าม Merge Branch หรือ Replace Worker Production โดยอัตโนมัติจนกว่าจะได้รับผล Real Cloudflare → GAS Acceptance รุ่นนี้จากเจ้าของระบบ
