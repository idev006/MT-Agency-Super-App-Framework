<script setup>
import { computed, inject, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { vehicleDetailRepositoryKey } from '../application/vehicles/vehicle-detail-port.js'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import VehicleDetailTabs from '../features/vehicle-search/components/VehicleDetailTabs.vue'
import { useVehicleDetail } from '../features/vehicle-search/useVehicleDetail.js'
import { useSessionStore } from '../stores/session.js'

const route = useRoute()
const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const detailRepository = inject(vehicleDetailRepositoryKey)
const detail = useVehicleDetail({ repository: detailRepository, permissions })
const loadPhoto = typeof detailRepository?.photo === 'function' ? (args) => detailRepository.photo(args) : null
// R7: breadcrumb follows where the user came from (registry vs search).
const fromRegistry = computed(() => route.query.from === 'registry')
const permissionSet = computed(() => new Set(permissions.value))
const errorCopy = computed(() => detail.phase.value === 'recoverable-error'
  ? 'ยังเชื่อมต่อระบบส่วนกลางไม่ได้ ข้อมูลไม่มีการเปลี่ยนแปลง ลองอีกครั้งได้'
  : 'ระบบไม่สามารถโหลดรายละเอียดได้ ข้อมูลไม่มีการเปลี่ยนแปลง กรุณาแจ้งเจ้าหน้าที่สนับสนุน')

onMounted(() => detail.load(route.params.vehicleId))
watch(() => route.params.vehicleId, (id) => { if (route.name === 'vehicle-detail') detail.load(id) })
</script>

<template>
  <PageTemplateComponent eyebrow="งานค้นหา" title="รายละเอียดยานพาหนะ" description="ดูข้อมูล ผู้ประสานงาน รูปประกอบ และประวัติตามสิทธิ์ของเซสชันนี้">
    <template #breadcrumbs><span class="text-base-content"><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span aria-hidden="true"> / </span><RouterLink v-if="fromRegistry" class="link" :to="{ name: 'vehicle-registry' }">ทะเบียนยานพาหนะ</RouterLink><RouterLink v-else class="link" :to="{ name: 'vehicle-search' }">ค้นหายานพาหนะ</RouterLink><span aria-hidden="true"> / </span><span aria-current="page">รายละเอียด</span></span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>
    <template #toolbar><div class="flex gap-2"><RouterLink class="btn btn-sm" :to="{ name: fromRegistry ? 'vehicle-registry' : 'vehicle-search' }">{{ fromRegistry ? 'กลับไปทะเบียน' : 'ค้นหาใหม่' }}</RouterLink><RouterLink v-if="permissionSet.has('vehicle.update') && detail.vehicleId.value" class="btn btn-sm btn-primary" :to="{ name: 'vehicle-maintenance', params: { vehicleId: detail.vehicleId.value } }">แก้ไขข้อมูล</RouterLink><RouterLink v-if="permissionSet.has('qr.manage') && detail.vehicleId.value" class="btn btn-sm" :to="{ name: 'qr-governance', query: { vehicleId: detail.vehicleId.value } }">จัดการ QR</RouterLink></div></template>

    <section aria-live="polite" aria-atomic="false">
      <div v-if="detail.phase.value === 'loading'" class="space-y-4" role="status"><span class="sr-only">กำลังโหลดรายละเอียด</span><div class="skeleton h-40 w-full"></div><div class="grid gap-4 sm:grid-cols-2"><div class="skeleton h-40"></div><div class="skeleton h-40"></div></div></div>
      <div v-else-if="detail.phase.value === 'empty'" class="alert alert-info items-start shadow-none"><div><h2 class="font-medium">ไม่พบยานพาหนะที่ใช้งานอยู่</h2><p class="mt-1">ไม่พบรถที่ใช้งานอยู่ตามรหัสนี้ หรือรถถูกยกเลิกแล้ว</p></div></div>
      <div v-else-if="detail.phase.value === 'forbidden'" class="alert alert-warning items-start shadow-none"><div><h2 class="font-medium">ไม่สามารถดูรายละเอียดได้</h2><p class="mt-1">เซสชันนี้ไม่ได้รับอนุญาตให้ค้นหายานพาหนะ ไม่มีข้อมูลถูกเปิดเผย</p></div></div>
      <div v-else-if="detail.phase.value === 'unauthenticated'" class="alert alert-warning items-start shadow-none"><div><h2 class="font-medium">เซสชันสิ้นสุดแล้ว</h2><p class="mt-1">เข้าสู่ระบบใหม่ก่อนดูรายละเอียด ไม่มีข้อมูลถูกเปลี่ยนแปลง</p><RouterLink class="btn btn-sm mt-3" :to="{ name: 'sign-in' }">เข้าสู่ระบบ</RouterLink></div></div>
      <div v-else-if="detail.phase.value === 'recoverable-error' || detail.phase.value === 'error'" class="alert alert-error items-start shadow-none"><div class="w-full"><h2 class="font-medium">โหลดรายละเอียดไม่สำเร็จ</h2><p class="mt-1">{{ errorCopy }}</p><button v-if="detail.phase.value === 'recoverable-error'" class="btn btn-sm mt-3" type="button" @click="detail.retry">ลองอีกครั้ง</button><details v-if="detail.failure.value?.requestId" class="collapse collapse-arrow mt-3 bg-base-100 text-base-content"><summary class="collapse-title font-medium">รายละเอียดสำหรับเจ้าหน้าที่สนับสนุน</summary><div class="collapse-content break-all font-mono text-sm">{{ detail.failure.value.requestId }}</div></details></div></div>
      <VehicleDetailTabs v-else-if="detail.phase.value === 'success'" :result="detail.result.value" :load-photo="loadPhoto" :can-read-contacts="permissionSet.has('vehicle.contact.read')" :can-read-photos="permissionSet.has('vehicle.photos.read')" :can-read-history="permissionSet.has('vehicle.history.read')" />
    </section>
  </PageTemplateComponent>
</template>