<script setup>
import { computed, ref, watch } from 'vue'
import { provinceLabel } from '../../../domain/reference/provinces.js'
import { formatThaiPhone, orderContacts, photoSlotLabel, relationshipLabel, telHref } from '../../../domain/reference/vehicle-presentation.js'
import { formatBangkokDateTime } from '../../../domain/time/bangkok-date-time.js'
import QrHistoryTable from '../../qr-governance/components/QrHistoryTable.vue'

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
})
const tabs = computed(() => [
  { id: 'facts', label: 'ข้อมูลรถ' },
  { id: 'contacts', label: `ผู้ประสานงาน (${props.result.vehicle.contacts.length})`, hidden: !props.canReadContacts },
  { id: 'photos', label: `ภาพหลักฐาน (${props.result.vehicle.photos.length})`, hidden: !props.canReadPhotos },
  { id: 'history', label: 'ประวัติ', hidden: !props.canReadHistory },
  { id: 'qr', label: 'ประวัติ QR', hidden: !props.loadQrHistory },
].filter((t) => !t.hidden))
const active = ref('facts')
const vehicle = computed(() => props.result.vehicle)
const contacts = computed(() => orderContacts(vehicle.value.contacts))
const photos = ref({})
const activePhoto = ref('')

const facts = computed(() => {
  const v = vehicle.value
  return [
    ['ทะเบียน', `${v.plate} · ${provinceLabel(v.province) || v.province}`],
    ['ประเภทรถ', v.labels?.vehicleType || v.vehicleType],
    ['ประเภทป้าย', v.labels?.plateType || v.plateType],
    ['ยี่ห้อ / รุ่น', [v.brand, v.model].filter(Boolean).join(' ')],
    ['สี', v.labels?.color || v.color],
    ['หน่วยงานที่รับลงทะเบียน', v.organization?.name || v.organization?.id],
    ['ลงทะเบียน (อนุมัติ) เมื่อ', formatBangkokDateTime(v.registeredAt, '')],
    ['แก้ไขล่าสุด', formatBangkokDateTime(v.updatedAt, '')],
    ['เวอร์ชันข้อมูล', props.result.version ? String(props.result.version) : ''],
  ]
})
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
async function openQrHistory() {
  if (!props.loadQrHistory || qrHistoryPhase.value === 'loading') return
  qrHistoryPhase.value = 'loading'
  try { qrHistory.value = await props.loadQrHistory(vehicle.value.vehicleId); qrHistoryPhase.value = 'ready' } catch { qrHistoryPhase.value = 'error' }
}
watch(active, (tab) => { if (tab === 'photos') openPhotos(); if (tab === 'qr') openQrHistory() })
watch(() => vehicle.value.vehicleId, () => { photos.value = {}; activePhoto.value = ''; active.value = 'facts'; qrHistory.value = []; qrHistoryPhase.value = 'idle' })
const current = computed(() => photos.value[activePhoto.value])
const currentSlot = computed(() => vehicle.value.photos.find((p) => p.photoId === activePhoto.value)?.slot || '')
</script>

<template>
  <div class="space-y-4">
    <section class="card card-border bg-base-100 shadow-none" aria-labelledby="vehicle-result-title">
      <!-- Owner (mobile): plate + text were squeezed side by side and the QR badge text wrapped inside
           the badge. Phones stack; badges hold short words only, dates go on their own line. -->
      <div class="card-body flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
        <div class="vehicle-plate" role="group" aria-label="ป้ายทะเบียน"><h2 id="vehicle-result-title" class="text-3xl font-bold leading-tight">{{ vehicle.plate }}</h2><p class="text-lg font-medium">{{ provinceLabel(vehicle.province) || vehicle.province }}</p></div>
        <div class="min-w-0 flex-1 space-y-2">
          <p class="text-lg font-medium">{{ [vehicle.brand, vehicle.model, vehicle.labels?.color || vehicle.color].filter(Boolean).join(' · ') }}</p>
          <p class="flex flex-wrap items-center gap-2"><span class="badge badge-success whitespace-nowrap">ใช้งานอยู่</span><span v-if="vehicle.qr?.known" class="badge whitespace-nowrap" :class="vehicle.qr.active ? 'badge-info' : 'badge-warning'">{{ vehicle.qr.active ? 'มี QR ใช้งาน' : 'ไม่มี QR' }}</span></p>
          <p v-if="vehicle.qr?.active && vehicle.qr.issuedAt" class="text-sm text-base-content/80">ออก QR เมื่อ {{ formatBangkokDateTime(vehicle.qr.issuedAt, '') }}</p>
        </div>
      </div>
    </section>

    <div role="tablist" class="tabs tabs-border flex-nowrap overflow-x-auto" aria-label="ข้อมูลยานพาหนะ">
      <button v-for="tab in tabs" :id="`vt-${tab.id}`" :key="tab.id" role="tab" type="button" class="tab min-h-11 whitespace-nowrap" :class="{ 'tab-active': active === tab.id }" :aria-selected="active === tab.id" :aria-controls="`vp-${tab.id}`" @click="active = tab.id">{{ tab.label }}</button>
    </div>

    <section v-show="active === 'facts'" id="vp-facts" role="tabpanel" aria-labelledby="vt-facts" class="card card-border bg-base-100 shadow-none">
      <dl class="card-body grid gap-x-8 gap-y-3 p-5 sm:grid-cols-2">
        <div v-for="[label, value] in facts" :key="label" class="flex justify-between gap-3 border-b border-base-200 pb-2"><dt class="text-base-content/80">{{ label }}</dt><dd class="text-right font-medium">{{ value || '—' }}</dd></div>
      </dl>
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
        <ul v-else class="timeline timeline-vertical timeline-compact">
          <li v-for="(entry, index) in result.history" :key="entry.id"><hr v-if="index"><div class="timeline-middle"><span class="status status-neutral" aria-hidden="true"></span></div><div class="timeline-end mb-4"><strong class="font-medium">{{ historyLabels[entry.action] || 'บันทึกการเปลี่ยนแปลง' }}</strong><p class="text-sm text-base-content/80">{{ formatBangkokDateTime(entry.occurredAt, '-') }}</p></div><hr v-if="index < result.history.length - 1"></li>
        </ul>
      </div>
    </section>
    <section v-if="loadQrHistory" v-show="active === 'qr'" id="vp-qr" role="tabpanel" aria-labelledby="vt-qr" class="card card-border bg-base-100 shadow-none">
      <div class="card-body p-5"><QrHistoryTable :items="qrHistory" :phase="qrHistoryPhase === 'idle' ? 'loading' : qrHistoryPhase" /></div>
    </section>
  </div>
</template>
