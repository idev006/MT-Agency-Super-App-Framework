<script setup>
import { STICKER_CATEGORIES } from '../domain/reference/sticker-categories.js'
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
import { useRegistrationReferenceStore } from '../stores/registration-reference.js'
import { PROVINCES } from '../domain/reference/provinces.js'
import { formatThaiPhone, toE164 } from '../domain/reference/vehicle-presentation.js'

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
const vehicleForm = ref({ plate: '', province: '', plateType: '', vehicleType: '', brand: '', model: '', color: '', ownerUserId: '', stickerCategory: '' })
const contactForm = ref({ contactName: '', contactPhone: '' })
const photoFiles = ref({})
const confirmingCancel = ref(false)
// R7 (owner: "ใช้ tabs"): one task at a time instead of four long sections.
const mTab = ref('vehicle')
const mTabs = [['vehicle', 'ข้อมูลรถ'], ['contact', 'ผู้ประสานงาน'], ['photos', 'รูปประกอบ'], ['cancel', 'ยกเลิกรถ']]
// P1.4 (E2E 2026-11-24): codes were edited as free text and a save showed no confirmation.
const { lists } = storeToRefs(useRegistrationReferenceStore())
const listFor = (key) => (key === 'provinces' ? PROVINCES : (lists.value?.[key] || []))
const lastSaved = ref('')
const phoneError = ref('')
function withCurrent(key, current) {
  const options = listFor(key)
  return current && !options.some((o) => o.code === current) ? [{ code: current, label: `${current} (ค่าเดิม)` }, ...options] : options
}

function syncForms(vehicle) {
  if (!vehicle) return
  vehicleForm.value = {
    plate: vehicle.plate || '', province: vehicle.province || '', plateType: vehicle.plateType || '',
    vehicleType: vehicle.vehicleType || '', brand: vehicle.brand || '', model: vehicle.model || '',
    color: vehicle.color || '', ownerUserId: '', stickerCategory: vehicle.stickerCategory || '',
  }
  const primary = (vehicle.contacts || []).find((item) => item.isPrimary) || (vehicle.contacts || [])[0]
  contactForm.value = { contactName: primary?.name || '', contactPhone: formatThaiPhone(primary?.phone || '') }
}

watch(() => work.vehicle.value, syncForms)
onMounted(() => work.load(route.params.vehicleId))
watch(() => route.params.vehicleId, (id) => { if (route.name === 'vehicle-maintenance') work.load(id) })

function onPhotoFile(slot, event) {
  const file = event.target.files?.[0]
  photoFiles.value = { ...photoFiles.value, [slot]: file || null }
}

async function saveVehicle() { lastSaved.value = ''; if (await work.updateVehicle({ ...vehicleForm.value })) lastSaved.value = `บันทึกข้อมูลยานพาหนะแล้ว (เวอร์ชัน ${work.version.value})` }
async function saveContact() {
  lastSaved.value = ''
  const phone = toE164(contactForm.value.contactPhone)
  phoneError.value = phone ? '' : 'เบอร์โทรไม่ถูกต้อง กรอกเช่น 081-234-5678'
  if (!phone) return
  if (await work.updateContact({ contactName: contactForm.value.contactName, contactPhone: phone })) lastSaved.value = 'บันทึกผู้ประสานงานแล้ว'
}
async function replaceSlot(slot) {
  const file = photoFiles.value[slot]
  if (!file) return
  lastSaved.value = ''
  const ok = await work.replacePhoto({ slot, file })
  if (ok) { photoFiles.value = { ...photoFiles.value, [slot]: null }; lastSaved.value = `แทนที่รูป${slotLabels[slot]}แล้ว` }
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
        <div><h2 class="text-2xl font-semibold">{{ work.vehicle.value.plate }} · {{ PROVINCES.find((p) => p.code === work.vehicle.value.province)?.label || work.vehicle.value.province }}</h2><p class="text-sm text-base-content/80">เวอร์ชันข้อมูล <span class="badge badge-ghost font-mono">{{ work.version.value }}</span></p></div>
        <RouterLink class="btn btn-sm" :to="{ name: 'vehicle-detail', params: { vehicleId: work.vehicleId.value } }">ดูรายละเอียด</RouterLink>
      </div>

      <div v-if="work.cancelled.value" class="alert alert-success mb-5" role="status"><span>ยกเลิกยานพาหนะแล้ว ระบบสร้างงานเก็บรักษาข้อมูลตามนโยบาย และเพิกถอน QR ที่ใช้งานอยู่</span></div>
      <div v-if="work.actionPhase.value === 'success' && lastSaved" class="alert alert-success mb-5" role="status"><span>✓ {{ lastSaved }}</span></div>
      <div v-if="work.actionPhase.value === 'conflict'" class="alert alert-warning mb-5" role="alert"><span>ข้อมูลถูกแก้ไขโดยผู้อื่นระหว่างคุณกำลังแก้ไข ระบบโหลดค่าปัจจุบันและเวอร์ชันใหม่แล้ว กรุณาตรวจสอบค่าแล้วบันทึกอีกครั้ง</span></div>
      <div v-else-if="work.actionPhase.value === 'uncertain'" class="alert alert-warning mb-5" role="alert"><span>ไม่ทราบผลการบันทึกแน่ชัด ห้ามกดซ้ำ ให้โหลดข้อมูลใหม่และตรวจสถานะก่อน</span></div>
      <div v-else-if="work.actionPhase.value === 'error'" class="alert alert-error mb-5"><span>บันทึกไม่สำเร็จ ({{ work.failure.value?.code }})</span></div>

      <div role="tablist" class="tabs tabs-border mb-4 flex-nowrap overflow-x-auto" aria-label="แก้ไขยานพาหนะ">
        <button v-for="[id, label] in mTabs" :id="`mt-${id}`" :key="id" role="tab" type="button" class="tab min-h-11 whitespace-nowrap" :class="{ 'tab-active': mTab === id, 'text-error': id === 'cancel' }" :aria-selected="mTab === id" :aria-controls="`mp-${id}`" @click="mTab = id">{{ label }}</button>
      </div>
      <div class="grid gap-5">
        <fieldset v-show="mTab === 'vehicle'" id="mp-vehicle" role="tabpanel" aria-labelledby="mt-vehicle" class="fieldset rounded-box border border-base-300 bg-base-100 p-5">
          <legend class="fieldset-legend text-lg font-semibold">ข้อมูลยานพาหนะ</legend>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="field-stack"><span class="label-text font-semibold">เลขทะเบียน</span><input v-model.trim="vehicleForm.plate" class="input input-bordered w-full" maxlength="24" /></label>
            <label class="field-stack"><span class="label-text font-semibold">จังหวัดของทะเบียน</span><select v-model="vehicleForm.province" class="select select-bordered w-full"><option v-for="o in withCurrent('provinces', vehicleForm.province)" :key="o.code" :value="o.code">{{ o.label }}</option></select></label>
            <label class="field-stack"><span class="label-text font-semibold">ประเภทป้าย</span><select v-if="listFor('plateTypes').length" v-model="vehicleForm.plateType" class="select select-bordered w-full"><option value="">ไม่เปลี่ยน</option><option v-for="o in withCurrent('plateTypes', vehicleForm.plateType)" :key="o.code" :value="o.code">{{ o.label }}</option></select><input v-else v-model.trim="vehicleForm.plateType" class="input input-bordered w-full" maxlength="100" /></label>
            <label class="field-stack"><span class="label-text font-semibold">ประเภทยานพาหนะ</span><select v-if="listFor('vehicleTypes').length" v-model="vehicleForm.vehicleType" class="select select-bordered w-full"><option v-for="o in withCurrent('vehicleTypes', vehicleForm.vehicleType)" :key="o.code" :value="o.code">{{ o.label }}</option></select><input v-else v-model.trim="vehicleForm.vehicleType" class="input input-bordered w-full" maxlength="100" /></label>
            <label class="field-stack"><span class="label-text font-semibold">ยี่ห้อ</span><input v-model.trim="vehicleForm.brand" class="input input-bordered w-full" maxlength="100" /></label>
            <label class="field-stack"><span class="label-text font-semibold">รุ่น</span><input v-model.trim="vehicleForm.model" class="input input-bordered w-full" maxlength="100" /></label>
            <label class="field-stack"><span class="label-text font-semibold">สี</span><select v-if="listFor('colors').length" v-model="vehicleForm.color" class="select select-bordered w-full"><option v-for="o in withCurrent('colors', vehicleForm.color)" :key="o.code" :value="o.code">{{ o.label }}</option></select><input v-else v-model.trim="vehicleForm.color" class="input input-bordered w-full" maxlength="100" /></label>
            <label class="field-stack"><span class="label-text font-semibold">ประเภทสติกเกอร์ (สี / ขนาด)</span><select v-model="vehicleForm.stickerCategory" class="select select-bordered w-full" data-sticker-category><option value="" disabled>เลือกประเภทผู้ใช้รถ</option><option v-for="(c, code) in STICKER_CATEGORIES" :key="code" :value="code">{{ c.colour }} — {{ c.label }} ({{ c.size }} × {{ c.size }} ซม.)</option></select><span class="text-sm text-base-content/80">สีช่วยจำแนกเท่านั้น ไม่ใช่สิทธิ์ผ่านประตูหรือที่จอด</span></label>
            <label class="field-stack"><span class="label-text font-semibold">รหัสเจ้าของ (เปลี่ยนผู้ถือครอง)</span><input v-model.trim="vehicleForm.ownerUserId" class="input input-bordered w-full font-mono" maxlength="80" placeholder="เว้นว่างถ้าไม่เปลี่ยนเจ้าของ" /></label>
          </div>
          <div class="mt-4 flex justify-end"><button class="btn btn-primary" type="button" :disabled="work.actionPhase.value === 'submitting'" @click="saveVehicle"><span v-if="work.actionPhase.value === 'submitting'" class="loading loading-spinner loading-xs"></span>บันทึกข้อมูลยานพาหนะ</button></div>
        </fieldset>

        <fieldset v-show="mTab === 'contact'" id="mp-contact" role="tabpanel" aria-labelledby="mt-contact" class="fieldset rounded-box border border-base-300 bg-base-100 p-5">
          <legend class="fieldset-legend text-lg font-semibold">ผู้ประสานงานหลัก</legend>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="field-stack"><span class="label-text font-semibold">ชื่อผู้ประสานงาน</span><input v-model.trim="contactForm.contactName" class="input input-bordered w-full" maxlength="100" /></label>
            <label class="field-stack"><span class="label-text font-semibold">เบอร์โทร</span><input v-model.trim="contactForm.contactPhone" class="input input-bordered w-full" maxlength="20" inputmode="tel" placeholder="081-234-5678" /><span v-if="phoneError" class="text-sm font-medium" role="alert">⚠ {{ phoneError }}</span></label>
          </div>
          <div class="mt-4 flex justify-end"><button class="btn btn-primary" type="button" :disabled="work.actionPhase.value === 'submitting'" @click="saveContact">บันทึกผู้ประสานงาน</button></div>
        </fieldset>

        <fieldset v-show="mTab === 'photos'" id="mp-photos" role="tabpanel" aria-labelledby="mt-photos" class="fieldset rounded-box border border-base-300 bg-base-100 p-5">
          <legend class="fieldset-legend text-lg font-semibold">เปลี่ยนรูปประกอบ</legend>
          <p class="mb-3 text-sm text-base-content/80">แต่ละตำแหน่งต้องมีรูปที่ใช้งานอยู่เดิม 1 รูป ระบบจะแทนที่รูปเดิมและบันทึก audit (JPEG/PNG/WebP ไม่เกิน 5MB)</p>
          <ul class="grid gap-3 sm:grid-cols-2">
            <li v-for="slot in slots" :key="slot" class="rounded-box border border-base-300 p-3">
              <span class="label-text font-semibold">{{ slotLabels[slot] }}</span>
              <input class="file-input file-input-bordered mt-2 w-full" type="file" accept="image/jpeg,image/png,image/webp" :aria-label="`เลือกรูป${slotLabels[slot]}`" @change="onPhotoFile(slot, $event)" />
              <button class="btn btn-sm mt-2" type="button" :disabled="!photoFiles[slot] || work.actionPhase.value === 'submitting'" @click="replaceSlot(slot)">แทนที่รูป</button>
            </li>
          </ul>
        </fieldset>

        <fieldset v-show="mTab === 'cancel'" id="mp-cancel" role="tabpanel" aria-labelledby="mt-cancel" class="fieldset rounded-box border border-error/40 bg-base-100 p-5">
          <legend class="fieldset-legend text-lg font-semibold text-error">ยกเลิกยานพาหนะ</legend>
          <p class="text-sm text-base-content/80">การยกเลิกจะปิดใช้งานยานพาหนะ เพิกถอน QR ที่ใช้งานอยู่ และสร้างงานเก็บรักษาข้อมูลตามนโยบาย การดำเนินการนี้ไม่สามารถย้อนกลับจากหน้าจอนี้ได้</p>
          <div class="mt-4 flex justify-end"><button class="btn btn-error" type="button" :disabled="work.cancelled.value || work.actionPhase.value === 'submitting'" @click="confirmingCancel = true">ยกเลิกยานพาหนะ</button></div>
        </fieldset>
      </div>
    </template>

  </PageTemplateComponent>

  <ConfirmDialog :open="confirmingCancel" title="ยกเลิกยานพาหนะหรือไม่" message="ระบบจะปิดใช้งานยานพาหนะ เพิกถอน QR และสร้างงานเก็บรักษาข้อมูลตามนโยบาย ยืนยันเฉพาะเมื่อได้รับอนุญาตให้ดำเนินการ" confirm-label="ยืนยันยกเลิกยานพาหนะ" cancel-label="ไม่ใช่ กลับไป" :busy="work.actionPhase.value === 'submitting'" @cancel="confirmingCancel = false" @confirm="confirmCancel" />
</template>