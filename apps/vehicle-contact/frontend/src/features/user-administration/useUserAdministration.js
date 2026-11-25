import { ref } from 'vue'
import { assertUserAdministrationRepository } from '../../application/users/user-directory-port.js'

export const USER_ROLES = Object.freeze(['STAFF', 'REGISTRATION_ADMIN', 'OWNER', 'SYSTEM_ADMIN', 'RETENTION_WORKER'])
export const FULL_HUMAN_ADMIN_ROLES = Object.freeze(['SYSTEM_ADMIN', 'REGISTRATION_ADMIN'])

export function useUserAdministration({ repository, reload }) {
  const source = assertUserAdministrationRepository(repository)
  const phase = ref('idle')
  const failure = ref(null)
  const success = ref('')

  async function execute(action, message) {
    phase.value = 'submitting'; failure.value = null; success.value = ''
    try {
      await action()
      success.value = message
      phase.value = 'success'
      await reload()
      return true
    } catch (error) {
      failure.value = { code: typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR', requestId: typeof error?.requestId === 'string' ? error.requestId : '' }
      phase.value = 'error'
      return false
    }
  }

  return {
    phase, failure, success,
    createUser: (payload) => execute(() => source.create(payload), 'สร้างบัญชีแล้ว ผู้ใช้ต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบ'),
    updateUser: (payload) => execute(() => source.update(payload), 'บันทึกข้อมูลบัญชีแล้ว'),
    suspendUser: (userId) => execute(() => source.suspend(userId), 'ระงับบัญชีและเพิกถอนเซสชันแล้ว'),
    // VC-ADR-036: SUSPENDED -> ACTIVE; old sessions stay revoked, the user signs in again.
    reactivateUser: (userId) => execute(() => source.reactivate(userId), 'เปิดใช้งานบัญชีอีกครั้งแล้ว ผู้ใช้ต้องเข้าสู่ระบบใหม่'),
    resetPassword: (userId, password) => execute(() => source.resetPassword(userId, password), 'รีเซ็ตรหัสผ่านและเพิกถอนเซสชันแล้ว'),
    assignRoles: (userId, roles) => execute(() => source.assignRoles(userId, roles), 'เปลี่ยนบทบาทและเพิกถอนเซสชันแล้ว'),
  }
}
