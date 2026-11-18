# P6VC API Test Console — ติดตั้ง Cloudflare แบบไม่ต้องดาวน์โหลดไฟล์

> ต้นแบบสำหรับทดสอบเท่านั้น ไม่เปิดใช้ข้อมูลจริงหรือ Business API

## คัดลอกโค้ดจาก GitHub โดยตรง (มือถือ)

1. เปิด [worker.mjs](https://github.com/idev006/MT-Agency-Super-App-Framework/blob/feat/p6vc-cloudflare-api-test-console-poc-20261118/tools/p6vc-api-test-console/worker.mjs)
2. กดปุ่ม **Raw** หรือ **Copy raw file** (ไอคอนคลิปบอร์ด) ในหน้า GitHub หากใช้มือถือแล้วปุ่มไม่แสดงให้เปิด **Desktop site** ใน Chrome
3. เข้า Cloudflare Dashboard → Workers & Pages → Worker `p6vc-api-test-console` → Edit code
4. เลือกข้อความเดิมของ Hello World ทั้งหมด ลบออก วางโค้ดจาก GitHub แล้วกด Deploy

## ตั้งค่า Variables and Secrets

ไปที่ Worker → Settings → Variables and Secrets แล้วสร้าง:

| Name | Type | Value |
|---|---|---|
| `P6VC_GAS_EXEC_URL` | Text | `https://script.google.com/macros/s/AKfycby15c-Aux2za0BuedeIYni8-tc6rkf9ZVNmw-6ZMTgPvG9SvFjuQVSzNoMouiMhqTmxrA/exec` |
| `BRIDGE_ACCESS_KEY` | **Secret** | random secret >=32 characters |
| `TEST_LOGIN_USERNAME` | Text | `admin` (only for temporary isolated POC) |
| `TEST_LOGIN_PASSWORD` | **Secret** | password of the test account (do not put in GitHub) |

ให้ใช้คีย์สำหรับ Bridge ที่ไม่ซ้ำกับ Password ของ GAS ควรสุ่มความยาวอย่างน้อย 32 อักขระ เก็บแบบ Secret เท่านั้น ห้ามเผยในแชทหรือไฟล์/Issue ใด ๆ

## ทดสอบ

เปิด `https://p6vc-api-test-console.thaipoliceregion6.workers.dev/` ใส่ Bridge Access Key ของคุณ (ไม่ใช่รหัสผ่าน admin)

- **Health API** ต้องได้ PASS 2/2
- **Login** ต้องได้ PASS 8/8 เมื่อกำหนดบัญชีและรหัสผ่านถูกต้อง
- ตรวจหน้า GAS Executions ในเวลาเดียวกัน และกดคัดลอกรายงาน JSON ซึ่งตัดรหัสผ่านและ Session Token ออกแล้ว

## Security boundaries

- Worker รับเพียง health และ auth test suite เท่านั้น ไม่รับ URL หรือ payload จาก Browser
- ห้ามเก็บ plaintext credential ใน GitHub หรือในข้อความที่คัดลอกกลับมา
- Secret ที่เปิดเผยในแชทก่อนหน้าควรถูกเปลี่ยนก่อนใช้งานจริง
- Endpoint ของ Cloudflare อยู่บนอินเทอร์เน็ต แม้จะมี BRIDGE_ACCESS_KEY; ก่อนใช้ production ให้เพิ่ม Cloudflare Access และ Rate Limiting
- Login Test สร้าง security event และ session ชั่วคราว จะพยายาม Logout เมื่อ Login สำเร็จ แต่หาก Logout ล้มเหลวต้องตรวจ Session ในฐานข้อมูล
- Source บน Branch แยกสำหรับการทดลอง ไม่ควร merge / deploy อัตโนมัติโดยไม่มี QA และผู้ใช้ตรวจรับ
