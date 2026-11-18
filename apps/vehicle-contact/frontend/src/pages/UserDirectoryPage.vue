<script setup>
import { computed, inject, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { userDirectoryRepositoryKey } from '../application/users/user-directory-port.js'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import UserDirectoryList from '../features/user-directory/components/UserDirectoryList.vue'
import { useUserDirectory } from '../features/user-directory/useUserDirectory.js'
import { useSessionStore } from '../stores/session.js'

const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const repository = inject(userDirectoryRepositoryKey)
const directory = useUserDirectory({ repository, permissions })
const errorCopy = computed(() => directory.phase.value === 'recoverable-error'
  ? 'ยังโหลดรายชื่อไม่ได้ ไม่มีข้อมูลผู้ใช้ถูกเปลี่ยนแปลง ลองอีกครั้งได้'
  : 'ระบบไม่สามารถอ่านรายชื่อผู้ใช้ได้ กรุณาแจ้งเจ้าหน้าที่สนับสนุน')

onMounted(() => directory.load())
</script>

<template>
  <PageTemplateComponent eyebrow="การดูแลระบบ" title="ผู้ใช้และสิทธิ์" description="ตรวจสอบบัญชี หน่วยงาน และสถานะที่ระบบส่วนกลางอนุญาตให้เห็น">
    <template #breadcrumbs><span class="text-base-content"><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span aria-hidden="true"> / </span><span aria-current="page">ผู้ใช้และสิทธิ์</span></span></template>
    <template #actions><span class="badge badge-ghost">อ่านอย่างเดียว</span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>

    <section aria-live="polite" aria-atomic="false">
      <div v-if="directory.phase.value === 'idle' || directory.phase.value === 'loading'" class="space-y-3" role="status"><span class="sr-only">กำลังโหลดรายชื่อผู้ใช้</span><div class="skeleton h-16 w-full"></div><div class="skeleton h-16 w-full"></div><div class="skeleton h-16 w-full"></div></div>
      <div v-else-if="directory.phase.value === 'empty'" class="alert alert-info items-start shadow-none"><div><h2 class="font-medium">ยังไม่มีบัญชีผู้ใช้</h2><p class="mt-1">ระบบส่วนกลางไม่ได้คืนบัญชีภายใต้ขอบเขตนี้</p></div></div>
      <div v-else-if="directory.phase.value === 'forbidden'" class="alert alert-warning items-start shadow-none"><div><h2 class="font-medium">ไม่สามารถอ่านรายชื่อได้</h2><p class="mt-1">เซสชันนี้ไม่มีสิทธิ์จัดการผู้ใช้ ไม่มีข้อมูลบัญชีถูกเปิดเผย</p></div></div>
      <div v-else-if="directory.phase.value === 'unauthenticated'" class="alert alert-warning items-start shadow-none"><div><h2 class="font-medium">เซสชันสิ้นสุดแล้ว</h2><p class="mt-1">เข้าสู่ระบบใหม่ก่อนอ่านรายชื่อ</p><RouterLink class="btn btn-sm mt-3" :to="{ name: 'sign-in' }">เข้าสู่ระบบ</RouterLink></div></div>
      <div v-else-if="directory.phase.value === 'recoverable-error' || directory.phase.value === 'error'" class="alert alert-error items-start shadow-none"><div class="w-full"><h2 class="font-medium">โหลดรายชื่อไม่สำเร็จ</h2><p class="mt-1">{{ errorCopy }}</p><button v-if="directory.phase.value === 'recoverable-error'" class="btn btn-sm mt-3" type="button" @click="directory.load">ลองอีกครั้ง</button><details v-if="directory.failure.value?.requestId" class="collapse collapse-arrow mt-3 bg-base-100 text-base-content"><summary class="collapse-title font-medium">รายละเอียดสำหรับเจ้าหน้าที่สนับสนุน</summary><div class="collapse-content break-all font-mono text-sm">{{ directory.failure.value.requestId }}</div></details></div></div>
      <UserDirectoryList v-else-if="directory.phase.value === 'success'" :users="directory.result.value.users" />
    </section>

    <template #footer><p class="text-sm text-base-content/70">หน้านี้ยังไม่แก้ไข ระงับ รีเซ็ตรหัสผ่าน หรือมอบหมายบทบาท</p></template>
  </PageTemplateComponent>
</template>
