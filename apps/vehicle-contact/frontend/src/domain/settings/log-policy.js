// VC-ADR-040 log policy (owner 2026-11-26: "ควรให้ system admin ตั้งค่าการบันทึก logs ต่างๆ ได้"). The server owns the
// rules (which kinds may be switched off, min / max days); this file only names them for people.
export const LOG_KINDS = Object.freeze({
  LOOKUP: Object.freeze({ label: 'ค้นหา / เปิดดูรถ', use: 'ค้นด้วยป้ายทะเบียน สแกน QR และเปิดหน้ารายละเอียดรถ (รวมกรณีค้นไม่พบ)', offWarning: 'ถ้าปิด จะตรวจย้อนไม่ได้ว่าใครค้นหรือเปิดดูรถคันไหน' }),
  CONTACT: Object.freeze({ label: 'ดูเบอร์ติดต่อ', use: 'ตรวจย้อนว่าใครดูเบอร์ของใคร (ทางเดียวที่ตามได้ถ้าเบอร์รั่ว)' }),
  PHOTO: Object.freeze({ label: 'ดูรูปรถ', use: 'ทุกครั้งที่เปิดรูป ทั้งรูปรถและรูปในคำขอที่รออนุมัติ ซ้ำกับการเปิดดูรถ จึงไม่บันทึกเป็นค่าเริ่มต้น', offWarning: 'ถ้าปิด จะไม่รู้ว่าใครเปิดรูปไหน (ยังรู้ว่าใครเปิดดูรถ)' }),
  CHANGE: Object.freeze({ label: 'ประวัติการแก้ไข', use: 'อนุมัติ แก้ไขรถ ออก QR ผู้ใช้ ตั้งค่า (ก่อน/หลัง) ใช้ในแท็บประวัติของรถ' }),
  LOGIN: Object.freeze({ label: 'การเข้าสู่ระบบ', use: 'ใช้ล็อกบัญชีเมื่อใส่รหัสผ่านผิดหลายครั้ง' }),
})

const int = (v) => (Number.isSafeInteger(v) ? v : null)

// Server list → [{code, label, use, enabled, days, canDisable, minDays, maxDays, allowForever}]; null if absent (older backend).
export function toLogPolicy(list) {
  if (!Array.isArray(list)) return null
  const out = []
  for (const x of list) {
    if (!x || !LOG_KINDS[x.code] || typeof x.enabled !== 'boolean' || int(x.days) === null) return null
    out.push(Object.freeze({ code: x.code, ...LOG_KINDS[x.code], enabled: x.enabled, days: x.days, canDisable: x.canDisable === true,
      minDays: int(x.minDays) ?? 1, maxDays: int(x.maxDays) ?? 3650, allowForever: x.allowForever === true,
      defaultEnabled: x.defaultEnabled === true, defaultDays: int(x.defaultDays) }))
  }
  return Object.freeze(out)
}

export function toLogCounts(value) {
  if (!value || typeof value !== 'object') return null
  return Object.freeze(Object.fromEntries(Object.keys(LOG_KINDS).map((k) => [k, int(value[k])])))
}

export const validLogDays = (kind, days) => Number.isSafeInteger(days) && (days === 0 ? kind.allowForever : days >= kind.minDays && days <= kind.maxDays)

export function daysText(days) {
  if (days === 0) return 'ไม่จำกัด'
  if (days % 365 === 0) return `${days} วัน (${days / 365} ปี)`
  return `${days} วัน`
}
