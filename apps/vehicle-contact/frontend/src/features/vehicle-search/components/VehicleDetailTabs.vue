<script setup>
import { computed, ref, watch } from 'vue'
import { provinceLabel } from '../../../domain/reference/provinces.js'
import { formatThaiPhone, orderContacts, photoSlotLabel, relationshipLabel, telHref } from '../../../domain/reference/vehicle-presentation.js'
import { formatBangkokDateTime } from '../../../domain/time/bangkok-date-time.js'
import QrHistoryTable from '../../qr-governance/components/QrHistoryTable.vue'
import VehicleQrImage from '../../qr-governance/components/VehicleQrImage.vue'
import { stickerText } from '../../../domain/reference/sticker-categories.js'

// R7 (owner: "ทำไมไม่มีภาพรถ และข้อมูลอื่นๆ เพื่อประกอบการพิจารณาครบมั้ย" + "ใช้ tabs บ้าง"):
// the full vehicle record for decision making, split into tabs. Photos load only when their tab
// is opened (all 5 in parallel), stay in memory, and every view is audited by the backend.
const props = defineProps({
  result: { type: Object, required: true },
  canReadContacts: Boolean,
  canReadPhotos: Boolean,
  canReadHistory: Boolean,
  loadPhoto: { type: Function, default: null },
  // VC-ADR-036 S3: QR history tab for qr.manage holders
  loadQrHistory: { type: Function, default: null },
  // S5: the current QR (image + print link) for qr.manage holders
  loadQrCode: { type: Function, default: null },
})
const tabs = computed(() => [
  { id: 'facts', label: 'ภาพรวม' },
  { id: 'contacts', label: `ผู้ประสานงาน (${props.result.vehicle.contacts.length})`, hidden: !props.canReadContacts },
  { id: 'photos', label: `ภาพหลักฐาน (${props.result.vehicle.photos.length})`, hidden: !props.canReadPhotos },
  { id: 'history', label: 'ประวัติ', hidden: !props.canReadHistory },
  { id: 'qr', label: 'QR และประวัติ QR', hidden: !props.loadQrHistory },
  // VC-ADR-036 S2: shown only when the server sent the dimension
  { id: 'origin', label: 'ที่มาและคำขอ', hidden: !extras.value.hasAdmin },
  { id: 'access', label: 'การเข้าดู', hidden: !extras.value.accessLog },
].filter((t) => !t.hidden))
const active = ref('facts')
const vehicle = computed(() => props.result.vehicle)
const contacts = computed(() => orderContacts(vehicle.value.contacts))
const photos = ref({})
const activePhoto = ref('')

const extras = computed(() => {
  const e = props.result.extras || {}
  return { ...e, hasAdmin: 'createdByName' in e }
})
const SOURCE_LABELS = Object.freeze({ DETAIL: 'เปิดรายละเอียด', LOOKUP: 'ค้นหาทะเบียน', QR: 'สแกน QR', PHOTO: 'เปิดภาพ' })
const REQUEST_LABELS = Object.freeze({ PENDING_APPROVAL: 'รอตรวจ', PENDING: 'รอตรวจ', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ปฏิเสธ' })
const FIELD_LABELS = Object.freeze({ brand: 'ยี่ห้อ', model: 'รุ่น', color: 'สี', plateType: 'ประเภทป้าย', vehicleType: 'ประเภทรถ', contactName: 'ชื่อผู้ประสานงาน', contactPhone: 'เบอร์โทร', relationship: 'ความสัมพันธ์' })
const when = (v) => formatBangkokDateTime(v, '—')
// Owner 2026-11-25 ("หน้ารายละเอียดของรถ มีตารางและข้อมูลมาก จง refac/redesign"): an overview first —
// what the vehicle is, who to contact, who registered it — as labelled values (label above value, never a
// squeezed two-column table); dense lists (history, requests, access, QR) stay tables in their own tabs.
const vehicleFacts = computed(() => {
  const v = vehicle.value
  return [
    ['ทะเบียน', v.plate], ['จังหวัด', provinceLabel(v.province) || v.province],
    ['ประเภทรถ', v.labels?.vehicleType || v.vehicleType], ['ประเภทป้าย', v.labels?.plateType || v.plateType],
    ['ยี่ห้อ', v.brand], ['รุ่น', v.model], ['สี', v.labels?.color || v.color],
    ['ประเภทผู้ใช้รถ (สติกเกอร์)', stickerText(v.sticker)],
  ]
})
const recordFacts = computed(() => {
  const v = vehicle.value
  return [
    ['หน่วยงานที่รับลงทะเบียน', v.organization?.name || v.organization?.id],
    ['ลงทะเบียน (อนุมัติ) เมื่อ', formatBangkokDateTime(v.registeredAt, '')],
    ['แก้ไขล่าสุด', formatBangkokDateTime(v.updatedAt, '')],
    ['เวอร์ชันข้อมูล', props.result.version ? String(props.result.version) : ''],
    ...(extras.value.hasAdmin ? [
      ['บัญชีเจ้าของรถ', extras.value.owner?.name || 'ยังไม่ผูกบัญชีเจ้าของ'],
      ['สร้างโดย', extras.value.createdByName || '—'],
      ['แก้ไขล่าสุดโดย', extras.value.updatedByName || '—'],
    ] : []),
  ]
})
const primaryContact = computed(() => contacts.value[0] || null)
const historyLabels = Object.freeze({
  VEHICLE_UPDATED: 'แก้ไขข้อมูลยานพาหนะ', CONTACT_UPDATED: 'แก้ไขผู้ประสานงาน',
  REGISTRATION_APPROVED: 'อนุมัติการลงทะเบียน', VEHICLE_CANCELLED: 'ยกเลิกยานพาหนะ', PHOTO_REPLACED: 'เปลี่ยนรูปประกอบ',
})

async function openPhotos() {
  if (!props.loadPhoto) return
  const list = vehicle.value.photos
  if (!activePhoto.value && list.length) activePhoto.value = (list.find((p) => p.slot === 'FRONT') || list[0]).photoId
  await Promise.all(list.filter((p) => !photos.value[p.photoId] || photos.value[p.photoId].status === 'error').map(async (p) => {
    photos.value = { ...photos.value, [p.photoId]: { status: 'loading' } }
    try {
      const out = await props.loadPhoto({ vehicleId: vehicle.value.vehicleId, photoId: p.photoId })
      photos.value = { ...photos.value, [p.photoId]: { status: 'ready', dataUrl: out.dataUrl } }
    } catch (error) {
      photos.value = { ...photos.value, [p.photoId]: { status: 'error', code: error?.code || 'UNEXPECTED_ERROR' } }
    }
  }))
}
const qrHistory = ref([])
const qrHistoryPhase = ref('idle')
const qrCode = ref(null)
const qrCodePhase = ref('idle')
async function openQrCode() {
  if (!props.loadQrCode || qrCodePhase.value === 'loading' || qrCodePhase.value === 'ready') return
  qrCodePhase.value = 'loading'
  try { qrCode.value = await props.loadQrCode(vehicle.value.vehicleId); qrCodePhase.value = 'ready' } catch { qrCodePhase.value = 'error' }
}
async function openQrHistory() {
  openQrCode()
  if (!props.loadQrHistory || qrHistoryPhase.value === 'loading') return
  qrHistoryPhase.value = 'loading'
  try { qrHistory.value = await props.loadQrHistory(vehicle.value.vehicleId); qrHistoryPhase.value = 'ready' } catch { qrHistoryPhase.value = 'error' }
}
watch(active, (tab) => { if (tab === 'photos') openPhotos(); if (tab === 'qr') openQrHistory() })
watch(() => vehicle.value.vehicleId, () => { photos.value = {}; activePhoto.value = ''; active.value = 'facts'; qrHistory.value = []; qrHistoryPhase.value = 'idle'; qrCode.value = null; qrCodePhase.value = 'idle' })
const current = computed(() => photos.value[activePhoto.value])
const currentSlot = computed(() => vehicle.value.photos.find((p) => p.photoId === activePhoto.value)?.slot || '')
</script>

<template>
  <div class="space-y-4">
    <section class="card card-border bg-base-100 shadow-none" aria-labelledby="vehicle-result-title">
      <div class="card-body gap-4 p-4 sm:p-5">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div class="vehicle-plate shrink-0" role="group" aria-label="ป้ายทะเบียน"><h2 id="vehicle-result-title" class="text-3xl font-bold leading-tight">{{ vehicle.plate }}</h2><p class="text-lg font-medium">{{ provinceLabel(vehicle.province) || vehicle.province }}</p></div>
          <div class="min-w-0 flex-1 space-y-2">
            <p class="text-xl font-semibold">{{ [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'ไม่ระบุยี่ห้อ/รุ่น' }}</p>
            <p class="flex flex-wrap items-center gap-2">
              <span class="badge badge-success whitespace-nowrap">ใช้งานอยู่</span>
              <span v-if="vehicle.qr?.known" class="badge whitespace-nowrap" :class="vehicle.qr.active ? 'badge-info' : 'badge-warning'">{{ vehicle.qr.active ? 'มี QR ใช้งาน' : 'ไม่มี QR ใช้งาน' }}</span>
              <span v-if="vehicle.labels?.vehicleType || vehicle.vehicleType" class="badge badge-ghost whitespace-nowrap">{{ vehicle.labels?.vehicleType || vehicle.vehicleType }}</span>
              <span v-if="vehicle.labels?.color || vehicle.color" class="badge badge-ghost whitespace-nowrap">สี{{ vehicle.labels?.color || vehicle.color }}</span>
            </p>
          </div>
        </div>
        <dl class="vd-meta">
          <div><dt>หน่วยงาน</dt><dd>{{ vehicle.organization?.name || '—' }}</dd></div>
          <div><dt>อนุมัติเมื่อ</dt><dd>{{ formatBangkokDateTime(vehicle.registeredAt, '—') }}</dd></div>
          <div v-if="vehicle.qr?.active && vehicle.qr.issuedAt"><dt>ออก QR เมื่อ</dt><dd>{{ formatBangkokDateTime(vehicle.qr.issuedAt, '—') }}</dd></div>
        </dl>
      </div>
    </section>

    <div role="tablist" class="vd-tabs tabs tabs-border sticky top-0 z-10 flex-nowrap overflow-x-auto bg-base-200" aria-label="ข้อมูลยานพาหนะ">
      <button v-for="tab in tabs" :id="`vt-${tab.id}`" :key="tab.id" role="tab" type="button" class="tab min-h-11 whitespace-nowrap" :class="{ 'tab-active': active === tab.id }" :aria-selected="active === tab.id" :aria-controls="`vp-${tab.id}`" @click="active = tab.id">{{ tab.label }}</button>
    </div>

    <section v-show="active === 'facts'" id="vp-facts" role="tabpanel" aria-labelledby="vt-facts" class="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div class="card card-border bg-base-100 shadow-none"><div class="card-body gap-3 p-5">
        <h3 class="font-semibold">ข้อมูลรถ</h3>
        <dl class="vd-facts"><div v-for="[label, value] in vehicleFacts" :key="label"><dt>{{ label }}</dt><dd>{{ value || '—' }}</dd></div></dl>
      </div></div>
      <div class="grid content-start gap-4">
        <div v-if="canReadContacts" class="card card-border bg-base-100 shadow-none"><div class="card-body gap-3 p-5">
          <div class="flex items-center justify-between gap-2"><h3 class="font-semibold">ผู้ติดต่อหลัก</h3><button v-if="contacts.length > 1" class="btn btn-ghost btn-xs" type="button" @click="active = 'contacts'">ดูทั้งหมด ({{ contacts.length }})</button></div>
          <p v-if="!primaryContact" class="text-base-content/80">ไม่มีผู้ประสานงานที่ใช้งานอยู่</p>
          <div v-else class="flex flex-wrap items-center justify-between gap-3">
            <div class="min-w-0"><p class="text-lg font-semibold">{{ primaryContact.name }}</p><p class="text-sm text-base-content/80">{{ relationshipLabel(primaryContact.relationship) || 'ไม่ระบุความสัมพันธ์' }} · <span class="whitespace-nowrap">{{ formatThaiPhone(primaryContact.phone) }}</span></p></div>
            <a v-if="telHref(primaryContact.phone)" class="btn btn-primary min-h-11" :href="telHref(primaryContact.phone)" :aria-label="`โทรหา ${primaryContact.name}`">โทร</a>
          </div>
        </div></div>
        <div class="card card-border bg-base-100 shadow-none"><div class="card-body gap-3 p-5">
          <h3 class="font-semibold">การลงทะเบียนและการแก้ไข</h3>
          <dl class="vd-facts vd-facts--stack"><div v-for="[label, value] in recordFacts" :key="label"><dt>{{ label }}</dt><dd>{{ value || '—' }}</dd></div></dl>
        </div></div>
      </div>
    </section>

    <section v-if="canReadContacts" v-show="active === 'contacts'" id="vp-contacts" role="tabpanel" aria-labelledby="vt-contacts" class="card card-border bg-base-100 shadow-none">
      <div class="card-body gap-3 p-5">
        <div v-if="!contacts.length" class="alert shadow-none">ไม่มีผู้ประสานงานที่ใช้งานอยู่</div>
        <ul v-else class="space-y-3">
          <li v-for="contact in contacts" :key="`${contact.name}-${contact.phone}`" class="flex flex-wrap items-center justify-between gap-3 rounded-box border border-base-300 p-4">
            <div class="min-w-0"><p class="text-lg font-semibold">{{ contact.name }} <span v-if="contact.isPrimary" class="badge badge-primary badge-sm align-middle">ผู้ติดต่อหลัก</span></p><p class="text-sm text-base-content/80">{{ relationshipLabel(contact.relationship) || 'ไม่ระบุความสัมพันธ์' }} · <span class="font-mono">{{ formatThaiPhone(contact.phone) || 'ไม่มีหมายเลข' }}</span></p></div>
            <a v-if="telHref(contact.phone)" class="btn btn-primary min-h-11" :href="telHref(contact.phone)" :aria-label="`โทรหา ${contact.name}`">โทร</a>
          </li>
        </ul>
      </div>
    </section>

    <section v-if="canReadPhotos" v-show="active === 'photos'" id="vp-photos" role="tabpanel" aria-labelledby="vt-photos" class="card card-border bg-base-100 shadow-none">
      <div class="card-body gap-3 p-5">
        <div v-if="!vehicle.photos.length" class="alert shadow-none">ไม่พบรูปที่ใช้งานอยู่</div>
        <div v-else-if="!loadPhoto" class="alert shadow-none">หน้านี้ไม่ได้เปิดให้ดูภาพ</div>
        <template v-else>
          <div class="relative grid aspect-[4/3] max-h-[28rem] w-full place-items-center overflow-hidden rounded-box bg-base-200">
            <img v-if="current?.status === 'ready'" :src="current.dataUrl" :alt="`ภาพ${photoSlotLabel(currentSlot)}`" class="h-full w-full object-contain" />
            <div v-else-if="current?.status === 'error'" class="text-center"><p>โหลดภาพไม่สำเร็จ ({{ current.code }})</p><button class="btn btn-sm mt-2" type="button" @click="openPhotos">ลองใหม่</button></div>
            <span v-else class="loading loading-spinner loading-lg" role="status"><span class="sr-only">กำลังโหลดภาพ</span></span>
            <span v-if="currentSlot" class="badge absolute left-3 top-3">{{ photoSlotLabel(currentSlot) }}</span>
          </div>
          <ul class="grid grid-cols-5 gap-2" aria-label="เลือกภาพ">
            <li v-for="photo in vehicle.photos" :key="photo.photoId">
              <button type="button" class="block w-full overflow-hidden rounded-box border-2 bg-base-200" :class="photo.photoId === activePhoto ? 'border-primary' : 'border-transparent'" :aria-pressed="photo.photoId === activePhoto" @click="activePhoto = photo.photoId">
                <span class="relative block aspect-square"><img v-if="photos[photo.photoId]?.status === 'ready'" :src="photos[photo.photoId].dataUrl" alt="" class="absolute inset-0 h-full w-full object-cover" /><span v-else class="skeleton absolute inset-0"></span></span>
                <span class="block truncate px-1 py-1 text-center text-xs">{{ photoSlotLabel(photo.slot) }}</span>
              </button>
            </li>
          </ul>
          <p class="text-sm text-base-content/80">ภาพแสดงในหน่วยความจำเท่านั้น ไม่บันทึกลงเครื่อง และการเปิดดูถูกบันทึก audit</p>
        </template>
      </div>
    </section>

    <section v-if="canReadHistory" v-show="active === 'history'" id="vp-history" role="tabpanel" aria-labelledby="vt-history" class="card card-border bg-base-100 shadow-none">
      <div class="card-body p-5">
        <div v-if="!result.history.length" class="alert shadow-none">ยังไม่มีประวัติ (รถที่ลงทะเบียนก่อนเวอร์ชัน 0.9.14 จะไม่มีเหตุการณ์อนุมัติในประวัตินี้)</div>
        <div v-else class="p6-table-wrap"><table class="p6-table" aria-label="ประวัติการเปลี่ยนแปลง">
          <thead><tr><th>เมื่อ</th><th>รายการ</th></tr></thead>
          <tbody><tr v-for="entry in result.history" :key="entry.id"><td class="p6-col-date">{{ formatBangkokDateTime(entry.occurredAt, '-') }}</td><td class="p6-col-text">{{ historyLabels[entry.action] || 'บันทึกการเปลี่ยนแปลง' }}</td></tr></tbody>
        </table></div>
      </div>
    </section>
    <section v-if="loadQrHistory" v-show="active === 'qr'" id="vp-qr" role="tabpanel" aria-labelledby="vt-qr" class="card card-border bg-base-100 shadow-none">
      <div class="card-body gap-4 p-5">
        <div v-if="loadQrCode" class="rounded-box border border-base-300 p-4" data-current-qr>
          <h3 class="font-semibold">QR ปัจจุบัน</h3>
          <div v-if="qrCodePhase === 'loading' || qrCodePhase === 'idle'" class="skeleton mt-2 h-24 w-40" role="status"><span class="sr-only">กำลังโหลด QR</span></div>
          <p v-else-if="qrCodePhase === 'error'" class="mt-2 text-sm text-error">โหลด QR ไม่สำเร็จ</p>
          <template v-else-if="qrCode?.status === 'READY'">
            <VehicleQrImage :token="qrCode.token" :label="vehicle.plate" />
            <RouterLink class="btn btn-sm mt-2" :to="{ name: 'qr-print', query: { vehicle: vehicle.vehicleId } }">พิมพ์ QR คันนี้</RouterLink>
          </template>
          <p v-else class="mt-2 text-sm">{{ qrCode?.status === 'REISSUE_NEEDED' ? 'QR นี้ออกก่อนระบบเก็บรหัส จึงแสดงภาพไม่ได้ ออก QR ใหม่เพื่อพิมพ์' : 'ยังไม่มี QR ที่ใช้งานอยู่' }}
            <RouterLink class="link ml-1" :to="{ name: 'qr-governance', query: { vehicleId: vehicle.vehicleId } }">ไปจัดการ QR</RouterLink></p>
        </div>
        <QrHistoryTable :items="qrHistory" :phase="qrHistoryPhase === 'idle' ? 'loading' : qrHistoryPhase" />
      </div>
    </section>
    <section v-if="extras.hasAdmin" v-show="active === 'origin'" id="vp-origin" role="tabpanel" aria-labelledby="vt-origin" class="card card-border bg-base-100 shadow-none">
      <div class="card-body gap-4 p-5">
        <h3 class="font-semibold">การลงทะเบียน</h3>
        <dl v-if="extras.registration" class="vd-facts">
          <div><dt>ช่องทาง</dt><dd>{{ extras.registration.viaCampaign ? `แคมเปญ ${extras.registration.campaignName || '(ไม่มีชื่อ)'}` : 'บันทึกโดยเจ้าหน้าที่' }}</dd></div>
          <div><dt>ยื่นคำขอเมื่อ</dt><dd>{{ when(extras.registration.submittedAt) }}</dd></div>
          <div><dt>ผลการพิจารณา</dt><dd>{{ REQUEST_LABELS[extras.registration.status] || extras.registration.status }}</dd></div>
          <div><dt>พิจารณาเมื่อ</dt><dd>{{ when(extras.registration.reviewedAt) }}</dd></div>
          <div><dt>ผู้พิจารณา</dt><dd>{{ extras.registration.reviewedByName || '—' }}</dd></div>
        </dl>
        <p v-else class="text-base-content/80">ไม่พบคำขอลงทะเบียนของรถคันนี้</p>
        <h3 class="font-semibold">คำขอเปลี่ยนแปลงจากเจ้าของ ({{ extras.changeRequests.length }})</h3>
        <div v-if="extras.changeRequests.length" class="p6-table-wrap"><table class="p6-table">
          <thead><tr><th>ยื่นเมื่อ</th><th>ผู้ยื่น</th><th>รายการที่ขอแก้</th><th>สถานะ</th><th>พิจารณาโดย</th></tr></thead>
          <tbody><tr v-for="(c, i) in extras.changeRequests" :key="i"><td class="whitespace-nowrap">{{ when(c.submittedAt) }}</td><td>{{ c.submittedByName || '—' }}</td><td class="p6-col-text">{{ c.fields.map((f) => FIELD_LABELS[f] || f).join(', ') || '—' }}</td><td class="whitespace-nowrap">{{ REQUEST_LABELS[c.status] || c.status }}</td><td>{{ c.reviewedByName ? `${c.reviewedByName} · ${when(c.reviewedAt)}` : '—' }}</td></tr></tbody>
        </table></div>
        <p v-else class="text-base-content/80">ยังไม่มีคำขอเปลี่ยนแปลง</p>
        <template v-if="extras.retention"><h3 class="font-semibold">การเก็บรักษาข้อมูล</h3><p>{{ extras.retention.status }} · ครบกำหนด {{ when(extras.retention.dueAt) }}<span v-if="extras.retention.legalHold"> · ระงับการลบตามกฎหมาย</span></p></template>
      </div>
    </section>
    <section v-if="extras.accessLog" v-show="active === 'access'" id="vp-access" role="tabpanel" aria-labelledby="vt-access" class="card card-border bg-base-100 shadow-none">
      <div class="card-body gap-3 p-5">
        <p class="text-sm text-base-content/80">ผู้ที่ค้นหาหรือเปิดดูรถคันนี้ ล่าสุด {{ extras.accessLog.length }} ครั้ง (เห็นเฉพาะผู้ดูแลระบบ)</p>
        <div class="p6-table-wrap"><table class="p6-table" aria-label="ประวัติการเข้าดู">
          <thead><tr><th>เมื่อ</th><th>ผู้ใช้</th><th>ช่องทาง</th></tr></thead>
          <tbody><tr v-for="(a, i) in extras.accessLog" :key="i"><td class="whitespace-nowrap">{{ when(a.at) }}</td><td>{{ a.actorName || '—' }}</td><td>{{ SOURCE_LABELS[a.source] || a.source }}</td></tr></tbody>
        </table></div>
      </div>
    </section>
  </div>
</template>

<style>
/* Vehicle detail: labelled values — label (small, muted) above the value, columns as wide as the screen
   allows (min 11rem each), so short values never wrap and nothing is squeezed. */
.vd-facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: 0.875rem 1rem; }
.vd-facts--stack { grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); }
.vd-facts dt, .vd-meta dt { font-size: 0.8125rem; color: color-mix(in oklab, var(--color-base-content) 70%, transparent); }
.vd-facts dd { margin: 0.125rem 0 0; font-weight: 600; overflow-wrap: anywhere; }
.vd-meta { display: flex; flex-wrap: wrap; gap: 0.5rem 2rem; border-top: 1px solid var(--color-base-300); padding-top: 0.75rem; }
.vd-meta dd { margin: 0; font-weight: 500; white-space: nowrap; }
/* tabs scroll sideways on narrow screens without a heavy scrollbar */
.vd-tabs { scrollbar-width: none; }
.vd-tabs::-webkit-scrollbar { display: none; }
</style>
