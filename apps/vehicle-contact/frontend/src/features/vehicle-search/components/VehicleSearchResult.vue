<script setup>
import { computed } from 'vue'

const props = defineProps({
  result: { type: Object, required: true },
  canReadContacts: { type: Boolean, default: false },
  canReadPhotos: { type: Boolean, default: false },
  canReadHistory: { type: Boolean, default: false },
})

const vehicle = computed(() => props.result.vehicle)
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
  <div class="space-y-6">
    <section class="card card-border bg-base-100 shadow-none" aria-labelledby="vehicle-result-title">
      <div class="card-body gap-6 p-5 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-base-content/65">พบยานพาหนะ</p>
            <h2 id="vehicle-result-title" class="mt-1 text-3xl font-semibold">{{ vehicle.plate }}</h2>
            <p class="mt-1 text-base-content/70">จังหวัด {{ vehicle.province }}</p>
          </div>
          <span class="badge badge-success">สถานะใช้งาน</span>
        </div>
        <dl class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt class="text-sm text-base-content/60">ประเภทรถ</dt><dd class="mt-1 font-medium">{{ vehicle.vehicleType || 'ไม่ระบุ' }}</dd></div>
          <div><dt class="text-sm text-base-content/60">ยี่ห้อ</dt><dd class="mt-1 font-medium">{{ vehicle.brand || 'ไม่ระบุ' }}</dd></div>
          <div><dt class="text-sm text-base-content/60">รุ่น</dt><dd class="mt-1 font-medium">{{ vehicle.model || 'ไม่ระบุ' }}</dd></div>
          <div><dt class="text-sm text-base-content/60">สี</dt><dd class="mt-1 font-medium">{{ vehicle.color || 'ไม่ระบุ' }}</dd></div>
        </dl>
      </div>
    </section>

    <div class="grid gap-6 lg:grid-cols-2">
      <section class="card card-border bg-base-100 shadow-none" aria-labelledby="contact-title">
        <div class="card-body p-5 sm:p-6">
          <h2 id="contact-title" class="card-title text-xl font-medium">ผู้ประสานงาน</h2>
          <div v-if="!canReadContacts" class="alert mt-2 shadow-none"><span>เซสชันนี้ไม่มีสิทธิ์อ่านข้อมูลผู้ประสานงาน</span></div>
          <div v-else-if="!vehicle.contacts.length" class="alert mt-2 shadow-none"><span>ไม่มีผู้ประสานงานที่ใช้งานอยู่</span></div>
          <ul v-else class="list mt-2">
            <li v-for="contact in vehicle.contacts" :key="`${contact.name}-${contact.phone}`" class="list-row px-0">
              <div class="min-w-0 flex-1"><strong class="font-medium">{{ contact.name }}</strong><p class="text-sm text-base-content/65">{{ contact.relationship || 'ไม่ระบุความสัมพันธ์' }}</p></div>
              <span class="font-medium">{{ contact.phone || 'ไม่มีหมายเลข' }}</span>
            </li>
          </ul>
        </div>
      </section>

      <section class="card card-border bg-base-100 shadow-none" aria-labelledby="photo-title">
        <div class="card-body p-5 sm:p-6">
          <h2 id="photo-title" class="card-title text-xl font-medium">รูปประกอบยานพาหนะ</h2>
          <div v-if="!canReadPhotos" class="alert mt-2 shadow-none"><span>เซสชันนี้ไม่มีสิทธิ์อ่านรายการรูป</span></div>
          <div v-else-if="!vehicle.photos.length" class="alert mt-2 shadow-none"><span>ไม่พบรูปที่ใช้งานอยู่</span></div>
          <div v-else class="mt-2">
            <p>พบรูป {{ vehicle.photos.length }} รายการ</p>
            <div class="mt-3 flex flex-wrap gap-2"><span v-for="photo in vehicle.photos" :key="photo.photoId" class="badge badge-ghost">{{ photo.slot }}</span></div>
          </div>
        </div>
      </section>
    </div>

    <section class="card card-border bg-base-100 shadow-none" aria-labelledby="history-title">
      <div class="card-body p-5 sm:p-6">
        <h2 id="history-title" class="card-title text-xl font-medium">ประวัติยานพาหนะ</h2>
        <div v-if="!canReadHistory" class="alert mt-2 shadow-none"><span>เซสชันนี้ไม่มีสิทธิ์อ่านประวัติ</span></div>
        <div v-else-if="!result.history.length" class="alert mt-2 shadow-none"><span>ยังไม่มีประวัติการเปลี่ยนแปลง</span></div>
        <ul v-else class="timeline timeline-vertical timeline-compact mt-2">
          <li v-for="(entry, index) in result.history" :key="entry.id">
            <hr v-if="index">
            <div class="timeline-middle"><span class="status status-neutral" aria-hidden="true"></span></div>
            <div class="timeline-end mb-5"><strong class="font-medium">{{ historyLabel(entry.action) }}</strong><p class="text-sm text-base-content/65">{{ thaiDateTime(entry.occurredAt) }}</p></div>
            <hr v-if="index < result.history.length - 1">
          </li>
        </ul>
      </div>
    </section>

    <details class="collapse collapse-arrow border border-base-300 bg-base-100">
      <summary class="collapse-title font-medium">รายละเอียดสำหรับเจ้าหน้าที่สนับสนุน</summary>
      <div class="collapse-content text-sm">
        <dl class="grid gap-2 sm:grid-cols-2"><div><dt class="text-base-content/60">Request ID ค้นหา</dt><dd class="break-all font-mono">{{ result.requestIds.lookup || 'ไม่มี' }}</dd></div><div><dt class="text-base-content/60">Request ID ประวัติ</dt><dd class="break-all font-mono">{{ result.requestIds.history || 'ไม่ได้เรียก' }}</dd></div></dl>
      </div>
    </details>
  </div>
</template>
