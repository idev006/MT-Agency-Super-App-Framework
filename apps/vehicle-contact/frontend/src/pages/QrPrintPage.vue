<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import DataTable from '../components/common/DataTable.vue'
import FormDialog from '../components/common/FormDialog.vue'
import PaginationControl from '../components/common/PaginationControl.vue'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import QrStickerSheet from '../features/qr-governance/components/QrStickerSheet.vue'
import { vehicleRegistryRepositoryKey } from '../application/vehicles/vehicle-registry-port.js'
import { qrGovernanceRepositoryKey } from '../application/qr/qr-governance-port.js'
import { useVehicleRegistry } from '../features/vehicle-registry/useVehicleRegistry.js'
import { provinceLabel } from '../domain/reference/provinces.js'
import { PAPERS, pagesNeeded, sheetCapacity } from '../domain/qr/sticker-layout.js'
import { useSessionStore } from '../stores/session.js'

// S5 (owner 2026-11-25: "หน้าที่ผู้ใช้สามารถสั่ง export qr ของรถที่เลือกได้ เพื่อนำไปให้โรงพิมพ์ จัดพิมพ์").
// Pick vehicles from the approved registry → fetch their ACTIVE codes (qr.export, audited) → print on A3/A4/A5
// (office cut guides, or a print-shop sheet with bleed + crop marks) or one sticker per page (Print / Save as PDF for the print shop). Codes stay in memory only.
const MAX = 100
const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const vehicleRepository = inject(vehicleRegistryRepositoryKey)
const registry = useVehicleRegistry({ repository: vehicleRepository, permissions, withOptions: true })
const qrRepository = inject(qrGovernanceRepositoryKey)
const route = useRoute()
const router = useRouter()

// VC-ADR-042 (owner 2026-11-26: "ควร filter ได้นะ คิดในมุมมองของ actor"): the admin's jobs → filters.
// weekly batch → not printed yet (default) · hand out per unit → organization · print shop per colour → person type · reprint → plate
const q = (k) => (typeof route.query[k] === 'string' ? route.query[k] : '')
const PRINT_FILTERS = Object.freeze([['NOT_PRINTED', 'ยังไม่พิมพ์'], ['PRINTED', 'พิมพ์แล้ว'], ['ALL', 'ทั้งหมด']])
const form = ref({ print: ['NOT_PRINTED', 'PRINTED', 'ALL'].includes(q('print')) ? q('print') : 'NOT_PRINTED', org: q('org'), type: q('type'), plate: q('plate') })
const toFilters = (f) => ({ printState: f.print === 'ALL' ? '' : f.print, organizationId: f.org, stickerCategory: f.type, plate: f.plate })
const filtered = computed(() => Boolean(form.value.org || form.value.type || form.value.plate || form.value.print !== 'ALL'))
function applyFilters() {
  const f = form.value
  router.replace({ query: { ...route.query, print: f.print, org: f.org || undefined, type: f.type || undefined, plate: f.plate.trim() || undefined } })
  return registry.applyFilters(toFilters(f))
}
function clearFilters() { form.value = { print: 'ALL', org: '', type: '', plate: '' }; return applyFilters() }

const selected = ref(new Map()) // vehicleId -> { plate, province }
const pageIds = computed(() => registry.vehicles.value.map((v) => v.vehicleId))
const allOnPage = computed(() => pageIds.value.length > 0 && pageIds.value.every((id) => selected.value.has(id)))
function toggle(v) {
  const next = new Map(selected.value)
  if (next.has(v.vehicleId)) next.delete(v.vehicleId)
  else if (next.size < MAX) next.set(v.vehicleId, { plate: v.plate, province: v.province })
  selected.value = next
}
// UX 2026-11-26: picking 21 vehicles took 3 pages × "เลือกทั้งหน้า". Select every approved vehicle (≤ MAX) at once.
const allPhase = ref('idle')
async function selectAll() {
  allPhase.value = 'loading'
  try {
    const next = new Map(selected.value)
    for (let p = 1; next.size < MAX; p++) {
      const r = await vehicleRepository.list({ page: p, pageSize: 100, filters: registry.filters.value })
      for (const v of r.vehicles) if (next.size < MAX) next.set(v.vehicleId, { plate: v.plate, province: v.province })
      if (p >= (r.pagination?.totalPages || 1)) break
    }
    selected.value = next; allPhase.value = 'idle'
  } catch { allPhase.value = 'error' }
}
function togglePage() {
  const next = new Map(selected.value)
  if (allOnPage.value) for (const id of pageIds.value) next.delete(id)
  else for (const v of registry.vehicles.value) if (next.size < MAX) next.set(v.vehicleId, { plate: v.plate, province: v.province })
  selected.value = next
}
const columns = [
  { key: 'pick', label: 'เลือก', kind: 'actions' },
  { key: 'plate', label: 'ทะเบียน', kind: 'name' },
  // VC-ADR-042: what the printer decides on comes first (print state, unit, sticker colour)
  { key: 'qrPrintState', label: 'สถานะการพิมพ์', kind: 'nowrap' },
  { key: 'organizationName', label: 'หน่วยงาน', kind: 'text' },
  { key: 'stickerCategory', label: 'ประเภทผู้ใช้รถ', kind: 'nowrap' },
  { key: 'province', label: 'จังหวัด', kind: 'nowrap' },
  { key: 'model', label: 'ยี่ห้อ / รุ่น', kind: 'text' }, { key: 'color', label: 'สี', kind: 'nowrap' },
]
const dateText = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '' }

const phase = ref('idle') // idle | loading | ready | error
const failure = ref('')
const results = ref([])
// owner 2026-11-26: two print sizes (5 × 5 / 8 × 8 cm); colour + default size by the vehicle user's category
const mode = ref('office') // office: cut guides · sheet: print shop, many per sheet + bleed + crop marks · single: one per page + bleed
const paper = ref('A4') // A3 | A4 | A5 (office / sheet)
const sizeMode = ref('category') // category | 5 | 8
const printable = (x) => x.status === 'READY' && Boolean(x.sticker) // VC-ADR-038: colour/size from the configured person type
const ready = computed(() => results.value.filter(printable))
const notReady = computed(() => results.value.filter((x) => !printable(x)).map((x) => (x.status === 'READY' ? { ...x, status: 'NO_STICKER_CATEGORY' } : x)))
const summary = computed(() => {
  const count = {}
  for (const x of ready.value) {
    const c = x.sticker
    const size = sizeMode.value === 'category' ? c.size : Number(sizeMode.value)
    const k = `${c.colour} ${size} × ${size} ซม.`
    count[k] = (count[k] || 0) + 1
  }
  return Object.entries(count)
})
const sizeOf = (x) => (sizeMode.value === 'category' ? x.sticker.size : Number(sizeMode.value))
// "A4: 8 × 8 ซม. 6 ดวง/แผ่น · 5 × 5 ซม. 15 ดวง/แผ่น · รวม 2 แผ่น"
const layout = computed(() => {
  const bySize = {}
  for (const x of ready.value) bySize[sizeOf(x)] = (bySize[sizeOf(x)] || 0) + 1
  const sizes = Object.keys(bySize).map(Number).sort((a, b) => b - a)
  const per = sizes.map((s) => `${s} × ${s} ซม. ${sheetCapacity(paper.value, s, mode.value)} ดวง/แผ่น`)
  const where = mode.value === 'single' ? 'หน้าละ 1 ดวง' : `${paper.value}: ${per.join(' · ')}`
  return `${where} · รวม ${pagesNeeded(paper.value, mode.value, bySize)} หน้า`
})
const STATUS_TEXT = Object.freeze({ NO_STICKER_CATEGORY: 'ยังไม่กำหนดประเภทผู้ใช้รถ (สี/ขนาดสติกเกอร์)', REISSUE_NEEDED: 'QR นี้ออกก่อนระบบเก็บรหัส ต้องออก QR ใหม่ก่อนพิมพ์', NO_ACTIVE_QR: 'ยังไม่มี QR ที่ใช้งานอยู่', VEHICLE_NOT_ACTIVE: 'รถไม่อยู่ในสถานะใช้งาน', NOT_FOUND: 'ไม่พบรถ' })
async function prepare() {
  if (!selected.value.size) return
  phase.value = 'loading'; failure.value = ''
  try { results.value = await qrRepository.exportCodes([...selected.value.keys()]); phase.value = 'ready' }
  catch (error) { failure.value = error?.code || 'QR_EXPORT_FAILED'; phase.value = 'error' }
}
function clearSheet() { results.value = []; phase.value = 'idle' }
// VC-ADR-042: printing is confirmed by the admin (a preview or a failed print is not a print)
const confirmPrinted = ref(false), markPhase = ref('idle'), markResult = ref(null)
function print() { globalThis.print?.(); confirmPrinted.value = true }
async function markPrinted() {
  markPhase.value = 'saving'
  try {
    markResult.value = await qrRepository.markPrinted(ready.value.map((x) => x.vehicleId))
    markPhase.value = 'idle'; confirmPrinted.value = false
    selected.value = new Map(); clearSheet(); await registry.load()
  } catch (error) { markPhase.value = 'error'; failure.value = error?.code || 'MARK_PRINTED_FAILED' }
}

onMounted(async () => {
  registry.pageSize.value = 50 // UX: fewer pages to go through
  registry.filters.value = toFilters(form.value)
  await registry.load()
  // From the vehicle detail ("พิมพ์ QR คันนี้"): ?vehicle=<id> preselects that vehicle.
  const pre = typeof route.query.vehicle === 'string' ? route.query.vehicle : ''
  if (pre) { selected.value = new Map([[pre, { plate: '', province: '' }]]); await prepare() }
})
onBeforeUnmount(() => { results.value = [] }) // codes never outlive the page
</script>

<template>
  <PageTemplateComponent eyebrow="การกำกับดูแล" title="พิมพ์ QR" description="1. กรองแล้วเลือกรถ  2. สร้างแผ่น QR  3. พิมพ์หรือบันทึกเป็น PDF ส่งโรงพิมพ์  4. ยืนยันว่าพิมพ์แล้ว ทุกการส่งออกถูกบันทึกใน Audit">
    <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span aria-hidden="true"> / </span><span aria-current="page">พิมพ์ QR</span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>

    <div v-if="markResult" class="alert alert-success mb-4" role="status" data-mark-result>
      <span>บันทึกว่าพิมพ์แล้ว {{ markResult.marked }} คัน<template v-if="markResult.skipped.length"> · ข้าม {{ markResult.skipped.length }} คัน (ไม่มี QR ที่ใช้งาน)</template></span>
      <button class="btn btn-ghost btn-sm" type="button" @click="markResult = null">ปิด</button>
    </div>
    <section v-if="phase !== 'ready'" aria-labelledby="qr-pick-title">
      <form class="mb-4 flex flex-wrap items-end gap-3 rounded-box border border-base-300 bg-base-100 p-3" role="search" aria-label="กรองรถสำหรับพิมพ์ QR" data-print-filters @submit.prevent="applyFilters">
        <label class="field-stack"><span class="label-text text-sm font-semibold">สถานะการพิมพ์</span>
          <select v-model="form.print" class="select select-bordered select-sm" data-filter="print" @change="applyFilters"><option v-for="[v, t] in PRINT_FILTERS" :key="v" :value="v">{{ t }}</option></select></label>
        <label class="field-stack"><span class="label-text text-sm font-semibold">หน่วยงาน</span>
          <select v-model="form.org" class="select select-bordered select-sm max-w-xs" data-filter="org" @change="applyFilters"><option value="">ทุกหน่วยงาน</option>
            <option v-for="o in registry.filterOptions.value?.organizations || []" :key="o.id" :value="o.id">{{ o.name }}</option></select></label>
        <label class="field-stack"><span class="label-text text-sm font-semibold">ประเภทผู้ใช้รถ (สีสติกเกอร์)</span>
          <select v-model="form.type" class="select select-bordered select-sm" data-filter="type" @change="applyFilters"><option value="">ทุกประเภท</option>
            <option v-for="c in registry.filterOptions.value?.stickerCategories || []" :key="c.code" :value="c.code">{{ c.label }} · {{ c.colour }} {{ c.size }}×{{ c.size }}{{ c.active ? '' : ' (ปิดใช้งาน)' }}</option></select></label>
        <label class="field-stack"><span class="label-text text-sm font-semibold">ทะเบียน</span>
          <input v-model="form.plate" class="input input-bordered input-sm w-36" maxlength="20" placeholder="เช่น กข1234" data-filter="plate" /></label>
        <button class="btn btn-sm" type="submit">ค้นหา</button>
        <button class="btn btn-sm btn-ghost" type="button" @click="clearFilters">ล้างตัวกรอง</button>
      </form>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="qr-pick-title" class="text-lg font-semibold">เลือกรถ</h2>
        <div class="flex flex-wrap items-center gap-2">
          <span class="badge badge-neutral">เลือกแล้ว {{ selected.size }} / {{ MAX }} คัน</span>
          <button class="btn btn-sm" type="button" :disabled="!pageIds.length" @click="togglePage">{{ allOnPage ? 'ยกเลิกทั้งหน้า' : 'เลือกทั้งหน้า' }}</button>
          <button class="btn btn-sm" type="button" :disabled="allPhase === 'loading' || !registry.pagination.value.total" @click="selectAll"><span v-if="allPhase === 'loading'" class="loading loading-spinner loading-xs"></span>เลือกทั้งหมด ({{ Math.min(registry.pagination.value.total, MAX) }} คัน)</button>
          <button class="btn btn-sm btn-ghost" type="button" :disabled="!selected.size" @click="selected = new Map()">ล้างที่เลือก</button>
          <button class="btn btn-primary btn-sm" type="button" :disabled="!selected.size || phase === 'loading'" @click="prepare"><span v-if="phase === 'loading'" class="loading loading-spinner loading-sm"></span>สร้างแผ่น QR</button>
        </div>
      </div>
      <div v-if="phase === 'error'" class="alert alert-error mb-3">ดึง QR ไม่สำเร็จ ({{ failure }})</div>
      <div v-if="registry.phase.value === 'loading' || registry.phase.value === 'idle'" class="skeleton h-40 w-full" role="status"><span class="sr-only">กำลังโหลดรายการรถ</span></div>
      <div v-else-if="registry.phase.value === 'empty'" class="alert alert-info" data-print-empty>{{ filtered ? 'ไม่มีรถที่ตรงกับตัวกรอง' : 'ยังไม่มีรถที่อนุมัติแล้ว' }}<button v-if="filtered" class="btn btn-sm ml-2" type="button" @click="clearFilters">ดูทั้งหมด</button></div>
      <div v-else-if="registry.phase.value !== 'success'" class="alert alert-warning">โหลดรายการรถไม่สำเร็จ</div>
      <template v-else>
        <DataTable :columns="columns" :rows="registry.vehicles.value" row-key="vehicleId" label="เลือกรถสำหรับพิมพ์ QR">
          <template #cell-pick="{ row }"><input class="checkbox" type="checkbox" :checked="selected.has(row.vehicleId)" :disabled="!selected.has(row.vehicleId) && selected.size >= MAX" :aria-label="`เลือก ${row.plate}`" @change="toggle(row)" /></template>
          <template #cell-province="{ row }">{{ provinceLabel(row.province) || row.province }}</template>
          <template #cell-model="{ row }">{{ [row.brand, row.model].filter(Boolean).join(' ') || '—' }}</template>
          <template #cell-color="{ row }">{{ row.colorLabel || row.color || '—' }}</template>
          <template #cell-organizationName="{ row }">{{ row.organizationName || '—' }}</template>
          <template #cell-qrPrintState="{ row }"><span v-if="row.qrPrintState === 'PRINTED'" class="badge badge-success badge-outline whitespace-nowrap">พิมพ์แล้ว {{ dateText(row.qrPrintedAt) }}</span><span v-else class="badge badge-ghost whitespace-nowrap">ยังไม่พิมพ์</span></template>
          <template #cell-stickerCategory="{ row }"><span v-if="row.sticker" class="inline-flex items-center gap-2"><span class="inline-block size-3 rounded-full" :style="{ background: row.sticker.hex }" aria-hidden="true"></span>{{ row.sticker.label }} · {{ row.sticker.colour }} {{ row.sticker.size }}×{{ row.sticker.size }}</span><span v-else class="text-warning">ยังไม่กำหนด</span></template>
        </DataTable>
        <div v-if="selected.size" class="sticky bottom-0 z-10 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-box border border-base-300 bg-base-100 p-3 shadow-lg" data-print-bar>
          <span class="font-semibold">เลือกแล้ว {{ selected.size }} คัน</span>
          <button class="btn btn-primary" type="button" :disabled="phase === 'loading'" @click="prepare"><span v-if="phase === 'loading'" class="loading loading-spinner loading-sm"></span>สร้างแผ่น QR ({{ selected.size }} คัน)</button>
        </div>
        <p v-if="allPhase === 'error'" class="mt-2 text-sm text-error">โหลดรายการทั้งหมดไม่สำเร็จ ลองอีกครั้ง</p>
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
            <option value="category">ขนาดตามประเภทผู้ใช้รถ (ตั้งได้ที่หน้าตั้งค่าระบบ)</option>
            <option value="5">5 × 5 ซม. ทุกดวง</option>
            <option value="8">8 × 8 ซม. ทุกดวง</option>
          </select></label>
          <button class="btn btn-primary btn-sm" type="button" :disabled="!ready.length" @click="print">พิมพ์ / บันทึกเป็น PDF</button>
          <button class="btn btn-sm" type="button" :disabled="!ready.length" data-confirm-printed-open @click="confirmPrinted = true">ยืนยันว่าพิมพ์แล้ว</button>
          <button class="btn btn-sm" type="button" @click="clearSheet">กลับไปเลือกรถ</button>
        </div>
      </div>
      <div v-if="notReady.length" class="alert alert-warning mb-4 items-start print:hidden" role="status">
        <div><strong>{{ notReady.length }} คันพิมพ์ไม่ได้</strong>
          <ul class="mt-1 list-disc pl-5 text-sm"><li v-for="x in notReady" :key="x.vehicleId">{{ x.plate || x.vehicleId.slice(0, 8) }} — {{ STATUS_TEXT[x.status] || x.status }}<RouterLink v-if="x.status === 'REISSUE_NEEDED' || x.status === 'NO_ACTIVE_QR'" class="link ml-2" :to="{ name: 'qr-governance', query: { vehicleId: x.vehicleId } }">ไปออก QR</RouterLink><RouterLink v-else-if="x.status === 'NO_STICKER_CATEGORY'" class="link ml-2" :to="{ name: 'vehicle-maintenance', params: { vehicleId: x.vehicleId } }">กำหนดประเภท</RouterLink></li></ul>
        </div>
      </div>
      <ol class="mb-3 list-decimal space-y-1 pl-5 text-sm print:hidden" data-print-steps>
        <li>กด <strong>พิมพ์ / บันทึกเป็น PDF</strong></li>
        <li>ในหน้าต่างพิมพ์: <strong>มาตราส่วน 100%</strong> · <strong>เปิด "กราฟิกพื้นหลัง"</strong> · ปิด "หัวกระดาษและท้ายกระดาษ" (ถ้าไม่ตั้ง ขนาดหรือสีจะไม่ถูก)</li>
        <li>ส่งโรงพิมพ์: เลือกปลายทาง <strong>"บันทึกเป็น PDF"</strong> แล้วส่งไฟล์ (ขนาดจริง สีเลยเส้นตัด 3 มม. มีเครื่องหมายตัด)</li>
        <li>พิมพ์เสร็จ: กด <strong>ยืนยันว่าพิมพ์แล้ว</strong> รถเหล่านี้จะออกจากรายการ "ยังไม่พิมพ์"</li>
      </ol>
      <p v-if="summary.length" class="mb-3 flex flex-wrap gap-2 text-sm print:hidden" data-sheet-summary><span v-for="[k, n] in summary" :key="k" class="badge badge-outline">{{ k }}: {{ n }} ดวง</span></p>
      <p v-if="ready.length" class="mb-3 text-sm print:hidden" data-sheet-layout>{{ layout }}</p>
      <div class="qr-print-area overflow-x-auto rounded-box bg-white p-4">
        <QrStickerSheet :items="ready" :mode="mode" :size-mode="sizeMode" :paper="paper" />
      </div>
      <FormDialog :open="confirmPrinted" title="พิมพ์เรียบร้อยแล้วหรือยัง" @close="confirmPrinted = false">
        <div class="grid gap-3">
          <p>พิมพ์ครบ <strong>{{ ready.length }} คัน</strong> แล้วใช่ไหม? ระบบจะบันทึกว่าพิมพ์แล้ว และรถเหล่านี้จะไม่อยู่ในรายการ "ยังไม่พิมพ์" อีก (ถ้าออก QR ใหม่ภายหลัง จะกลับมาเป็น "ยังไม่พิมพ์" เอง)</p>
          <p v-if="markPhase === 'error'" class="text-error" role="alert">บันทึกไม่สำเร็จ ({{ failure }}) ลองอีกครั้ง</p>
          <div class="flex flex-wrap justify-end gap-2">
            <button class="btn" type="button" @click="confirmPrinted = false">ยังไม่ได้พิมพ์</button>
            <button class="btn btn-primary" type="button" :disabled="markPhase === 'saving'" data-confirm-printed @click="markPrinted"><span v-if="markPhase === 'saving'" class="loading loading-spinner loading-sm"></span>พิมพ์แล้ว บันทึก</button>
          </div>
        </div>
      </FormDialog>
      <Teleport to="body"><div class="qr-print-root"><QrStickerSheet :items="ready" :mode="mode" :size-mode="sizeMode" :paper="paper" /></div></Teleport>
    </section>
  </PageTemplateComponent>
</template>
