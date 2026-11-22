<script setup>
import { computed, inject, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { vehicleRegistryRepositoryKey } from '../application/vehicles/vehicle-registry-port.js'
import PaginationControl from '../components/common/PaginationControl.vue'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import { formatBangkokDateTime } from '../domain/time/bangkok-date-time.js'
import { useVehicleRegistry } from '../features/vehicle-registry/useVehicleRegistry.js'
import { useSessionStore } from '../stores/session.js'

const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const work = useVehicleRegistry({ repository: inject(vehicleRegistryRepositoryKey), permissions })
const canDetail = computed(() => (permissions.value || []).includes('vehicle.lookup'))

const statusLabels = { ACTIVE: 'ใช้งาน', INACTIVE: 'ระงับ' }
const statusBadge = { ACTIVE: 'badge-success', INACTIVE: 'badge-ghost' }

onMounted(work.load)
</script>

<template>
  <PageTemplateComponent eyebrow="ผู้ดูแลระบบ" title="ทะเบียนยานพาหนะที่อนุมัติ" description="รายการยานพาหนะที่อนุมัติแล้วทั้งหมดในระบบ (สถานะใช้งาน) สำหรับผู้ดูแลระบบ — แสดงเฉพาะข้อมูลรถ ไม่รวมข้อมูลผู้ประสานงาน">
    <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span> / ทะเบียนยานพาหนะ</span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>

    <div v-if="work.phase.value === 'loading'" class="flex min-h-24 items-center justify-center" role="status"><span class="loading loading-spinner"></span><span class="sr-only">กำลังโหลดรายการ</span></div>
    <div v-else-if="work.phase.value === 'forbidden'" class="alert alert-warning py-2" role="alert">เซสชันนี้ไม่มีสิทธิ์ดูทะเบียนยานพาหนะ</div>
    <div v-else-if="work.phase.value === 'unauthenticated'" class="alert alert-warning py-2" role="alert">เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง</div>
    <div v-else-if="work.phase.value === 'error'" class="alert alert-error py-2" role="alert"><span>โหลดรายการไม่สำเร็จ ({{ work.failure.value?.code }})</span><button class="btn btn-sm min-h-11 text-sm" type="button" @click="work.load">ลองอีกครั้ง</button></div>
    <div v-else-if="work.phase.value === 'empty'" class="alert alert-info py-2">ยังไม่มียานพาหนะที่อนุมัติแล้วในระบบ</div>

    <section v-else aria-labelledby="vehicle-registry-title">
      <h2 id="vehicle-registry-title" class="mb-2 text-base font-semibold">ยานพาหนะทั้งหมด {{ work.pagination.value.total }} คัน</h2>
      <ul class="list rounded-box border border-base-300 bg-base-100 [&>li]:py-2 xl:max-h-[calc(100vh-13rem)] xl:overflow-y-auto">
        <li v-for="vehicle in work.vehicles.value" :key="vehicle.vehicleId" class="list-row grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div class="min-w-0">
            <strong class="block truncate text-base">{{ vehicle.plate }} · {{ vehicle.province }}</strong>
            <p class="mt-0.5 text-sm text-base-content/65">{{ vehicle.brand }} {{ vehicle.model }} · {{ vehicle.color }}</p>
            <p class="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-base-content/60">
              <span class="badge badge-sm" :class="statusBadge[vehicle.status] || 'badge-ghost'">{{ statusLabels[vehicle.status] || vehicle.status }}</span>
              <span>อนุมัติเมื่อ {{ formatBangkokDateTime(vehicle.createdAt, '-') }}</span>
            </p>
          </div>
          <RouterLink v-if="canDetail" class="btn btn-sm min-h-11 text-sm" :to="{ name: 'vehicle-detail', params: { vehicleId: vehicle.vehicleId } }">ดูรายละเอียด</RouterLink>
        </li>
      </ul>
      <PaginationControl class="mt-3" :page="work.page.value" :page-size="work.pageSize.value" :total-items="work.pagination.value.total" :disabled="work.phase.value === 'loading'" label="แบ่งหน้าทะเบียนยานพาหนะ" @update:page="work.changePage" @update:page-size="work.changePageSize" />
    </section>

    <template #footer><p class="text-sm text-base-content/70">สิทธิ์บนหน้าจอช่วยนำทางเท่านั้น GAS จะตรวจสิทธิ์ vehicle.list ซ้ำก่อนส่งรายการ — ข้อมูลผู้ประสานงานดูได้เฉพาะหน้ารายละเอียดตามสิทธิ์</p></template>
  </PageTemplateComponent>
</template>