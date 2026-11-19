import { ref } from 'vue'
import { assertAccountSecurityRepository } from '../../application/auth/account-security-port.js'

export function useAccountSecurity({ repository, onReauthenticate = async () => {} }) {
  const source = assertAccountSecurityRepository(repository)
  const phase = ref('idle')
  const failure = ref(null)
  const success = ref('')

  function capture(error) {
    failure.value = { code: typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR', requestId: typeof error?.requestId === 'string' ? error.requestId : '' }
    phase.value = 'error'
  }

  async function changePassword(input) {
    phase.value = 'submitting'; failure.value = null; success.value = ''
    try {
      const result = await source.changePassword(input)
      if (result.reauthenticate !== true) throw Object.assign(new Error('reauthentication contract missing'), { code: 'INVALID_ACCOUNT_SECURITY_RESPONSE' })
      phase.value = 'success'; success.value = 'เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบใหม่'
      await onReauthenticate()
      return true
    } catch (error) { capture(error); return false }
  }

  async function linkGoogle(input) {
    phase.value = 'submitting'; failure.value = null; success.value = ''
    try {
      await source.linkGoogle(input)
      phase.value = 'success'; success.value = 'เชื่อมโยงบัญชี Google แล้ว'
      return true
    } catch (error) { capture(error); return false }
  }

  return { phase, failure, success, changePassword, linkGoogle }
}
