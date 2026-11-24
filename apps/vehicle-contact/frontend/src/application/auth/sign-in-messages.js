// R1: the sign-in error shows a Thai sentence that says what to do next; the code stays visible
// (small) for support. Unknown codes fall back to the message the client already produced.
const MESSAGES = Object.freeze({
  INVALID_CREDENTIALS: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง',
  LOGIN_RATE_LIMIT: 'พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่',
  NETWORK_ERROR: 'เชื่อมต่อระบบส่วนกลางไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
})

export function signInMessage(error) {
  if (!error) return ''
  if (MESSAGES[error.code]) return MESSAGES[error.code]
  if (/^HTTP_5\d\d$/.test(String(error.code))) return 'ระบบส่วนกลางขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง'
  return error.message || 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
}
