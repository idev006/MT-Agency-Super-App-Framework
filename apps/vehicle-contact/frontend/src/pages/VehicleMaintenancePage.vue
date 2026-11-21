<script setup>
import { inject, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { vehicleMaintenanceRepositoryKey } from '../application/vehicles/vehicle-maintenance-port.js'
import { vehicleDetailRepositoryKey } from '../application/vehicles/vehicle-detail-port.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import { useVehicleMaintenance } from '../features/vehicle-maintenance/useVehicleMaintenance.js'
import { useSessionStore } from '../stores/session.js'

const route = useRoute()
const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const work = useVehicleMaintenance({
  repository: inject(vehicleMaintenanceRepositoryKey),
  detailRepository: inject(vehicleDetailRepositoryKey),
  permissions,
})

const slotLabels = { FRONT: 'ด้านหน้า', REAR: 'ด้านหลัง', LEFT: 'ด้านซ้าย', RIGHT: 'ด้านขวา', FRONT_ANGLE: 'มุมเฉียงหน้า' }
const slots = Object.keys(slotLabels)
const vehicleForm = ref({ plate: '', province: '', plateType: '', vehicleType: '', brand: '', model: '', color: '', ownerUserId: '' })
const contactForm = ref({ contactName: '', contactPhone: '' })
const photoFiles = ref({})
const confirmingCancel = ref(false)

function syncForms(vehicle) {
  if (!vehicle) return
  vehicleForm.value = {
    plate: vehicle.plate || '', province: vehicle.province || '', plateType: vehicle.plateType || '',
    vehicleType: vehicle.vehicleType || '', brand: vehicle.brand || '', model: vehicle.model || '',
    color: vehicle.color || '', ownerUserId: '',
  }
  const primary = (vehicle.contacts || []).find((item) => item.isPrimary) || (vehicle.contacts || [])[0]
  contactForm.value = { contactName: primary?.name || '', contactPhone: primary?.phone || '' }
}

watch(() => work.vehicle.value, syncForms)
onMounted(() => work.load(route.params.vehicleId))
watch(() => route.params.vehicleId, (id) => { if (route.name === 'vehicle-maintenance') work.load(id) })

function onPhotoFile(slot, event) {
  const file = event.target.files?.[0]
  photoFiles.value = { ...photoFiles.value, [slot]: file || null }
}

async function saveVehicle() { await work.updateVehicle({ ...vehicleForm.value }) }
async function saveContact() { await work.updateContact({ ...contactForm.value }) }
async function replaceSlot(slot) {
  const file = photoFiles.value[slot]
  if (!file) return
  const ok = await work.replacePhoto({ slot, file })
  if (ok) photoFiles.value = { ...photoFiles.value, [slot]: null }
}
async function confirmCancel() {
  confirmingCancel.value = false
  await work.cancelVehicle()
}
</script>

<template>
  <PageTemplateComponent eyebrow="งานบำรุงรักษา" title="แก้ไขข้อมูลยานพาหนะ" description="ปรับปรุงข้อมูลยานพาหนะ ผู้ประสานงานหลัก และรูปประกอบ หรือยกเลิกยานพาหนะภายใต้สิทธิ์ที่กำหนด">
    <template #breadcrumbs><span class="text-base-content"><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span aria-hidden="true"> / </span><RouterLink class="link" :to="{ name: 'vehicle-search' }">ค้นหายานพาหนะ</RouterLink><span aria-hidden="true"> / </span><span aria-current="page">แก้ไขข้อมูล</span></span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>

    <div v-if="work.phase.value === 'loading'" class="flex min-h-32 items-center justify-center" role="status"><span class="loading loading-spinner"></span><span class="sr-only">กำลังโหลดข้อมูล</span></div>
    <div v-else-if="work.phase.value === 'forbidden'" class="alert alert-warning">เซสชันนี้ไม่มีสิทธิ์แก้ไขข้อมูลยานพาหนะ</div>
    <div v-else-if="work.phase.value === 'unauthenticated'" class="alert alert-warning">เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง</div>
    <div v-else-if="work.phase.value === 'empty'" class="alert alert-info">ไม่พบยานพาหนะที่ใช้งานอยู่ตามรหัสนี้</div>
    <div v-else-if="work.phase.value === 'error'" class="alert alert-error"><span>โหลดข้อมูลไม่สำเร็จ ({{ work.failure.value?.code }})</span><button class="btn btn-sm" type="button" @click="work.retry">ลองอีกครั้ง</button></div>

    <template v-else-if="work.vehicle.value">
      <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><h2 class="text-2xl font-semibold">{{ work.vehicle.value.plate }} · {{ work.vehicle.value.province }}</h2><p class="text-sm text-base-content/60">เวอร์ชันข้อมูล <span class="badge badge-ghost font-mono">{{ work.version.value }}</span></p></div>
        <RouterLink class="btn btn-sm" :to="{ name: 'vehicle-detail', params: { vehicleId: work.vehicleId.value } }">ดูรายละเอียด</RouterLink>
      </div>

      <div v-if="work.cancelled.value" class="alert alert-success mb-5" role="status"><span>ยกเลิกยานพาหนะแล้ว ระบบสร้างงานเก็บรักษาข้อมูลตามนโยบาย และเพิกถอน QR ที่ใช้งานอยู่</span></div>
      <div v-if="work.actionPhase.value === 'conflict'" class="alert alert-warning mb-5" role="alert"><span>ข้อมูลถูกแก้ไขโดยผู้อื่นระหว่างคุณกำลังแก้ไข ระบบโหลดค่าปัจจุบันและเวอร์ชันใหม่แล้ว กรุณาตรวจสอบค่าแล้วบันทึกอีกครั้ง</span></div>
      <div v-else-if="work.actionPhase.value === 'uncertain'" class="alert alert-warning mb-5" role="alert"><span>ไม่ทราบผลการบันทึกแน่ชัด ห้ามกดซ้ำ ให้โหลดข้อมูลใหม่และตรวจสถานะก่อน</span></div>
      <div v-else-if="work.actionPhase.value === 'error'" class="alert alert-error mb-5"><span>บันทึกไม่สำเร็จ ({{ work.failure.value?.code }})</span></div>

      <div class="grid gap-5">
        <fieldset class="fieldset rounded-box border border-base-300 bg-base-100 p-5">
          <legend class="fieldset-legend text-lg font-semibold">ข้อมูลยานพาหนะ</legend>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="field-stack"><span class="label-text font-semibold">เลขทะเบียน</span><input v-model.trim="vehicleForm.plate" class="input input-bordered w-full" maxlength="24" /></label>
            <label class="field-stack"><span class="label-text font-semibold">จังหวัดของทะเบียน</span><input v-model.trim="vehicleForm.province" class="input input-bordered w-full" maxlength="32" /></label>
            <label class="field-stack"><span class="label-text font-semibold">ประเภทป้าย</span><input v-model.trim="vehicleForm.plateType" class="input input-bordered w-full" maxlength="100" /></label>
            <label class="field-stack"><span class="label-text font-semibold">ประเภทยานพาหนะ</span><input v-model.trim="vehicleForm.vehicleType" class="input input-bordered w-full" maxlength="100" /></label>
            <label class="field-stack"><span class="label-text font-semibold">ยี่ห้อ</span><input v-model.trim="vehicleForm.brand" class="input input-bordered w-full" maxlength="100" /></label>
            <label class="field-stack"><span class="label-text font-semibold">รุ่น</span><input v-model.trim="vehicleForm.model" class="input input-bordered w-full" maxlength="100" /></label>
            <label class="field-stack"><span class="label-text font-semibold">สี</span><input v-model.trim="vehicleForm.color" class="input input-bordered w-full" maxlength="100" /></label>
            <label class="field-stack"><span class="label-text font-semibold">รหัสเจ้าของ (เปลี่ยนผู้ถือครอง)</span><input v-model.trim="vehicleForm.ownerUserId" class="input input-bordered w-full font-mono" maxlength="80" placeholder="เว้นว่างถ้าไม่เปลี่ยนเจ้าของ" /></label>
          </div>
          <div class="mt-4 flex justify-end"><button class="btn btn-primary" type="button" :disabled="work.actionPhase.value === 'submitting'" @click="saveVehicle"><span v-if="work.actionPhase.value === 'submitting'" class="loading loading-spinner loading-xs"></span>บันทึกข้อมูลยานพาหนะ</button></div>
        </fieldset>

        <fieldset class="fieldset rounded-box border border-base-300 bg-base-100 p-5">
          <legend class="fieldset-legend text-lg font-semibold">ผู้ประสานงานหลัก</legend>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="field-stack"><span class="label-text font-semibold">ชื่อผู้ประสานงาน</span><input v-model.trim="contactForm.contactName" class="input input-bordered w-full" maxlength="100" /></label>
            <label class="field-stack"><span class="label-text font-semibold">เบอร์โทร</span><input v-model.trim="contactForm.contactPhone" class="input input-bordered w-full" maxlength="20" inputmode="tel" placeholder="+66..." /></label>
          </div>
          <div class="mt-4 flex justify-end"><button class="btn btn-primary" type="button" :disabled="work.actionPhase.value === 'submitting'" @click="saveContact">บันทึกผู้ประสานงาน</button></div>
        </fieldset>

        <fieldset class="fieldset rounded-box border border-base-300 bg-base-100 p-5">
          <legend class="fieldset-legend text-lg font-semibold">เปลี่ยนรูปประกอบ</legend>
          <p class="mb-3 text-sm text-base-content/65">แต่ละตำแหน่งต้องมีรูปที่ใช้งานอยู่เดิม 1 รูป ระบบจะแทนที่รูปเดิมและบันทึก audit (JPEG/PNG/WebP ไม่เกิน 5MB)</p>
          <ul class="grid gap-3 sm:grid-cols-2">
            <li v-for="slot in slots" :key="slot" class="rounded-box border border-base-300 p-3">
              <span class="label-text font-semibold">{{ slotLabels[slot] }}</span>
              <input class="file-input file-input-bordered mt-2 w-full" type="file" accept="image/jpeg,image/png,image/webp" :aria-label="`เลือกรูป${slotLabels[slot]}`" @change="onPhotoFile(slot, $event)" />
              <button class="btn btn-sm mt-2" type="button" :disabled="!photoFiles[slot] || work.actionPhase.value === 'submitting'" @click="replaceSlot(slot)">แทนที่รูป</button>
            </li>
          </ul>
        </fieldset>

        <fieldset class="fieldset rounded-box border border-error/40 bg-base-100 p-5">
          <legend class="fieldset-legend text-lg font-semibold text-error">ยกเลิกยานพาหนะ</legend>
          <p class="text-sm text-base-content/70">การยกเลิกจะปิดใช้งานยานพาหนะ เพิกถอน QR ที่ใช้งานอยู่ และสร้างงานเก็บรักษาข้อมูลตามนโยบาย การดำเนินการนี้ไม่สามารถย้อนกลับจากหน้าจอนี้ได้</p>
          <div class="mt-4 flex justify-end"><button class="btn btn-error" type="button" :disabled="work.cancelled.value || work.actionPhase.value === 'submitting'" @click="confirmingCancel = true">ยกเลิกยานพาหนะ</button></div>
        </fieldset>
      </div>
    </template>

    <template #footer><p class="text-sm text-base-content/70">สิทธิ์บนหน้าจอช่วยนำทางเท่านั้น GAS จะตรวจสิทธิ์ เวอร์ชันข้อมูล และสถานะอีกครั้งก่อนบันทึกทุกครั้ง</p></template>
  </PageTemplateComponent>

  <ConfirmDialog :open="confirmingCancel" title="ยกเลิกยานพาหนะหรือไม่" message="ระบบจะปิดใช้งานยานพาหนะ เพิกถอน QR และสร้างงานเก็บรักษาข้อมูลตามนโยบาย ยืนยันเฉพาะเมื่อได้รับอนุญาตให้ดำเนินการ" confirm-label="ยืนยันการยกเลิก" :busy="work.actionPhase.value === 'submitting'" @cancel="confirmingCancel = false" @confirm="confirmCancel" />
</template>