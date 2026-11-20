<script setup>
import { computed, inject, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { registrationIntakeRepositoryKey } from '../application/registrations/registration-intake-port.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import SearchableReferenceCombobox from '../features/reference-data/components/SearchableReferenceCombobox.vue'
import { CUSTOM_BRAND_CHOICE, reconcileBrandValue, resolveBrandValue } from '../features/registrations/brand-field.js'
import { CUSTOM_COLOR_CHOICE, reconcileColorValue, resolveColorValue } from '../features/registrations/color-field.js'
import { REGISTRATION_PHOTO_SLOTS, useRegistrationIntake } from '../features/registrations/useRegistrationIntake.js'
import { useRegistrationReferenceStore } from '../stores/registration-reference.js'
import { useSessionStore } from '../stores/session.js'

const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const referenceData = useRegistrationReferenceStore()
const { phase: referencePhase, failure: referenceFailure, lists, organizations, mode: referenceMode, version: referenceVersion } = storeToRefs(referenceData)
const work = useRegistrationIntake({ repository: inject(registrationIntakeRepositoryKey), permissions })
const campaignToken = ref('')
const confirmationOpen = ref(false)
const brandChoice = ref('')
const customBrand = ref('')
const colorChoice = ref('')
const customColor = ref('')
const files = reactive({})
const fields = reactive({ plate: '', province: '', plateType: '', vehicleType: '', brand: '', model: '', color: '', organizationId: '', relationship: '', contactName: '', contactPhone: '' })
const allPhotosReady = computed(() => REGISTRATION_PHOTO_SLOTS.every((slot) => files[slot.id] instanceof File))
const busy = computed(() => ['validating', 'uploading', 'submitting'].includes(work.phase.value))
const canonicalMode = computed(() => ['ADVISORY', 'ENFORCED'].includes(referenceMode.value))

function selectFile(slot, event) { files[slot] = event.target.files?.[0] || null }
async function confirmSubmit() {
  confirmationOpen.value = false
  const reference = canonicalMode.value ? { referenceVersion: referenceVersion.value } : {}
  await work.submit({ campaignToken: campaignToken.value.trim(), fields: { ...fields, ...reference }, files })
}
function reconcileSelections() {
  const allowed = (key, value) => !value || lists.value[key].some(({ code }) => code === value)
  for (const [field, key] of [['province', 'provinces'], ['plateType', 'plateTypes'], ['vehicleType', 'vehicleTypes'], ['relationship', 'relationships']]) {
    if (!allowed(key, fields[field])) fields[field] = ''
  }
  const brand = reconcileBrandValue(fields.brand, lists.value.brands)
  brandChoice.value = brand.choice
  customBrand.value = brand.customValue
  const color = reconcileColorValue(fields.color, lists.value.colors)
  colorChoice.value = color.choice
  customColor.value = color.customValue
  if (fields.organizationId && !organizations.value.some(({ code }) => code === fields.organizationId)) fields.organizationId = ''
}
async function reloadReferences() { try { await referenceData.reload(); reconcileSelections() } catch {} }
function toggleCustomBrand() {
  brandChoice.value = brandChoice.value === CUSTOM_BRAND_CHOICE ? '' : CUSTOM_BRAND_CHOICE
}
watch(brandChoice, (value) => {
  if (value !== CUSTOM_BRAND_CHOICE) customBrand.value = ''
  fields.brand = resolveBrandValue(value, customBrand.value)
})
watch(customBrand, (value) => { if (brandChoice.value === CUSTOM_BRAND_CHOICE) fields.brand = resolveBrandValue(brandChoice.value, value) })
watch(colorChoice, (value) => {
  if (value !== CUSTOM_COLOR_CHOICE) customColor.value = ''
  fields.color = resolveColorValue(value, customColor.value)
})
watch(customColor, (value) => { if (colorChoice.value === CUSTOM_COLOR_CHOICE) fields.color = resolveColorValue(colorChoice.value, value) })
watch(referenceVersion, reconcileSelections)
</script>

<template>
  <PageTemplateComponent eyebrow="งานรับคำขอ" title="รับลงทะเบียนยานพาหนะ" description="บันทึกข้อมูลผู้ขอลงทะเบียน ยานพาหนะ และภาพหลักฐานให้ครบ ก่อนส่งเข้าคิวตรวจสอบ">
    <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span> / รับลงทะเบียนยานพาหนะ</span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>

    <div v-if="!work.canReceive.value" class="alert alert-warning">เซสชันนี้ไม่มีสิทธิ์รับลงทะเบียนยานพาหนะ</div>
    <div v-else-if="referencePhase === 'idle' || referencePhase === 'loading'" class="alert alert-info" role="status"><span class="loading loading-spinner loading-sm"></span><span>กำลังโหลดรายการสำหรับรับลงทะเบียน</span></div>
    <div v-else-if="referencePhase === 'error'" class="alert alert-error" role="alert"><div><p class="font-semibold">โหลดรายการสำหรับรับลงทะเบียนไม่สำเร็จ</p><p class="text-sm">รหัสข้อผิดพลาด {{ referenceFailure?.code || 'REFERENCE_DATA_UNAVAILABLE' }}</p></div><button class="btn btn-sm" type="button" @click="reloadReferences">ลองอีกครั้ง</button></div>
    <div v-else-if="work.phase.value === 'success'" class="card card-border bg-base-100"><div class="card-body"><span class="badge badge-success">ส่งคำขอแล้ว</span><h2 class="card-title text-2xl">คำขอเข้าสู่คิวตรวจสอบ</h2><p>รหัสคำขอ <strong class="break-all">{{ work.result.value.requestId }}</strong></p><p class="text-sm text-base-content/70">รหัสยานพาหนะ {{ work.result.value.vehicleId }}</p><div class="card-actions mt-3"><button class="btn btn-primary" type="button" @click="work.reset">รับลงทะเบียนรายการถัดไป</button><RouterLink class="btn" :to="{ name: 'registration-review' }">เปิดคิวตรวจสอบ</RouterLink></div></div></div>

    <form v-else class="space-y-6" @submit.prevent="confirmationOpen = true">
      <div v-if="referenceMode === 'LEGACY'" class="alert alert-warning" role="status"><div><p class="font-semibold">ยังไม่ได้เปิดใช้รายการข้อมูลกลาง</p><p class="text-sm">ระบบใช้ช่องกรอกแบบเดิมชั่วคราวและจะไม่ส่ง reference version จนกว่าข้อมูลกลางจะพร้อม</p></div></div>
      <div v-else class="alert border-base-300 bg-base-100" role="status"><div><p class="font-semibold">รายการข้อมูลกลางพร้อมใช้ <span class="badge ml-2">{{ referenceMode }}</span></p><p class="font-mono text-xs text-base-content/60">Reference {{ referenceVersion.slice(0, 12) }}</p></div><button class="btn btn-ghost btn-sm" type="button" @click="reloadReferences">โหลดใหม่</button></div>
      <fieldset class="fieldset rounded-box border border-base-300 bg-base-100 p-5 sm:p-6">
        <legend class="fieldset-legend text-lg font-semibold">1. แคมเปญรับลงทะเบียน</legend>
        <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label class="field-stack"><span class="label-text font-semibold">Campaign token</span><input v-model.trim="campaignToken" class="input input-bordered w-full font-mono" type="password" autocomplete="off" required minlength="64" maxlength="64" placeholder="กรอก token ที่ได้รับอนุญาต" /><span class="label-text-alt">ใช้เพื่อตรวจสอบแคมเปญเท่านั้น ระบบไม่บันทึก token ใน browser</span></label>
          <button class="btn min-h-11" type="button" :disabled="busy || campaignToken.length !== 64" @click="work.validateCampaign(campaignToken)"><span v-if="work.phase.value === 'validating'" class="loading loading-spinner loading-sm"></span>ตรวจสอบแคมเปญ</button>
        </div>
        <div v-if="work.campaign.value?.valid" class="alert alert-success mt-3">แคมเปญพร้อมรับคำขอ</div>
      </fieldset>

      <fieldset class="fieldset rounded-box border border-base-300 bg-base-100 p-5 sm:p-6">
        <legend class="fieldset-legend text-lg font-semibold">2. ข้อมูลยานพาหนะ</legend>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <label class="field-stack"><span class="label-text font-semibold">เลขทะเบียน</span><input v-model.trim="fields.plate" class="input input-bordered w-full" required maxlength="24" /></label>
          <label class="field-stack"><span class="label-text font-semibold">จังหวัดของทะเบียน</span><select v-if="canonicalMode" v-model="fields.province" class="select select-bordered w-full" required><option disabled value="">เลือกจังหวัด</option><option v-for="item in lists.provinces" :key="item.code" :value="item.code">{{ item.label }}</option></select><input v-else v-model.trim="fields.province" class="input input-bordered w-full" required maxlength="32" /></label>
          <label class="field-stack"><span class="label-text font-semibold">ประเภทป้าย</span><select v-if="canonicalMode" v-model="fields.plateType" class="select select-bordered w-full" required><option disabled value="">เลือกประเภทป้าย</option><option v-for="item in lists.plateTypes" :key="item.code" :value="item.code">{{ item.label }}</option></select><input v-else v-model.trim="fields.plateType" class="input input-bordered w-full" required maxlength="100" /></label>
          <label class="field-stack"><span class="label-text font-semibold">ประเภทยานพาหนะ</span><select v-if="canonicalMode" v-model="fields.vehicleType" class="select select-bordered w-full" required><option disabled value="">เลือกประเภทยานพาหนะ</option><option v-for="item in lists.vehicleTypes" :key="item.code" :value="item.code">{{ item.label }}</option></select><input v-else v-model.trim="fields.vehicleType" class="input input-bordered w-full" required maxlength="100" /></label>
          <div class="field-stack"><span class="label-text font-semibold">ยี่ห้อ</span><template v-if="canonicalMode && lists.brands.length"><SearchableReferenceCombobox v-if="brandChoice !== CUSTOM_BRAND_CHOICE" v-model="brandChoice" label="ยี่ห้อ" :options="lists.brands" required /><input v-else v-model.trim="customBrand" class="input input-bordered w-full" required maxlength="100" aria-label="ระบุยี่ห้อยานพาหนะ" placeholder="ระบุยี่ห้อตามสมุดคู่มือจดทะเบียน" /><button class="btn btn-ghost btn-sm self-start" type="button" @click="toggleCustomBrand">{{ brandChoice === CUSTOM_BRAND_CHOICE ? 'เลือกจากรายการยี่ห้อ' : 'ไม่พบยี่ห้อ? ระบุเอง' }}</button></template><input v-else v-model.trim="fields.brand" class="input input-bordered w-full" required maxlength="100" aria-label="ยี่ห้อยานพาหนะ" /><span class="label-text-alt">ค้นหายี่ห้อจากรายการ หรือระบุเองหากไม่พบ</span></div>
          <label class="field-stack"><span class="label-text font-semibold">รุ่น</span><input v-model.trim="fields.model" class="input input-bordered w-full" required maxlength="100" placeholder="กรอกรุ่นตามสมุดคู่มือจดทะเบียน" /><span class="label-text-alt">กรอกชื่อรุ่นเองเพื่อรองรับรถทุกรุ่น</span></label>
          <label class="field-stack"><span class="label-text font-semibold">สี</span><select v-if="canonicalMode && lists.colors.length" v-model="colorChoice" class="select select-bordered w-full" required aria-describedby="vehicle-color-help"><option disabled value="">เลือกสี</option><option v-for="item in lists.colors" :key="item.code" :value="item.code">{{ item.label }}</option><option :value="CUSTOM_COLOR_CHOICE">สีอื่น — ระบุเอง</option></select><input v-if="canonicalMode && lists.colors.length && colorChoice === CUSTOM_COLOR_CHOICE" v-model.trim="customColor" class="input input-bordered w-full" required maxlength="100" aria-label="ระบุสีรถ" placeholder="ระบุสีตามสมุดคู่มือจดทะเบียน" /><input v-else-if="!canonicalMode || !lists.colors.length" v-model.trim="fields.color" class="input input-bordered w-full" required maxlength="100" /><span id="vehicle-color-help" class="label-text-alt">เลือกสีตั้งต้น หรือเลือกสีอื่นเพื่อกรอกเอง</span></label>
          <label class="field-stack"><span class="label-text font-semibold">หน่วยงาน</span><SearchableReferenceCombobox v-if="canonicalMode" v-model="fields.organizationId" label="หน่วยงาน" :options="organizations" required /><input v-else v-model.trim="fields.organizationId" class="input input-bordered w-full" required maxlength="100" /></label>
        </div>
      </fieldset>

      <fieldset class="fieldset rounded-box border border-base-300 bg-base-100 p-5 sm:p-6">
        <legend class="fieldset-legend text-lg font-semibold">3. ผู้ประสานงาน</legend>
        <div class="grid gap-4 sm:grid-cols-3">
          <label class="field-stack"><span class="label-text font-semibold">ชื่อผู้ประสานงาน</span><input v-model.trim="fields.contactName" class="input input-bordered w-full" required maxlength="200" /></label>
          <label class="field-stack"><span class="label-text font-semibold">โทรศัพท์รูปแบบสากล</span><input v-model.trim="fields.contactPhone" class="input input-bordered w-full" type="tel" required pattern="\+[1-9][0-9]{6,14}" placeholder="+66812345678" /></label>
          <label class="field-stack"><span class="label-text font-semibold">ความสัมพันธ์กับรถ</span><select v-if="canonicalMode" v-model="fields.relationship" class="select select-bordered w-full" required><option disabled value="">เลือกความสัมพันธ์</option><option v-for="item in lists.relationships" :key="item.code" :value="item.code">{{ item.label }}</option></select><input v-else v-model.trim="fields.relationship" class="input input-bordered w-full" required maxlength="100" /></label>
        </div>
      </fieldset>

      <fieldset class="fieldset rounded-box border border-base-300 bg-base-100 p-5 sm:p-6">
        <legend class="fieldset-legend text-lg font-semibold">4. ภาพหลักฐาน 5 ตำแหน่ง</legend>
        <p class="mb-3 text-sm leading-6 text-base-content/70">รองรับ JPEG, PNG หรือ WebP ไม่เกิน 5 MB ต่อภาพ บนอุปกรณ์มือถือสามารถเลือกถ่ายภาพจากกล้องได้</p>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <label v-for="slot in REGISTRATION_PHOTO_SLOTS" :key="slot.id" class="field-stack rounded-box border border-base-300 p-4"><span class="label-text font-semibold">{{ slot.label }}</span><input class="file-input file-input-bordered w-full" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required @change="selectFile(slot.id, $event)" /><span class="label-text-alt truncate">{{ files[slot.id]?.name || 'ยังไม่ได้เลือกภาพ' }}</span></label>
        </div>
      </fieldset>

      <div v-if="work.phase.value === 'uploading'" class="alert alert-info" role="status"><span class="loading loading-spinner loading-sm"></span><span>กำลังอัปโหลดภาพ {{ Object.keys(work.uploaded.value).length }} / 5</span></div>
      <div v-else-if="work.phase.value === 'submitting'" class="alert alert-info" role="status"><span class="loading loading-spinner loading-sm"></span><span>กำลังส่งคำขอลงทะเบียน</span></div>
      <div v-else-if="work.phase.value === 'uncertain'" class="alert alert-warning">ไม่ทราบผลแน่ชัด ห้ามส่งซ้ำทันที ให้จด Request ID และตรวจสอบกับเจ้าหน้าที่สนับสนุน</div>
      <div v-else-if="work.phase.value === 'error' && work.failure.value?.code === 'REFERENCE_VERSION_STALE'" class="alert alert-warning"><div><p class="font-semibold">รายการข้อมูลกลางมีการปรับปรุง</p><p class="text-sm">โหลดรายการใหม่ ตรวจสอบค่าที่เลือก แล้วกดส่งคำขออีกครั้ง ระบบจะไม่ส่งซ้ำอัตโนมัติ</p></div><button class="btn btn-sm" type="button" @click="reloadReferences">โหลดรายการใหม่</button></div>
      <div v-else-if="work.phase.value === 'error'" class="alert alert-error"><span>ส่งคำขอไม่สำเร็จ ({{ work.failure.value?.code }})</span></div>

      <div class="flex justify-end"><button class="btn btn-primary min-h-11" type="submit" :disabled="busy || !allPhotosReady || campaignToken.length !== 64">ตรวจทานและส่งคำขอ</button></div>
    </form>
    <template #footer><p class="text-sm text-base-content/70">คำขอใหม่จะอยู่ในสถานะรอตรวจสอบ การรับคำขอไม่เท่ากับการอนุมัติยานพาหนะ</p></template>
  </PageTemplateComponent>

  <ConfirmDialog :open="confirmationOpen" title="ส่งคำขอลงทะเบียนหรือไม่" message="ระบบจะอัปโหลดภาพทั้ง 5 ตำแหน่ง แล้วส่งข้อมูลเข้าสู่คิวตรวจสอบ ยังไม่มีการอนุมัติยานพาหนะในขั้นตอนนี้" confirm-label="ส่งคำขอลงทะเบียน" :busy="busy" @cancel="confirmationOpen = false" @confirm="confirmSubmit" />
</template>
