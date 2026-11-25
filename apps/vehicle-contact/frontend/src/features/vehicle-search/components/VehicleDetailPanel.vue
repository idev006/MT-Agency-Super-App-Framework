<script setup>
import { computed, inject, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { qrGovernanceRepositoryKey } from '../../../application/qr/qr-governance-port.js'
import { vehicleDetailRepositoryKey } from '../../../application/vehicles/vehicle-detail-port.js'
import VehicleDetailTabs from './VehicleDetailTabs.vue'
import { useVehicleDetail } from '../useVehicleDetail.js'
import { useSessionStore } from '../../../stores/session.js'

// VC-ADR-037: the vehicle detail content, shared by the detail page and the registry drawer.
const props = defineProps({ vehicleId: { type: String, required: true }, showActions: { type: Boolean, default: false } })
const auth = useSessionStore()
const { permissions } = storeToRefs(auth)
const detailRepository = inject(vehicleDetailRepositoryKey)
const detail = useVehicleDetail({ repository: detailRepository, permissions })
const loadPhoto = typeof detailRepository?.photo === 'function' ? (args) => detailRepository.photo(args) : null
const qrRepository = inject(qrGovernanceRepositoryKey, null)
const permissionSet = computed(() => new Set(permissions.value))
// VC-ADR-036 S3: QR history tab only for qr.manage holders (server enforces the same permission)
const loadQrHistory = computed(() => (permissionSet.value.has('qr.manage') && typeof qrRepository?.history === 'function' ? (id) => qrRepository.history(id) : null))
const errorCopy = computed(() => detail.phase.value === 'recoverable-error'
  ? 'ยังเชื่อมต่อระบบส่วนกลางไม่ได้ ข้อมูลไม่มีการเปลี่ยนแปลง ลองอีกครั้งได้'
  : 'ระบบไม่สามารถโหลดรายละเอียดได้ ข้อมูลไม่มีการเปลี่ยนแปลง กรุณาแจ้งเจ้าหน้าที่สนับสนุน')
watch(() => props.vehicleId, (id) => { if (id) detail.load(id) }, { immediate: true })
</script>

<template>
  <div class="space-y-4">
    <div v-if="showActions && detail.phase.value === 'success'" class="flex flex-wrap gap-2">
      <RouterLink v-if="permissionSet.has('vehicle.update')" class="btn btn-sm btn-primary" :to="{ name: 'vehicle-maintenance', params: { vehicleId } }">แก้ไขข้อมูล</RouterLink>
      <RouterLink v-if="permissionSet.has('qr.manage')" class="btn btn-sm" :to="{ name: 'qr-governance', query: { vehicleId } }">จัดการ QR</RouterLink>
      <RouterLink class="btn btn-sm btn-ghost" :to="{ name: 'vehicle-detail', params: { vehicleId }, query: { from: 'registry' } }">เปิดเป็นหน้าเต็ม</RouterLink>
    </div>
    <section aria-live="polite" aria-atomic="false">
      <div v-if="detail.phase.value === 'loading'" class="space-y-4" role="status"><span class="sr-only">กำลังโหลดรายละเอียด</span><div class="skeleton h-40 w-full"></div><div class="grid gap-4 sm:grid-cols-2"><div class="skeleton h-40"></div><div class="skeleton h-40"></div></div></div>
      <div v-else-if="detail.phase.value === 'empty'" class="alert alert-info items-start shadow-none"><div><h2 class="font-medium">ไม่พบยานพาหนะที่ใช้งานอยู่</h2><p class="mt-1">ไม่พบรถที่ใช้งานอยู่ตามรหัสนี้ หรือรถถูกยกเลิกแล้ว</p></div></div>
      <div v-else-if="detail.phase.value === 'forbidden'" class="alert alert-warning items-start shadow-none"><div><h2 class="font-medium">ไม่สามารถดูรายละเอียดได้</h2><p class="mt-1">เซสชันนี้ไม่ได้รับอนุญาตให้ค้นหายานพาหนะ ไม่มีข้อมูลถูกเปิดเผย</p></div></div>
      <div v-else-if="detail.phase.value === 'unauthenticated'" class="alert alert-warning items-start shadow-none"><div><h2 class="font-medium">เซสชันสิ้นสุดแล้ว</h2><p class="mt-1">เข้าสู่ระบบใหม่ก่อนดูรายละเอียด ไม่มีข้อมูลถูกเปลี่ยนแปลง</p><RouterLink class="btn btn-sm mt-3" :to="{ name: 'sign-in' }">เข้าสู่ระบบ</RouterLink></div></div>
      <div v-else-if="detail.phase.value === 'recoverable-error' || detail.phase.value === 'error'" class="alert alert-error items-start shadow-none"><div class="w-full"><h2 class="font-medium">โหลดรายละเอียดไม่สำเร็จ</h2><p class="mt-1">{{ errorCopy }}</p><button v-if="detail.phase.value === 'recoverable-error'" class="btn btn-sm mt-3" type="button" @click="detail.retry">ลองอีกครั้ง</button><details v-if="detail.failure.value?.requestId" class="collapse collapse-arrow mt-3 bg-base-100 text-base-content"><summary class="collapse-title font-medium">รายละเอียดสำหรับเจ้าหน้าที่สนับสนุน</summary><div class="collapse-content break-all font-mono text-sm">{{ detail.failure.value.requestId }}</div></details></div></div>
      <VehicleDetailTabs v-else-if="detail.phase.value === 'success'" :result="detail.result.value" :load-photo="loadPhoto" :load-qr-history="loadQrHistory" :can-read-contacts="permissionSet.has('vehicle.contact.read')" :can-read-photos="permissionSet.has('vehicle.photos.read')" :can-read-history="permissionSet.has('vehicle.history.read')" />
    </section>
  </div>
</template>
