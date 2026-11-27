<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { loadRememberedCredentials, saveRememberedCredentials } from '../../application/auth/remembered-credentials.js'
import { useSessionStore } from '../../stores/session.js'
import { signInMessage } from '../../application/auth/sign-in-messages.js'
import { safeRedirect } from '../../application/auth/safe-redirect.js'
const router = useRouter()
const route = useRoute()
const auth = useSessionStore()
const { busy, phase, endpointValid, error } = storeToRefs(auth)
const form = reactive({ ...loadRememberedCredentials() })
const showPassword = ref(false)
function toggleRememberPassword(value) {
  form.rememberPassword = value
  if (value) form.rememberUsername = true
}
async function submit() {
  const passwordForStorage = form.password
  if (!(await auth.signIn(form.username.trim(), form.password))) return
  saveRememberedCredentials({ ...form, password: passwordForStorage })
  form.password = form.rememberPassword ? passwordForStorage : ''
  const back = safeRedirect(route.query.redirect)
  await router.replace(back || { name: 'dashboard' })
}
</script>
<template>
  <form class="space-y-5" @submit.prevent="submit">
    <label class="field-stack"><span class="label-text font-semibold">ชื่อผู้ใช้</span><input v-model="form.username" class="input input-bordered" type="text" autocomplete="username" required /></label>
    <label class="field-stack">
      <span class="label-text font-semibold">รหัสผ่าน</span>
      <div class="join w-full">
        <input v-model="form.password" class="input join-item input-bordered min-w-0 flex-1" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" required />
        <button class="btn join-item" type="button" @click="showPassword = !showPassword">{{ showPassword ? 'ซ่อน' : 'แสดง' }}</button>
      </div>
    </label>
    <div class="space-y-2 rounded-xl border border-base-300 p-3">
      <label class="flex cursor-pointer items-center gap-3 text-sm"><input v-model="form.rememberUsername" class="checkbox checkbox-primary checkbox-sm" type="checkbox" :disabled="form.rememberPassword" /><span>จำชื่อผู้ใช้บนอุปกรณ์นี้</span></label>
      <label class="flex cursor-pointer items-center gap-3 text-sm"><input class="checkbox checkbox-warning checkbox-sm" type="checkbox" :checked="form.rememberPassword" @change="toggleRememberPassword($event.target.checked)" /><span>จำรหัสผ่าน <strong class="font-semibold underline decoration-warning decoration-2">(POC เท่านั้น)</strong></span></label>
      <p v-if="form.rememberPassword" class="text-xs leading-5 text-warning">รหัสผ่านจะถูกเก็บใน Browser Storage และ JavaScript บน origin เดียวกันสามารถอ่านได้ ห้ามใช้กับระบบ production</p>
    </div>
    <div v-if="error" class="alert alert-error items-start text-sm" role="alert"><span aria-hidden="true">!</span><div><p class="font-semibold">{{ signInMessage(error) }}</p><small class="font-mono opacity-80">{{ error.code }}<template v-if="error.requestId"> · {{ error.requestId }}</template></small></div></div>
    <button class="btn btn-primary w-full" type="submit" :disabled="busy || !endpointValid || !form.username.trim() || !form.password">
      <span v-if="phase === 'signing-in'" class="loading loading-spinner loading-sm"></span>{{ phase === 'signing-in' ? 'กำลังเข้าสู่ระบบ' : 'เข้าสู่ระบบ' }}
    </button>
    <p v-if="!endpointValid" class="alert alert-warning text-sm" role="alert">ยังไม่ได้กำหนดการเชื่อมต่อระบบในรุ่นนี้ กรุณาติดต่อผู้ดูแลระบบ</p>
  </form>
</template>
