import { onBeforeUnmount, onMounted, unref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

// P1.1 (E2E 2026-11-24): one-time secrets (campaign token, approval QR token) were lost when the
// user navigated away before copying — it happened in the live test. While a secret is on screen,
// leaving the page (route change, reload, tab close) asks for confirmation first.
export const LEAVE_SECRET_MESSAGE = 'รหัสนี้แสดงครั้งเดียว ถ้าออกจากหน้านี้จะดูอีกไม่ได้ คัดลอกหรือบันทึกแล้วหรือยัง?'

export function useOneTimeSecretGuard(secretShown, { confirm = (m) => globalThis.confirm(m) } = {}) {
  const onUnload = (event) => {
    if (!unref(secretShown)) return
    event.preventDefault()
    event.returnValue = ''
  }
  onMounted(() => globalThis.addEventListener?.('beforeunload', onUnload))
  onBeforeUnmount(() => globalThis.removeEventListener?.('beforeunload', onUnload))
  onBeforeRouteLeave(() => (unref(secretShown) ? confirm(LEAVE_SECRET_MESSAGE) : true))
  return { onUnload }
}

export async function copySecret(text) {
  try { await globalThis.navigator.clipboard.writeText(text); return true } catch { return false }
}

// A campaign is ACTIVE in the store until revoked; the window decides what users actually see.
export function campaignState(item, now = Date.now()) {
  if (item?.status !== 'ACTIVE') return { label: 'เพิกถอนแล้ว', tone: 'badge-ghost', active: false }
  const start = Date.parse(item.startsAt), end = Date.parse(item.endsAt)
  if (Number.isFinite(end) && end <= now) return { label: 'หมดเวลาแล้ว', tone: 'badge-ghost', active: false }
  if (Number.isFinite(start) && start > now) return { label: 'ยังไม่เริ่ม', tone: 'badge-info', active: true }
  if (Number(item.submittedCount) >= Number(item.maxSubmissions)) return { label: 'เต็มโควตา', tone: 'badge-warning', active: true }
  return { label: 'เปิดรับอยู่', tone: 'badge-success', active: true }
}
