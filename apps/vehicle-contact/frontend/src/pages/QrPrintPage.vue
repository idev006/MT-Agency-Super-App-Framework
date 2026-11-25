<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import DataTable from '../components/common/DataTable.vue'
import PaginationControl from '../components/common/PaginationControl.vue'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import QrStickerSheet from '../features/qr-governance/components/QrStickerSheet.vue'
import { vehicleRegistryRepositoryKey } from '../application/vehicles/vehicle-registry-port.js'
import { qrGovernanceRepositoryKey } from '../application/qr/qr-governance-port.js'
import { useVehicleRegistry } from '../features/vehicle-registry/useVehicleRegistry.js'
import { provinceLabel } from '../domain/reference/provinces.js'
import { useSessionStore } from '../stores/session.js'

// S5 (owner 2026-11-25: "หน้าที่ผู้ใช้สามารถสั่ง export qr ของรถที่เลือกได้ เพื่อนำไปให้โรงพิมพ์ จัดพิมพ์").
// Pick vehicles from the approved registry → fetch their ACTIVE codes (qr.export, audited) → print an A4
// label sheet or one sticker per page (Print / Save as PDF for the print shop). Codes stay in memory only.
const MAX = 100
const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const registry = useVehicleRegistry({ repository: inject(vehicleRegistryRepositoryKey), permissions })
const qrRepository = inject(qrGovernanceRepositoryKey)
const route = useRoute()

const selected = ref(new Map()) // vehicleId -> { plate, province }
const pageIds = computed(() => registry.vehicles.value.map((v) => v.vehicleId))
const allOnPage = computed(() => pageIds.value.length > 0 && pageIds.value.every((id) => selected.value.has(id)))
function toggle(v) {
  const next = new Map(selected.value)
  if (next.has(v.vehicleId)) next.delete(v.vehicleId)
  else if (next.size < MAX) next.set(v.vehicleId, { plate: v.plate, province: v.province })
  selected.value = next
}
function togglePage() {
  const next = new Map(selected.value)
  if (allOnPage.value) for (const id of pageIds.value) next.delete(id)
  else for (const v of registry.vehicles.value) if (next.size < MAX) next.set(v.vehicleId, { plate: v.plate, province: v.province })
  selected.value = next
}
const columns = [
  { key: 'pick', label: 'เลือก', kind: 'actions' },
  { key: 'plate', label: 'ทะเบียน', kind: 'name' }, { key: 'province', label: 'จังหวัด', kind: 'nowrap' },
  { key: 'model', label: 'ยี่ห้อ / รุ่น', kind: 'text' }, { key: 'color', label: 'สี', kind: 'nowrap' },
]

const phase = ref('idle') // idle | loading | ready | error
const failure = ref('')
const results = ref([])
const layout = ref('a4')
const ready = computed(() => results.value.filter((x) => x.status === 'READY'))
const notReady = computed(() => results.value.filter((x) => x.status !== 'READY'))
const STATUS_TEXT = Object.freeze({ REISSUE_NEEDED: 'QR นี้ออกก่อนระบบเก็บรหัส ต้องออก QR ใหม่ก่อนพิมพ์', NO_ACTIVE_QR: 'ยังไม่มี QR ที่ใช้งานอยู่', VEHICLE_NOT_ACTIVE: 'รถไม่อยู่ในสถานะใช้งาน', NOT_FOUND: 'ไม่พบรถ' })
async function prepare() {
  if (!selected.value.size) return
  phase.value = 'loading'; failure.value = ''
  try { results.value = await qrRepository.exportCodes([...selected.value.keys()]); phase.value = 'ready' }
  catch (error) { failure.value = error?.code || 'QR_EXPORT_FAILED'; phase.value = 'error' }
}
function clearSheet() { results.value = []; phase.value = 'idle' }
const print = () => globalThis.print?.()

onMounted(async () => {
  await registry.load()
  // From the vehicle detail ("พิมพ์ QR คันนี้"): ?vehicle=<id> preselects that vehicle.
  const pre = typeof route.query.vehicle === 'string' ? route.query.vehicle : ''
  if (pre) { selected.value = new Map([[pre, { plate: '', province: '' }]]); await prepare() }
})
onBeforeUnmount(() => { results.value = [] }) // codes never outlive the page
</script>

<template>
  <PageTemplateComponent eyebrow="การกำกับดูแล" title="พิมพ์ QR" description="เลือกรถ แล้วสร้างแผ่น QR สำหรับพิมพ์เอง (A4) หรือบันทึกเป็น PDF ส่งโรงพิมพ์ ระบบบันทึกว่าใครส่งออก QR ของรถคันใด">
    <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span aria-hidden="true"> / </span><span aria-current="page">พิมพ์ QR</span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>

    <section v-if="phase !== 'ready'" aria-labelledby="qr-pick-title">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="qr-pick-title" class="text-lg font-semibold">เลือกรถ</h2>
        <div class="flex flex-wrap items-center gap-2">
          <span class="badge badge-neutral">เลือกแล้ว {{ selected.size }} / {{ MAX }} คัน</span>
          <button class="btn btn-sm" type="button" :disabled="!pageIds.length" @click="togglePage">{{ allOnPage ? 'ยกเลิกทั้งหน้า' : 'เลือกทั้งหน้า' }}</button>
          <button class="btn btn-sm btn-ghost" type="button" :disabled="!selected.size" @click="selected = new Map()">ล้างที่เลือก</button>
          <button class="btn btn-primary btn-sm" type="button" :disabled="!selected.size || phase === 'loading'" @click="prepare"><span v-if="phase === 'loading'" class="loading loading-spinner loading-sm"></span>สร้างแผ่น QR</button>
        </div>
      </div>
      <div v-if="phase === 'error'" class="alert alert-error mb-3">ดึง QR ไม่สำเร็จ ({{ failure }})</div>
      <div v-if="registry.phase.value === 'loading' || registry.phase.value === 'idle'" class="skeleton h-40 w-full" role="status"><span class="sr-only">กำลังโหลดรายการรถ</span></div>
      <div v-else-if="registry.phase.value === 'empty'" class="alert alert-info">ยังไม่มีรถที่อนุมัติแล้ว</div>
      <div v-else-if="registry.phase.value !== 'success'" class="alert alert-warning">โหลดรายการรถไม่สำเร็จ</div>
      <template v-else>
        <DataTable :columns="columns" :rows="registry.vehicles.value" row-key="vehicleId" label="เลือกรถสำหรับพิมพ์ QR">
          <template #cell-pick="{ row }"><input class="checkbox" type="checkbox" :checked="selected.has(row.vehicleId)" :disabled="!selected.has(row.vehicleId) && selected.size >= MAX" :aria-label="`เลือก ${row.plate}`" @change="toggle(row)" /></template>
          <template #cell-province="{ row }">{{ provinceLabel(row.province) || row.province }}</template>
          <template #cell-model="{ row }">{{ [row.brand, row.model].filter(Boolean).join(' ') || '—' }}</template>
          <template #cell-color="{ row }">{{ row.colorLabel || row.color || '—' }}</template>
        </DataTable>
        <PaginationControl class="mt-3" :page="registry.page.value" :page-size="registry.pageSize.value" :total-items="registry.pagination.value.total" :disabled="registry.phase.value === 'loading'" label="แบ่งหน้ารายการรถ" @update:page="registry.changePage" @update:page-size="registry.changePageSize" />
      </template>
    </section>

    <section v-else aria-labelledby="qr-sheet-title">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h2 id="qr-sheet-title" class="text-lg font-semibold">แผ่น QR พร้อมพิมพ์ {{ ready.length }} ดวง</h2>
        <div class="flex flex-wrap items-center gap-2">
          <label class="field-stack"><span class="sr-only">รูปแบบ</span><select v-model="layout" class="select select-bordered select-sm">
            <option value="a4">A4 — 3 × 8 ดวง (พิมพ์เองที่สำนักงาน)</option>
            <option value="single">1 ดวงต่อหน้า (ส่งโรงพิมพ์)</option>
          </select></label>
          <button class="btn btn-primary btn-sm" type="button" :disabled="!ready.length" @click="print">พิมพ์ / บันทึกเป็น PDF</button>
          <button class="btn btn-sm" type="button" @click="clearSheet">กลับไปเลือกรถ</button>
        </div>
      </div>
      <div v-if="notReady.length" class="alert alert-warning mb-4 items-start print:hidden" role="status">
        <div><strong>{{ notReady.length }} คันพิมพ์ไม่ได้</strong>
          <ul class="mt-1 list-disc pl-5 text-sm"><li v-for="x in notReady" :key="x.vehicleId">{{ x.plate || x.vehicleId.slice(0, 8) }} — {{ STATUS_TEXT[x.status] || x.status }}<RouterLink v-if="x.status === 'REISSUE_NEEDED' || x.status === 'NO_ACTIVE_QR'" class="link ml-2" :to="{ name: 'qr-governance', query: { vehicleId: x.vehicleId } }">ไปออก QR</RouterLink></li></ul>
        </div>
      </div>
      <p class="mb-3 text-sm text-base-content/80 print:hidden">ตอนพิมพ์ให้เลือกขนาดกระดาษ A4 และปิด "หัวกระดาษและท้ายกระดาษ" ส่งโรงพิมพ์: เลือก "บันทึกเป็น PDF" ระบบบันทึกการส่งออกนี้ไว้ใน Audit แล้ว</p>
      <div class="qr-print-area rounded-box bg-white p-4">
        <QrStickerSheet :items="ready" :layout="layout" />
      </div>
    </section>
  </PageTemplateComponent>
</template>
