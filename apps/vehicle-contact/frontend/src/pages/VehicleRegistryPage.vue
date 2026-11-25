<script setup>
import { computed, inject, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DataTable from '../components/common/DataTable.vue'
import EntityDrawer from '../components/common/EntityDrawer.vue'
import StatusBadge from '../components/common/StatusBadge.vue'
import VehicleDetailPanel from '../features/vehicle-search/components/VehicleDetailPanel.vue'
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

// VC-ADR-037: detail opens in a drawer over the kept list. The open vehicle lives in the URL
// (?vehicle=<id>): shareable, and Back closes the drawer. The list is never reloaded for it.
const route = useRoute()
const router = useRouter()
const openId = computed(() => (typeof route.query.vehicle === 'string' ? route.query.vehicle : ''))
const openVehicle = computed(() => work.vehicles.value.find((v) => v.vehicleId === openId.value) || null)
let pushedHere = false
function openDetail(vehicle) { pushedHere = true; router.push({ query: { ...route.query, vehicle: vehicle.vehicleId } }) }
function closeDetail() {
  if (pushedHere) { pushedHere = false; router.back(); return }
  const { vehicle, ...rest } = route.query
  router.replace({ query: rest })
}
const drawerTitle = computed(() => (openVehicle.value ? `${openVehicle.value.plate} ${provinceLabel(openVehicle.value.province) || ''}`.trim() : 'รายละเอียดยานพาหนะ'))
const columns = [
  { key: 'plate', label: 'ทะเบียน', kind: 'name' }, { key: 'province', label: 'จังหวัด', kind: 'nowrap' }, { key: 'model', label: 'ยี่ห้อ / รุ่น', kind: 'text' },
  { key: 'color', label: 'สี', kind: 'nowrap' }, { key: 'status', label: 'สถานะ', kind: 'status' }, { key: 'createdAt', label: 'อนุมัติเมื่อ', kind: 'date' },
  { key: 'actions', label: 'การดำเนินการ', srOnly: true, kind: 'actions' },
]

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
      <!-- D1 / owner rule: a table on every screen width (phones scroll sideways, plate column stays). -->
      <DataTable :columns="columns" :rows="work.vehicles.value" row-key="vehicleId" label="ทะเบียนยานพาหนะที่อนุมัติ">
        <template #cell-province="{ row }">{{ provinceLabel(row.province) || row.province }}</template>
        <template #cell-model="{ row }">{{ [row.brand, row.model].filter(Boolean).join(' ') || '—' }}</template>
        <template #cell-color="{ row }">{{ row.colorLabel || row.color || '—' }}</template>
        <template #cell-status="{ row }"><StatusBadge :status="row.status" /></template>
        <template #cell-createdAt="{ row }">{{ formatBangkokDateTime(row.createdAt, '-') }}</template>
        <template #cell-actions="{ row }"><button v-if="canDetail" class="btn btn-sm min-h-11 whitespace-nowrap" type="button" :aria-pressed="openId === row.vehicleId" @click="openDetail(row)">ดูรายละเอียด</button></template>
      </DataTable>
      <PaginationControl class="mt-3" :page="work.page.value" :page-size="work.pageSize.value" :total-items="work.pagination.value.total" :disabled="work.phase.value === 'loading'" label="แบ่งหน้าทะเบียนยานพาหนะ" @update:page="work.changePage" @update:page-size="work.changePageSize" />
    </section>

    <EntityDrawer :open="Boolean(openId) && canDetail" :title="drawerTitle" close-label="กลับไปทะเบียน" @close="closeDetail">
      <VehicleDetailPanel v-if="openId" :vehicle-id="openId" show-actions />
    </EntityDrawer>
  </PageTemplateComponent>
</template>