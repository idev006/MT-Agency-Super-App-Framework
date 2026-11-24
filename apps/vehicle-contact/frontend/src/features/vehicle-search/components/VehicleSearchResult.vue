<script setup>
import { computed } from 'vue'
import { provinceLabel } from '../../../domain/reference/provinces.js'
import { formatThaiPhone, orderContacts, photoSlotLabel, relationshipLabel, telHref } from '../../../domain/reference/vehicle-presentation.js'

const props = defineProps({
  result: { type: Object, required: true },
  canReadContacts: { type: Boolean, default: false },
  canReadPhotos: { type: Boolean, default: false },
  canReadHistory: { type: Boolean, default: false },
})

const vehicle = computed(() => props.result.vehicle)
const contacts = computed(() => orderContacts(vehicle.value.contacts))
const province = computed(() => provinceLabel(vehicle.value.province) || `รหัส ${vehicle.value.province}`)
const typeText = computed(() => vehicle.value.labels?.vehicleType || vehicle.value.vehicleType)
const colorText = computed(() => vehicle.value.labels?.color || vehicle.value.color)
const describe = computed(() => [vehicle.value.brand, vehicle.value.model, colorText.value].filter(Boolean).join(' · ') || 'ไม่ระบุรายละเอียดรถ')
const historyLabels = Object.freeze({
  VEHICLE_UPDATED: 'แก้ไขข้อมูลยานพาหนะ',
  CONTACT_UPDATED: 'แก้ไขผู้ประสานงาน',
  REGISTRATION_APPROVED: 'อนุมัติการลงทะเบียน',
  VEHICLE_CANCELLED: 'ยกเลิกยานพาหนะ',
})
const historyLabel = (action) => historyLabels[action] || 'บันทึกการเปลี่ยนแปลง'
const thaiDateTime = (value) => {
  if (!value || Number.isNaN(Date.parse(value))) return 'ไม่ระบุเวลา'
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value))
}
</script>

<template>
  <div class="space-y-5">
    <!-- Identity: the plate as officers read it on the car. -->
    <section class="card card-border bg-base-100 shadow-none" aria-labelledby="vehicle-result-title">
      <div class="card-body gap-4 p-5 sm:p-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="vehicle-plate" role="group" aria-label="ป้ายทะเบียน">
            <h2 id="vehicle-result-title" class="text-3xl font-bold leading-tight sm:text-4xl">{{ vehicle.plate }}</h2>
            <p class="text-lg font-medium">{{ province }}</p>
          </div>
          <span class="badge badge-success badge-lg">ใช้งานอยู่</span>
        </div>
        <p class="text-lg">{{ describe }}</p>
        <dl class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt class="text-base-content/80">ประเภทรถ</dt><dd class="font-medium">{{ typeText || 'ไม่ระบุ' }}</dd></div>
          <div><dt class="text-base-content/80">ยี่ห้อ</dt><dd class="font-medium">{{ vehicle.brand || 'ไม่ระบุ' }}</dd></div>
          <div><dt class="text-base-content/80">รุ่น</dt><dd class="font-medium">{{ vehicle.model || 'ไม่ระบุ' }}</dd></div>
          <div><dt class="text-base-content/80">สี</dt><dd class="font-medium">{{ colorText || 'ไม่ระบุ' }}</dd></div>
        </dl>
        <div class="card-actions"><RouterLink class="btn btn-sm" :to="{ name: 'vehicle-detail', params: { vehicleId: vehicle.vehicleId } }">ดูรายละเอียดทั้งหมด</RouterLink></div>
      </div>
    </section>

    <!-- The officer's main job: reach the coordinator. -->
    <section class="card card-border bg-base-100 shadow-none" aria-labelledby="contact-title">
      <div class="card-body gap-3 p-5 sm:p-6">
        <h2 id="contact-title" class="card-title text-xl font-semibold">ผู้ประสานงาน</h2>
        <div v-if="!canReadContacts" class="alert shadow-none"><span>บัญชีนี้ไม่มีสิทธิ์ดูข้อมูลผู้ประสานงาน</span></div>
        <div v-else-if="!contacts.length" class="alert shadow-none"><span>ไม่มีผู้ประสานงานที่ใช้งานอยู่</span></div>
        <ul v-else class="space-y-3">
          <li v-for="contact in contacts" :key="`${contact.name}-${contact.phone}`" class="rounded-box border border-base-300 p-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="text-lg font-semibold">{{ contact.name }} <span v-if="contact.isPrimary" class="badge badge-primary badge-sm align-middle">ผู้ติดต่อหลัก</span></p>
                <p class="text-sm text-base-content/80">{{ relationshipLabel(contact.relationship) || 'ไม่ระบุความสัมพันธ์' }} · <span class="font-mono">{{ formatThaiPhone(contact.phone) || 'ไม่มีหมายเลข' }}</span></p>
              </div>
              <a v-if="telHref(contact.phone)" class="btn btn-primary btn-lg min-h-12 w-full sm:w-auto" :href="telHref(contact.phone)" :aria-label="`โทรหา ${contact.name} ${formatThaiPhone(contact.phone)}`">โทร</a>
            </div>
          </li>
        </ul>
      </div>
    </section>

    <div class="grid gap-5 lg:grid-cols-2">
      <section class="card card-border bg-base-100 shadow-none" aria-labelledby="photo-title">
        <div class="card-body gap-3 p-5 sm:p-6">
          <h2 id="photo-title" class="card-title text-xl font-semibold">ภาพหลักฐาน</h2>
          <div v-if="!canReadPhotos" class="alert shadow-none"><span>บัญชีนี้ไม่มีสิทธิ์ดูรายการรูป</span></div>
          <div v-else-if="!vehicle.photos.length" class="alert shadow-none"><span>ไม่พบรูปที่ใช้งานอยู่</span></div>
          <template v-else>
            <p>มีภาพครบ {{ vehicle.photos.length }} ตำแหน่ง</p>
            <ul class="flex flex-wrap gap-2"><li v-for="photo in vehicle.photos" :key="photo.photoId" class="badge badge-ghost">{{ photoSlotLabel(photo.slot) }}</li></ul>
          </template>
        </div>
      </section>

      <section class="card card-border bg-base-100 shadow-none" aria-labelledby="history-title">
        <div class="card-body gap-3 p-5 sm:p-6">
          <h2 id="history-title" class="card-title text-xl font-semibold">ประวัติ</h2>
          <div v-if="!canReadHistory" class="alert shadow-none"><span>บัญชีนี้ไม่มีสิทธิ์ดูประวัติ</span></div>
          <div v-else-if="!result.history.length" class="alert shadow-none"><span>ยังไม่มีประวัติการเปลี่ยนแปลง</span></div>
          <ul v-else class="timeline timeline-vertical timeline-compact">
            <li v-for="(entry, index) in result.history" :key="entry.id">
              <hr v-if="index">
              <div class="timeline-middle"><span class="status status-neutral" aria-hidden="true"></span></div>
              <div class="timeline-end mb-5"><strong class="font-medium">{{ historyLabel(entry.action) }}</strong><p class="text-sm text-base-content/80">{{ thaiDateTime(entry.occurredAt) }}</p></div>
              <hr v-if="index < result.history.length - 1">
            </li>
          </ul>
        </div>
      </section>
    </div>

    <details class="collapse collapse-arrow border border-base-300 bg-base-100">
      <summary class="collapse-title font-medium">รายละเอียดสำหรับเจ้าหน้าที่สนับสนุน</summary>
      <div class="collapse-content text-sm">
        <dl class="grid gap-2 sm:grid-cols-2"><div><dt class="text-base-content/80">Request ID ค้นหา</dt><dd class="break-all font-mono">{{ result.requestIds.lookup || 'ไม่มี' }}</dd></div><div><dt class="text-base-content/80">Request ID ประวัติ</dt><dd class="break-all font-mono">{{ result.requestIds.history || 'ไม่ได้เรียก' }}</dd></div></dl>
      </div>
    </details>
  </div>
</template>
