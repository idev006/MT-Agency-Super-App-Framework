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
import { STICKER_CATEGORIES, stickerCategoryOf } from '../domain/reference/sticker-categories.js'
import { PAPERS, pagesNeeded, sheetCapacity } from '../domain/qr/sticker-layout.js'
import { useSessionStore } from '../stores/session.js'

// S5 (owner 2026-11-25: "หน้าที่ผู้ใช้สามารถสั่ง export qr ของรถที่เลือกได้ เพื่อนำไปให้โรงพิมพ์ จัดพิมพ์").
// Pick vehicles from the approved registry → fetch their ACTIVE codes (qr.export, audited) → print on A3/A4/A5
// (office cut guides, or a print-shop sheet with bleed + crop marks) or one sticker per page (Print / Save as PDF for the print shop). Codes stay in memory only.
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
  { key: 'stickerCategory', label: 'ประเภทสติกเกอร์', kind: 'nowrap' },
]

const phase = ref('idle') // idle | loading | ready | error
const failure = ref('')
const results = ref([])
// owner 2026-11-26: two print sizes (5 × 5 / 8 × 8 cm); colour + default size by the vehicle user's category
const mode = ref('office') // office: cut guides · sheet: print shop, many per sheet + bleed + crop marks · single: one per page + bleed
const paper = ref('A4') // A3 | A4 | A5 (office / sheet)
const sizeMode = ref('category') // category | 5 | 8
const printable = (x) => x.status === 'READY' && Boolean(stickerCategoryOf(x.stickerCategory))
const ready = computed(() => results.value.filter(printable))
const notReady = computed(() => results.value.filter((x) => !printable(x)).map((x) => (x.status === 'READY' ? { ...x, status: 'NO_STICKER_CATEGORY' } : x)))
const summary = computed(() => {
  const count = {}
  for (const x of ready.value) {
    const c = STICKER_CATEGORIES[x.stickerCategory]
    const size = sizeMode.value === 'category' ? c.size : Number(sizeMode.value)
    const k = `${c.colour} ${size} × ${size} ซม.`
    count[k] = (count[k] || 0) + 1
  }
  return Object.entries(count)
})
const sizeOf = (x) => (sizeMode.value === 'category' ? STICKER_CATEGORIES[x.stickerCategory].size : Number(sizeMode.value))
// "A4: 8 × 8 ซม. 6 ดวง/แผ่น · 5 × 5 ซม. 15 ดวง/แผ่น · รวม 2 แผ่น"
const layout = computed(() => {
  const bySize = {}
  for (const x of ready.value) bySize[sizeOf(x)] = (bySize[sizeOf(x)] || 0) + 1
  const sizes = Object.keys(bySize).map(Number).sort((a, b) => b - a)
  const per = sizes.map((s) => `${s} × ${s} ซม. ${sheetCapacity(paper.value, s, mode.value)} ดวง/แผ่น`)
  const where = mode.value === 'single' ? 'หน้าละ 1 ดวง' : `${paper.value}: ${per.join(' · ')}`
  return `${where} · รวม ${pagesNeeded(paper.value, mode.value, bySize)} หน้า`
})
const STATUS_TEXT = Object.freeze({ NO_STICKER_CATEGORY: 'ยังไม่กำหนดประเภทสติกเกอร์ (สี/ขนาด)', REISSUE_NEEDED: 'QR นี้ออกก่อนระบบเก็บรหัส ต้องออก QR ใหม่ก่อนพิมพ์', NO_ACTIVE_QR: 'ยังไม่มี QR ที่ใช้งานอยู่', VEHICLE_NOT_ACTIVE: 'รถไม่อยู่ในสถานะใช้งาน', NOT_FOUND: 'ไม่พบรถ' })
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
          <template #cell-stickerCategory="{ row }"><span v-if="stickerCategoryOf(row.stickerCategory)" class="inline-flex items-center gap-2"><span class="inline-block size-3 rounded-full" :style="{ background: stickerCategoryOf(row.stickerCategory).hex }" aria-hidden="true"></span>{{ stickerCategoryOf(row.stickerCategory).colour }} · {{ stickerCategoryOf(row.stickerCategory).size }}×{{ stickerCategoryOf(row.stickerCategory).size }}</span><span v-else class="text-warning">ยังไม่กำหนด</span></template>
        </DataTable>
        <PaginationControl class="mt-3" :page="registry.page.value" :page-size="registry.pageSize.value" :total-items="registry.pagination.value.total" :disabled="registry.phase.value === 'loading'" label="แบ่งหน้ารายการรถ" @update:page="registry.changePage" @update:page-size="registry.changePageSize" />
      </template>
    </section>

    <section v-else aria-labelledby="qr-sheet-title">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h2 id="qr-sheet-title" class="text-lg font-semibold">แผ่น QR พร้อมพิมพ์ {{ ready.length }} ดวง</h2>
        <div class="flex flex-wrap items-center gap-2">
          <label class="field-stack"><span class="sr-only">รูปแบบ</span><select v-model="mode" class="select select-bordered select-sm">
            <option value="office">พิมพ์เองที่สำนักงาน (มีเส้นตัด)</option>
            <option value="sheet">ส่งโรงพิมพ์: หลายดวงต่อแผ่น + ตัดตก 3 มม. + เครื่องหมายตัด</option>
            <option value="single">ส่งโรงพิมพ์: 1 ดวงต่อหน้า + ตัดตก 3 มม.</option>
          </select></label>
          <label v-if="mode !== 'single'" class="field-stack"><span class="sr-only">กระดาษ</span><select v-model="paper" class="select select-bordered select-sm">
            <option v-for="(p, k) in PAPERS" :key="k" :value="k">กระดาษ {{ k }} ({{ p.w }} × {{ p.h }} มม.)</option>
          </select></label>
          <label class="field-stack"><span class="sr-only">ขนาด</span><select v-model="sizeMode" class="select select-bordered select-sm">
            <option value="category">ขนาดตามประเภท (แดง 8 × 8, อื่น ๆ 5 × 5 ซม.)</option>
            <option value="5">5 × 5 ซม. ทุกดวง</option>
            <option value="8">8 × 8 ซม. ทุกดวง</option>
          </select></label>
          <button class="btn btn-primary btn-sm" type="button" :disabled="!ready.length" @click="print">พิมพ์ / บันทึกเป็น PDF</button>
          <button class="btn btn-sm" type="button" @click="clearSheet">กลับไปเลือกรถ</button>
        </div>
      </div>
      <div v-if="notReady.length" class="alert alert-warning mb-4 items-start print:hidden" role="status">
        <div><strong>{{ notReady.length }} คันพิมพ์ไม่ได้</strong>
          <ul class="mt-1 list-disc pl-5 text-sm"><li v-for="x in notReady" :key="x.vehicleId">{{ x.plate || x.vehicleId.slice(0, 8) }} — {{ STATUS_TEXT[x.status] || x.status }}<RouterLink v-if="x.status === 'REISSUE_NEEDED' || x.status === 'NO_ACTIVE_QR'" class="link ml-2" :to="{ name: 'qr-governance', query: { vehicleId: x.vehicleId } }">ไปออก QR</RouterLink><RouterLink v-else-if="x.status === 'NO_STICKER_CATEGORY'" class="link ml-2" :to="{ name: 'vehicle-maintenance', params: { vehicleId: x.vehicleId } }">กำหนดประเภท</RouterLink></li></ul>
        </div>
      </div>
      <p class="mb-3 text-sm text-base-content/80 print:hidden">ตอนพิมพ์: ปิด "หัวกระดาษและท้ายกระดาษ" เปิด "กราฟิกพื้นหลัง" และตั้งมาตราส่วน 100% (ไม่ย่อ/ขยาย) เพื่อให้ได้ขนาดจริงและสีเต็มดวง · ส่งโรงพิมพ์: เลือก "บันทึกเป็น PDF" แล้วส่งไฟล์ (ขนาดเป็นซม.จริง สีเลยเส้นตัด 3 มม.) · ขนาดแต่ละชุดขึ้นหน้าใหม่ ระบบบันทึกการส่งออกนี้ไว้ใน Audit แล้ว</p>
      <p v-if="summary.length" class="mb-3 flex flex-wrap gap-2 text-sm print:hidden" data-sheet-summary><span v-for="[k, n] in summary" :key="k" class="badge badge-outline">{{ k }}: {{ n }} ดวง</span></p>
      <p v-if="ready.length" class="mb-3 text-sm print:hidden" data-sheet-layout>{{ layout }}</p>
      <div class="qr-print-area overflow-x-auto rounded-box bg-white p-4">
        <QrStickerSheet :items="ready" :mode="mode" :size-mode="sizeMode" :paper="paper" />
      </div>
      <Teleport to="body"><div class="qr-print-root"><QrStickerSheet :items="ready" :mode="mode" :size-mode="sizeMode" :paper="paper" /></div></Teleport>
    </section>
  </PageTemplateComponent>
</template>
