<script setup>
import { computed, inject } from 'vue'
import { storeToRefs } from 'pinia'
import { vehicleSearchRepositoryKey } from '../application/vehicles/vehicle-search-port.js'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import VehicleSearchForm from '../features/vehicle-search/components/VehicleSearchForm.vue'
import VehicleSearchResult from '../features/vehicle-search/components/VehicleSearchResult.vue'
import { vehicleDetailRepositoryKey } from '../application/vehicles/vehicle-detail-port.js'
import { useVehicleSearch } from '../features/vehicle-search/useVehicleSearch.js'
import { useSessionStore } from '../stores/session.js'

const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const repository = inject(vehicleSearchRepositoryKey)
const search = useVehicleSearch({ repository, permissions })
const permissionSet = computed(() => new Set(permissions.value))
const errorCopy = computed(() => search.phase.value === 'recoverable-error'
  ? 'ยังเชื่อมต่อระบบส่วนกลางไม่ได้ ข้อมูลไม่มีการเปลี่ยนแปลง ลองอีกครั้งได้'
  : 'ระบบไม่สามารถค้นหาได้ ข้อมูลไม่มีการเปลี่ยนแปลง กรุณาแจ้งเจ้าหน้าที่สนับสนุน')
// the result shows the vehicle photo (front at once, others on tap); every view is audited server-side
const detailRepository = inject(vehicleDetailRepositoryKey, null)
const loadPhoto = typeof detailRepository?.photo === 'function' ? (args) => detailRepository.photo(args) : null
</script>

<template>
  <PageTemplateComponent eyebrow="งานค้นหา" title="ค้นหายานพาหนะ" description="ค้นหารถด้วยทะเบียนและจังหวัด แล้วติดต่อผู้ประสานงานได้ทันที">
    <template #breadcrumbs><span class="text-base-content"><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span aria-hidden="true"> / </span><span aria-current="page">ค้นหายานพาหนะ</span></span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>
    <template #toolbar><VehicleSearchForm :busy="search.phase.value === 'loading'" @search="search.search" /></template>

    <section aria-live="polite" aria-atomic="false">
      <div v-if="search.phase.value === 'idle'" class="alert items-start shadow-none"><div><h2 class="font-medium">พร้อมค้นหา</h2><p class="mt-1">กรอกทะเบียนและเลือกจังหวัด ระบบค้นหาทีละคันเท่านั้น</p></div></div>
      <div v-else-if="search.phase.value === 'loading'" class="space-y-4" role="status"><span class="sr-only">กำลังค้นหายานพาหนะ</span><div class="skeleton h-40 w-full"></div><div class="grid gap-4 sm:grid-cols-2"><div class="skeleton h-40"></div><div class="skeleton h-40"></div></div></div>
      <div v-else-if="search.phase.value === 'empty'" class="alert alert-info items-start shadow-none"><div><h2 class="font-medium">ไม่พบยานพาหนะ</h2><p class="mt-1">ไม่พบรถที่ใช้งานอยู่ตามทะเบียนและจังหวัดนี้ ตรวจสอบข้อมูลแล้วค้นหาใหม่</p></div></div>
      <div v-else-if="search.phase.value === 'forbidden'" class="alert alert-warning items-start shadow-none"><div><h2 class="font-medium">ไม่สามารถค้นหาได้</h2><p class="mt-1">เซสชันนี้ไม่ได้รับอนุญาตให้ค้นหายานพาหนะ ไม่มีข้อมูลถูกเปิดเผย</p></div></div>
      <div v-else-if="search.phase.value === 'unauthenticated'" class="alert alert-warning items-start shadow-none"><div><h2 class="font-medium">เซสชันสิ้นสุดแล้ว</h2><p class="mt-1">เข้าสู่ระบบใหม่ก่อนค้นหา ไม่มีข้อมูลถูกเปลี่ยนแปลง</p><RouterLink class="btn btn-sm mt-3" :to="{ name: 'sign-in' }">เข้าสู่ระบบ</RouterLink></div></div>
      <div v-else-if="search.phase.value === 'recoverable-error' || search.phase.value === 'error'" class="alert alert-error items-start shadow-none"><div class="w-full"><h2 class="font-medium">ค้นหาไม่สำเร็จ</h2><p class="mt-1">{{ errorCopy }}</p><button v-if="search.phase.value === 'recoverable-error'" class="btn btn-sm mt-3" type="button" @click="search.retry">ลองอีกครั้ง</button><details v-if="search.failure.value?.requestId" class="collapse collapse-arrow mt-3 bg-base-100 text-base-content"><summary class="collapse-title font-medium">รายละเอียดสำหรับเจ้าหน้าที่สนับสนุน</summary><div class="collapse-content break-all font-mono text-sm">{{ search.failure.value.requestId }}</div></details></div></div>
      <VehicleSearchResult v-else-if="search.phase.value === 'success'" :result="search.result.value" :load-photo="loadPhoto" :can-read-contacts="permissionSet.has('vehicle.contact.read')" :can-read-photos="permissionSet.has('vehicle.photos.read')" :can-read-history="permissionSet.has('vehicle.history.read')" />
    </section>
  </PageTemplateComponent>
</template>
