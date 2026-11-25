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
import { provinceLabel } from '../domain/reference/provinces.js'

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
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="vehicle-registry-title" class="text-base font-semibold">ยานพาหนะที่ใช้งานอยู่ {{ work.pagination.value.total }} คัน</h2>
        <RouterLink class="btn btn-sm min-h-11" :to="{ name: 'vehicle-search' }">ค้นหาทะเบียนเฉพาะคัน</RouterLink>
      </div>
      <!-- R7: a real table on wider screens (scan many vehicles at once); cards on phones. -->
      <div class="hidden overflow-x-auto rounded-box border border-base-300 bg-base-100 md:block">
        <table class="table table-zebra">
          <thead><tr><th>ทะเบียน</th><th>จังหวัด</th><th>ยี่ห้อ / รุ่น</th><th>สี</th><th>สถานะ</th><th>อนุมัติเมื่อ</th><th><span class="sr-only">การดำเนินการ</span></th></tr></thead>
          <tbody>
            <tr v-for="vehicle in work.vehicles.value" :key="vehicle.vehicleId">
              <td class="font-semibold">{{ vehicle.plate }}</td>
              <td>{{ provinceLabel(vehicle.province) || vehicle.province }}</td>
              <td>{{ [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || '—' }}</td>
              <td>{{ vehicle.color || '—' }}</td>
              <td><span class="badge badge-sm" :class="statusBadge[vehicle.status] || 'badge-ghost'">{{ statusLabels[vehicle.status] || vehicle.status }}</span></td>
              <td class="whitespace-nowrap">{{ formatBangkokDateTime(vehicle.createdAt, '-') }}</td>
              <td class="text-right"><RouterLink v-if="canDetail" class="btn btn-sm" :to="{ name: 'vehicle-detail', params: { vehicleId: vehicle.vehicleId }, query: { from: 'registry' } }">ดูรายละเอียด</RouterLink></td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul class="list rounded-box border border-base-300 bg-base-100 md:hidden">
        <li v-for="vehicle in work.vehicles.value" :key="vehicle.vehicleId" class="list-row grid-cols-1 gap-2">
          <div class="flex min-w-0 items-center gap-3"><span class="vehicle-plate vehicle-plate--sm"><strong class="text-lg leading-tight">{{ vehicle.plate }}</strong><span class="text-xs">{{ provinceLabel(vehicle.province) || vehicle.province }}</span></span><div class="min-w-0 text-sm"><p>{{ [vehicle.brand, vehicle.model, vehicle.color].filter(Boolean).join(' · ') }}</p><p class="text-base-content/80">อนุมัติ {{ formatBangkokDateTime(vehicle.createdAt, '-') }}</p></div></div>
          <RouterLink v-if="canDetail" class="btn btn-sm min-h-11" :to="{ name: 'vehicle-detail', params: { vehicleId: vehicle.vehicleId }, query: { from: 'registry' } }">ดูรายละเอียด</RouterLink>
        </li>
      </ul>
      <PaginationControl class="mt-3" :page="work.page.value" :page-size="work.pageSize.value" :total-items="work.pagination.value.total" :disabled="work.phase.value === 'loading'" label="แบ่งหน้าทะเบียนยานพาหนะ" @update:page="work.changePage" @update:page-size="work.changePageSize" />
    </section>

  </PageTemplateComponent>
</template>