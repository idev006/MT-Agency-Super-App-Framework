<script setup>
import { inject, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { accountSecurityRepositoryKey } from '../application/auth/account-security-port.js'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import { useAccountSecurity } from '../features/account-security/useAccountSecurity.js'
import { useSessionStore } from '../stores/session.js'

const router = useRouter()
const auth = useSessionStore()
const { roles, session, transport } = storeToRefs(auth)
const repository = inject(accountSecurityRepositoryKey)
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const googleForm = reactive({ password: '', idToken: '' })
const security = useAccountSecurity({
  repository,
  onReauthenticate: async () => {
    passwordForm.oldPassword = ''; passwordForm.newPassword = ''; passwordForm.confirmPassword = ''
    await auth.signOut()
    auth.error = null
    await router.replace({ name: 'sign-in', query: { reason: 'password-changed' } })
  },
})

async function changePassword() {
  if (passwordForm.newPassword !== passwordForm.confirmPassword) return
  await security.changePassword({ oldPassword: passwordForm.oldPassword, newPassword: passwordForm.newPassword })
}
async function linkGoogle() {
  const payload = { password: googleForm.password, idToken: googleForm.idToken }
  googleForm.password = ''; googleForm.idToken = ''
  await security.linkGoogle(payload)
}
</script>

<template>
  <PageTemplateComponent eyebrow="บัญชีผู้ใช้" title="บัญชีและความปลอดภัย" description="เปลี่ยนรหัสผ่านหรือเชื่อมโยงบัญชี Google โดยให้ระบบส่วนกลางตรวจสอบทุกครั้ง">
    <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span aria-hidden="true"> / </span><span aria-current="page">บัญชีและความปลอดภัย</span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>

    <div v-if="security.failure.value" class="alert alert-error mb-5 items-start" role="alert"><div><strong>ดำเนินการไม่สำเร็จ</strong><p class="mt-1">{{ security.failure.value.code === 'INVALID_CREDENTIALS' ? 'รหัสผ่านปัจจุบันไม่ถูกต้อง' : 'ระบบปฏิเสธคำขอ กรุณาตรวจสอบข้อมูลแล้วลองใหม่' }}</p><small v-if="security.failure.value.requestId" class="font-mono">{{ security.failure.value.requestId }}</small></div></div>
    <div v-if="security.success.value" class="alert alert-success mb-5" role="status">{{ security.success.value }}</div>

    <div class="grid gap-5 xl:grid-cols-2">
      <form class="card card-border bg-base-100" @submit.prevent="changePassword">
        <div class="card-body gap-4"><h2 class="card-title">เปลี่ยนรหัสผ่าน</h2><p class="text-base-content/70">เมื่อสำเร็จ ระบบจะเพิกถอนทุกเซสชันและให้เข้าสู่ระบบใหม่</p>
          <label class="field-stack"><span class="label-text font-medium">รหัสผ่านปัจจุบัน</span><input v-model="passwordForm.oldPassword" class="input input-bordered w-full" type="password" autocomplete="current-password" required /></label>
          <label class="field-stack"><span class="label-text font-medium">รหัสผ่านใหม่</span><input v-model="passwordForm.newPassword" class="input input-bordered w-full" type="password" autocomplete="new-password" minlength="12" maxlength="128" required /><span class="text-sm text-base-content/60">12–128 ตัวอักษร</span></label>
          <label class="field-stack"><span class="label-text font-medium">ยืนยันรหัสผ่านใหม่</span><input v-model="passwordForm.confirmPassword" class="input input-bordered w-full" type="password" autocomplete="new-password" required /></label>
          <p v-if="passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword" class="text-sm text-error">รหัสผ่านใหม่ไม่ตรงกัน</p>
          <div class="card-actions justify-end"><button class="btn btn-primary" type="submit" :disabled="security.phase.value === 'submitting' || passwordForm.newPassword !== passwordForm.confirmPassword"><span v-if="security.phase.value === 'submitting'" class="loading loading-spinner loading-sm"></span>เปลี่ยนรหัสผ่าน</button></div>
        </div>
      </form>

      <form class="card card-border bg-base-100" @submit.prevent="linkGoogle">
        <div class="card-body gap-4"><h2 class="card-title">เชื่อมโยงบัญชี Google</h2><p class="text-base-content/70">ใช้ข้อมูลยืนยันจาก Google ที่ออกให้กับระบบนี้เท่านั้น ระบบจะไม่บันทึกข้อมูลยืนยันไว้ในเบราว์เซอร์</p>
          <label class="field-stack"><span class="label-text font-medium">รหัสผ่านปัจจุบัน</span><input v-model="googleForm.password" class="input input-bordered w-full" type="password" autocomplete="current-password" required /></label>
          <label class="field-stack"><span class="label-text font-medium">ข้อมูลยืนยันจาก Google</span><textarea v-model="googleForm.idToken" class="textarea textarea-bordered min-h-32 w-full" autocomplete="off" required></textarea></label>
          <div class="alert alert-warning text-sm">ใช้เฉพาะสภาพแวดล้อมทดสอบจนกว่าจะเชื่อม Google Identity widget และ client ID ที่ได้รับอนุมัติ</div>
          <div class="card-actions justify-end"><button class="btn btn-primary" type="submit" :disabled="security.phase.value === 'submitting'"><span v-if="security.phase.value === 'submitting'" class="loading loading-spinner loading-sm"></span>เชื่อมโยง Google</button></div>
        </div>
      </form>
    </div>
  </PageTemplateComponent>
</template>
