<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import AppHeader from '../components/layout/AppHeader.vue'
import AppSidebar from '../components/layout/AppSidebar.vue'
import AppFooter from '../components/layout/AppFooter.vue'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import { useSessionStore } from '../stores/session.js'
import { useUiStore } from '../stores/ui.js'
const router = useRouter()
const auth = useSessionStore()
const ui = useUiStore()
const { busy } = storeToRefs(auth)
const confirmSignOut = ref(false)
async function signOut() {
  await auth.signOut()
  confirmSignOut.value = false
  await router.replace({ name: 'sign-in' })
}
</script>
<template>
  <div class="drawer min-h-dvh lg:drawer-open">
    <input v-model="ui.navigationOpen" class="drawer-toggle" type="checkbox" aria-label="เปิดเมนูหลัก" />
    <div class="drawer-content flex min-h-dvh min-w-0 flex-col bg-base-200">
      <AppHeader @request-signout="confirmSignOut = true" />
      <main class="min-w-0 flex-1"><RouterView /></main>
      <AppFooter />
    </div>
    <div class="drawer-side z-30">
      <label class="drawer-overlay" aria-label="ปิดเมนู" @click="ui.closeNavigation"></label>
      <AppSidebar />
    </div>
  </div>
  <ConfirmDialog :open="confirmSignOut" title="ยืนยันการออกจากระบบ" message="Session ปัจจุบันจะถูกยกเลิกที่ GAS และคุณต้องเข้าสู่ระบบใหม่เพื่อใช้งานต่อ" confirm-label="ออกจากระบบ" :busy="busy" @cancel="confirmSignOut = false" @confirm="signOut" />
</template>
