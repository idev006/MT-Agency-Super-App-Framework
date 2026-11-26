<script setup>
import { computed, ref, watch } from 'vue'
import { provinceLabel } from '../../../domain/reference/provinces.js'
import { formatThaiPhone, orderContacts, photoSlotLabel, relationshipLabel, telHref } from '../../../domain/reference/vehicle-presentation.js'

// Owner 2026-11-26: "รูปของรถ ไม่แสดง · UI เรียงไม่เป็นระเบียบ · ต้องไม่สร้างความสับสน". One clear order for the
// officer at the roadside: (1) is this the car? — plate + make/model/colour + PHOTO; (2) call the
// coordinator — the call button sits right under the plate; (3) everything else folded below.
// Photos: the front photo loads at once, the others when tapped (each view is audited by the server).
const props = defineProps({
  result: { type: Object, required: true },
  canReadContacts: { type: Boolean, default: false },
  canReadPhotos: { type: Boolean, default: false },
  canReadHistory: { type: Boolean, default: false },
  loadPhoto: { type: Function, default: null },
})
const vehicle = computed(() => props.result.vehicle)
const contacts = computed(() => orderContacts(vehicle.value.contacts))
const primary = computed(() => contacts.value[0] || null)
const others = computed(() => contacts.value.slice(1))
const province = computed(() => provinceLabel(vehicle.value.province) || `รหัส ${vehicle.value.province}`)
const typeText = computed(() => vehicle.value.labels?.vehicleType || vehicle.value.vehicleType)
const colorText = computed(() => vehicle.value.labels?.color || vehicle.value.color)
const makeModel = computed(() => [vehicle.value.brand, vehicle.value.model].filter(Boolean).join(' ') || 'ไม่ระบุยี่ห้อ/รุ่น')
const historyLabels = Object.freeze({
  VEHICLE_UPDATED: 'แก้ไขข้อมูลยานพาหนะ', CONTACT_UPDATED: 'แก้ไขผู้ประสานงาน',
  REGISTRATION_APPROVED: 'อนุมัติการลงทะเบียน', VEHICLE_CANCELLED: 'ยกเลิกยานพาหนะ', PHOTO_REPLACED: 'เปลี่ยนรูปประกอบ',
})
const historyLabel = (action) => historyLabels[action] || 'บันทึกการเปลี่ยนแปลง'
const thaiDateTime = (value) => {
  if (!value || Number.isNaN(Date.parse(value))) return 'ไม่ระบุเวลา'
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value))
}

// photos (in memory only)
const photos = ref({})
const shown = ref('')
const photoList = computed(() => vehicle.value.photos || [])
const canShowPhotos = computed(() => props.canReadPhotos && typeof props.loadPhoto === 'function')
async function showPhoto(photoId) {
  shown.value = photoId
  const state = photos.value[photoId]
  if (!canShowPhotos.value || state?.status === 'ready' || state?.status === 'loading') return
  photos.value = { ...photos.value, [photoId]: { status: 'loading' } }
  try {
    const out = await props.loadPhoto({ vehicleId: vehicle.value.vehicleId, photoId })
    photos.value = { ...photos.value, [photoId]: { status: 'ready', dataUrl: out.dataUrl } }
  } catch (error) {
    photos.value = { ...photos.value, [photoId]: { status: 'error', code: error?.code || 'PHOTO_UNAVAILABLE' } }
  }
}
watch(() => vehicle.value.vehicleId, () => {
  photos.value = {}; shown.value = ''
  const first = photoList.value.find((p) => p.slot === 'FRONT') || photoList.value[0]
  if (first && canShowPhotos.value) showPhoto(first.photoId)
}, { immediate: true })
const current = computed(() => photos.value[shown.value])
const currentSlot = computed(() => photoList.value.find((p) => p.photoId === shown.value)?.slot || '')
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-2">
    <!-- 1. Is this the car? -->
    <section class="card card-border bg-base-100 shadow-none" aria-labelledby="vehicle-result-title">
      <div class="card-body gap-4 p-4 sm:p-5">
        <div class="flex items-start justify-between gap-3">
          <div class="vehicle-plate" role="group" aria-label="ป้ายทะเบียน">
            <h2 id="vehicle-result-title" class="text-3xl font-bold leading-tight sm:text-4xl">{{ vehicle.plate }}</h2>
            <p class="text-lg font-medium">{{ province }}</p>
          </div>
          <span class="badge badge-success badge-lg whitespace-nowrap">ใช้งานอยู่</span>
        </div>
        <div>
          <p class="text-xl font-semibold">{{ makeModel }}</p>
          <p class="text-base-content/80">{{ [colorText && `สี${colorText}`, typeText].filter(Boolean).join(' · ') || 'ไม่ระบุสีและประเภท' }}</p>
        </div>

        <!-- 2. Call the coordinator — right under the plate -->
        <div id="contact-title" class="rounded-box border border-primary/30 bg-primary/5 p-3" aria-label="ผู้ประสานงาน">
          <p v-if="!canReadContacts" class="text-sm">บัญชีนี้ไม่มีสิทธิ์ดูข้อมูลผู้ประสานงาน</p>
          <p v-else-if="!primary" class="text-sm">ไม่มีผู้ประสานงานที่ใช้งานอยู่</p>
          <div v-else class="flex flex-wrap items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-xs text-base-content/80">ผู้ติดต่อหลัก</p>
              <p class="text-lg font-semibold">{{ primary.name }}</p>
              <p class="text-sm text-base-content/80">{{ relationshipLabel(primary.relationship) || 'ไม่ระบุความสัมพันธ์' }} · <span class="whitespace-nowrap font-mono">{{ formatThaiPhone(primary.phone) || 'ไม่มีเบอร์' }}</span></p>
            </div>
            <a v-if="telHref(primary.phone)" class="btn btn-primary btn-lg min-h-12 w-full sm:w-auto" :href="telHref(primary.phone)" :aria-label="`โทรหา ${primary.name} ${formatThaiPhone(primary.phone)}`">โทร</a>
          </div>
          <details v-if="canReadContacts && others.length" class="mt-3">
            <summary class="cursor-pointer text-sm font-medium">ผู้ประสานงานอื่น ({{ others.length }})</summary>
            <ul class="mt-2 space-y-2">
              <li v-for="contact in others" :key="`${contact.name}-${contact.phone}`" class="flex flex-wrap items-center justify-between gap-2 rounded-box bg-base-100 p-3">
                <div class="min-w-0"><p class="font-semibold">{{ contact.name }}</p><p class="text-sm text-base-content/80">{{ relationshipLabel(contact.relationship) || 'ไม่ระบุความสัมพันธ์' }} · <span class="whitespace-nowrap font-mono">{{ formatThaiPhone(contact.phone) }}</span></p></div>
                <a v-if="telHref(contact.phone)" class="btn btn-sm min-h-11" :href="telHref(contact.phone)" :aria-label="`โทรหา ${contact.name}`">โทร</a>
              </li>
            </ul>
          </details>
        </div>
        <div class="card-actions"><RouterLink class="btn btn-sm btn-ghost" :to="{ name: 'vehicle-detail', params: { vehicleId: vehicle.vehicleId } }">ดูรายละเอียดทั้งหมด</RouterLink></div>
      </div>
    </section>

    <!-- 1b. The photo, to compare with the car in front of you -->
    <section class="card card-border bg-base-100 shadow-none" aria-labelledby="photo-title">
      <div class="card-body gap-3 p-4 sm:p-5">
        <h2 id="photo-title" class="font-semibold">ภาพรถ <span class="text-sm font-normal text-base-content/80">ใช้เทียบกับรถคันตรงหน้า</span></h2>
        <div v-if="!canReadPhotos" class="alert shadow-none"><span>บัญชีนี้ไม่มีสิทธิ์ดูภาพรถ</span></div>
        <div v-else-if="!photoList.length" class="alert shadow-none"><span>ไม่พบรูปที่ใช้งานอยู่</span></div>
        <div v-else-if="!canShowPhotos" class="alert shadow-none"><span>หน้านี้ไม่ได้เปิดให้ดูภาพ</span></div>
        <template v-else>
          <div class="relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-box bg-base-200" data-vehicle-photo>
            <img v-if="current?.status === 'ready'" :src="current.dataUrl" :alt="`ภาพ${photoSlotLabel(currentSlot)}`" class="h-full w-full object-contain" />
            <div v-else-if="current?.status === 'error'" class="text-center"><p>โหลดภาพไม่สำเร็จ</p><button class="btn btn-sm mt-2" type="button" @click="photos = { ...photos, [shown]: undefined }; showPhoto(shown)">ลองใหม่</button></div>
            <span v-else class="loading loading-spinner loading-lg" role="status"><span class="sr-only">กำลังโหลดภาพ</span></span>
            <span v-if="currentSlot" class="badge absolute left-2 top-2">{{ photoSlotLabel(currentSlot) }}</span>
          </div>
          <div class="flex flex-wrap gap-2" role="group" aria-label="เลือกภาพ">
            <button v-for="photo in photoList" :key="photo.photoId" type="button" class="btn btn-sm min-h-11" :class="photo.photoId === shown ? 'btn-primary' : ''" :aria-pressed="photo.photoId === shown" @click="showPhoto(photo.photoId)">{{ photoSlotLabel(photo.slot) }}</button>
          </div>
        </template>
      </div>
    </section>

    <!-- 3. Everything else, folded -->
    <details class="collapse collapse-arrow border border-base-300 bg-base-100 lg:col-span-2">
      <summary class="collapse-title font-medium">ประวัติการเปลี่ยนแปลง{{ canReadHistory ? ` (${result.history.length})` : '' }}</summary>
      <div class="collapse-content">
        <p v-if="!canReadHistory" class="text-sm">บัญชีนี้ไม่มีสิทธิ์ดูประวัติ</p>
        <p v-else-if="!result.history.length" class="text-sm">ยังไม่มีประวัติการเปลี่ยนแปลง</p>
        <div v-else class="p6-table-wrap"><table class="p6-table" aria-label="ประวัติการเปลี่ยนแปลง">
          <thead><tr><th>เมื่อ</th><th>รายการ</th></tr></thead>
          <tbody><tr v-for="entry in result.history" :key="entry.id"><td class="p6-col-date">{{ thaiDateTime(entry.occurredAt) }}</td><td class="p6-col-text">{{ historyLabel(entry.action) }}</td></tr></tbody>
        </table></div>
      </div>
    </details>
    <details class="collapse collapse-arrow border border-base-300 bg-base-100 lg:col-span-2">
      <summary class="collapse-title text-sm font-medium">รายละเอียดสำหรับเจ้าหน้าที่สนับสนุน</summary>
      <div class="collapse-content text-sm">
        <dl class="grid gap-2 sm:grid-cols-2"><div><dt class="text-base-content/80">Request ID ค้นหา</dt><dd class="break-all font-mono">{{ result.requestIds?.lookup || 'ไม่มี' }}</dd></div><div><dt class="text-base-content/80">Request ID ประวัติ</dt><dd class="break-all font-mono">{{ result.requestIds?.history || 'ไม่มี' }}</dd></div></dl>
      </div>
    </details>
  </div>
</template>
