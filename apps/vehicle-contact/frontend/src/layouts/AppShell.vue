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
  <a class="btn btn-primary fixed left-3 top-3 z-50 -translate-y-24 focus:translate-y-0" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
  <div class="drawer min-h-dvh lg:drawer-open">
    <input v-model="ui.navigationOpen" class="drawer-toggle" type="checkbox" tabindex="-1" aria-hidden="true" />
    <div class="drawer-content flex min-h-dvh min-w-0 flex-col bg-base-200">
      <AppHeader @request-signout="confirmSignOut = true" />
      <main id="main-content" class="min-w-0 flex-1" tabindex="-1"><RouterView /></main>
      <AppFooter />
    </div>
    <div class="drawer-side z-40">
      <div class="drawer-overlay" aria-hidden="true" @click="ui.closeNavigation"></div>
      <AppSidebar />
    </div>
  </div>
  <ConfirmDialog :open="confirmSignOut" title="ออกจากระบบหรือไม่" message="ระบบจะสิ้นสุดเซสชันนี้ และคุณต้องเข้าสู่ระบบอีกครั้งเมื่อต้องการใช้งานต่อ" confirm-label="ออกจากระบบ" :busy="busy" @cancel="confirmSignOut = false" @confirm="signOut" />
</template>
