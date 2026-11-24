<script setup>
import { computed, inject, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { registrationIntakeRepositoryKey } from '../application/registrations/registration-intake-port.js'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import SearchableReferenceCombobox from '../features/reference-data/components/SearchableReferenceCombobox.vue'
import { CUSTOM_BRAND_CHOICE, reconcileBrandValue, resolveBrandValue } from '../features/registrations/brand-field.js'
import { CUSTOM_COLOR_CHOICE, reconcileColorValue, resolveColorValue } from '../features/registrations/color-field.js'
import { REGISTRATION_PHOTO_SLOTS, imageFileProblem, useRegistrationIntake } from '../features/registrations/useRegistrationIntake.js'
import { formatThaiPhone, toE164 } from '../domain/reference/vehicle-presentation.js'
import { useRegistrationReferenceStore } from '../stores/registration-reference.js'
import { useSessionStore } from '../stores/session.js'

// R4: one long form became a 5-step flow. The last step is the review, which replaces the
// confirm dialog. Every input stays mounted (v-show), so going back never loses data.
const STEPS = Object.freeze(['แคมเปญ', 'ข้อมูลรถ', 'ผู้ประสานงาน', 'ภาพหลักฐาน', 'ตรวจทานและส่ง'])

const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const referenceData = useRegistrationReferenceStore()
const { phase: referencePhase, failure: referenceFailure, lists, organizations, mode: referenceMode, version: referenceVersion } = storeToRefs(referenceData)
const work = useRegistrationIntake({ repository: inject(registrationIntakeRepositoryKey), permissions })
const step = ref(0)
const stepError = ref('')
const stepPanels = ref([])
const campaignToken = ref('')
const brandChoice = ref('')
const customBrand = ref('')
const colorChoice = ref('')
const customColor = ref('')
const contactPhoneInput = ref('')
const files = reactive({})
const previews = reactive({})
const fileProblems = reactive({})
const fields = reactive({ plate: '', province: '', plateType: '', vehicleType: '', brand: '', model: '', color: '', organizationId: '', relationship: '', contactName: '', contactPhone: '' })
const allPhotosReady = computed(() => REGISTRATION_PHOTO_SLOTS.every((slot) => files[slot.id] instanceof File && !fileProblems[slot.id]))
const busy = computed(() => ['validating', 'uploading', 'submitting'].includes(work.phase.value))
const canonicalMode = computed(() => ['ADVISORY', 'ENFORCED'].includes(referenceMode.value))
const campaignReady = computed(() => Boolean(work.campaign.value?.valid) && work.campaign.value.token === campaignToken.value)
const editingLocked = computed(() => busy.value || work.locked.value)

watch(contactPhoneInput, (value) => { fields.contactPhone = toE164(value) })

function labelOf(listKey, code) {
  if (!canonicalMode.value) return code || '—'
  const source = listKey === 'organizations' ? organizations.value : lists.value[listKey]
  return source?.find((item) => item.code === code)?.label || code || '—'
}
const reviewRows = computed(() => [
  ['เลขทะเบียน', fields.plate], ['จังหวัด', labelOf('provinces', fields.province)], ['ประเภทป้าย', labelOf('plateTypes', fields.plateType)],
  ['ประเภทยานพาหนะ', labelOf('vehicleTypes', fields.vehicleType)], ['ยี่ห้อ', labelOf('brands', fields.brand)], ['รุ่น', fields.model],
  ['สี', labelOf('colors', fields.color)], ['หน่วยงาน', labelOf('organizations', fields.organizationId)],
  ['ผู้ประสานงาน', fields.contactName], ['โทรศัพท์', formatThaiPhone(fields.contactPhone)], ['ความสัมพันธ์', labelOf('relationships', fields.relationship)],
])

function selectFile(slot, event) {
  const file = event.target.files?.[0] || null
  if (previews[slot]) URL.revokeObjectURL(previews[slot])
  files[slot] = file
  fileProblems[slot] = file ? imageFileProblem(file) : ''
  previews[slot] = file && !fileProblems[slot] ? URL.createObjectURL(file) : ''
}
onBeforeUnmount(() => { for (const url of Object.values(previews)) if (url) URL.revokeObjectURL(url) })

function panelValid(index) {
  const panel = stepPanels.value[index]
  if (!panel) return true
  const controls = [...panel.querySelectorAll('input, select, textarea')]
  const firstInvalid = controls.find((control) => !control.checkValidity())
  if (firstInvalid) { firstInvalid.reportValidity?.(); firstInvalid.focus?.(); return false }
  return true
}
function stepProblem(index) {
  if (index === 0 && !campaignReady.value) return 'กรุณากด “ตรวจสอบแคมเปญ” ให้ผ่านก่อน'
  if (index === 2 && !fields.contactPhone) return 'กรุณากรอกเบอร์โทร เช่น 081-234-5678'
  if (index === 3 && !allPhotosReady.value) return 'กรุณาเลือกภาพที่ถูกต้องให้ครบ 5 ตำแหน่ง'
  return ''
}
function next() {
  stepError.value = ''
  if (!panelValid(step.value)) return
  const problem = stepProblem(step.value)
  if (problem) { stepError.value = problem; return }
  step.value = Math.min(step.value + 1, STEPS.length - 1)
}
function back() { stepError.value = ''; step.value = Math.max(step.value - 1, 0) }
function goTo(index) { if (index < step.value && !editingLocked.value) { stepError.value = ''; step.value = index } }

async function submitRequest() {
  const reference = canonicalMode.value ? { referenceVersion: referenceVersion.value } : {}
  await work.submit({ campaignToken: campaignToken.value.trim(), fields: { ...fields, ...reference }, files: { ...files } })
}
function startNext() {
  for (const url of Object.values(previews)) if (url) URL.revokeObjectURL(url)
  for (const key of Object.keys(files)) { delete files[key]; delete previews[key]; delete fileProblems[key] }
  Object.assign(fields, { plate: '', model: '', contactName: '', contactPhone: '' })
  contactPhoneInput.value = ''
  step.value = 1
  work.reset({ keepCampaign: true })
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
  <PageTemplateComponent eyebrow="งานรับคำขอ" title="รับลงทะเบียนยานพาหนะ" description="กรอกทีละขั้น ตรวจทาน แล้วส่งเข้าคิวตรวจสอบ การรับคำขอยังไม่ใช่การอนุมัติ">
    <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span> / รับลงทะเบียนยานพาหนะ</span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>

    <div v-if="!work.canReceive.value" class="alert alert-warning">บัญชีนี้ไม่มีสิทธิ์รับลงทะเบียนยานพาหนะ</div>
    <div v-else-if="referencePhase === 'idle' || referencePhase === 'loading'" class="alert alert-info" role="status"><span class="loading loading-spinner loading-sm"></span><span>กำลังโหลดรายการสำหรับรับลงทะเบียน</span></div>
    <div v-else-if="referencePhase === 'error'" class="alert alert-error" role="alert"><div><p class="font-semibold">โหลดรายการสำหรับรับลงทะเบียนไม่สำเร็จ</p><p class="text-sm">รหัสข้อผิดพลาด {{ referenceFailure?.code || 'REFERENCE_DATA_UNAVAILABLE' }}</p></div><button class="btn btn-sm" type="button" @click="reloadReferences">ลองอีกครั้ง</button></div>
    <div v-else-if="work.phase.value === 'success'" class="card card-border bg-base-100"><div class="card-body"><span class="badge badge-success">ส่งคำขอแล้ว</span><h2 class="card-title text-2xl">คำขอเข้าสู่คิวตรวจสอบ</h2><p>รหัสคำขอ <strong class="break-all">{{ work.result.value.requestId }}</strong></p><p class="text-sm text-base-content/80">รหัสยานพาหนะ {{ work.result.value.vehicleId }}</p><div class="card-actions mt-3"><button class="btn btn-primary" type="button" @click="startNext">รับคันถัดไป (แคมเปญเดิม)</button><RouterLink class="btn" :to="{ name: 'registration-review' }">เปิดคิวตรวจสอบ</RouterLink></div></div></div>

    <form v-else class="space-y-5" novalidate @submit.prevent="step === STEPS.length - 1 ? submitRequest() : next()">
      <ol class="steps steps-horizontal w-full overflow-x-auto" aria-label="ขั้นตอนการรับลงทะเบียน">
        <li v-for="(label, index) in STEPS" :key="label" class="step" :class="{ 'step-primary': index <= step }" :aria-current="index === step ? 'step' : undefined">
          <button v-if="index < step" class="link text-sm" type="button" :disabled="editingLocked" @click="goTo(index)">{{ label }}</button>
          <span v-else class="text-sm">{{ label }}</span>
        </li>
      </ol>
      <p class="sr-only" aria-live="polite">ขั้นที่ {{ step + 1 }} จาก {{ STEPS.length }}: {{ STEPS[step] }}</p>
      <div v-if="referenceMode === 'LEGACY'" class="alert alert-warning" role="status"><div><p class="font-semibold">ยังไม่ได้เปิดใช้รายการข้อมูลกลาง</p><p class="text-sm">ระบบใช้ช่องกรอกแบบเดิมชั่วคราวและจะไม่ส่ง reference version จนกว่าข้อมูลกลางจะพร้อม</p></div></div>

      <fieldset v-show="step === 0" :ref="(el) => { stepPanels[0] = el }" class="fieldset rounded-box border border-base-300 bg-base-100 p-5 sm:p-6" :disabled="editingLocked">
        <legend class="fieldset-legend text-lg font-semibold">1. แคมเปญรับลงทะเบียน</legend>
        <div class="p6-form-row md:grid-cols-[minmax(0,1fr)_auto]">
          <label class="field-stack"><span class="label-text font-semibold">รหัสแคมเปญ (64 ตัวอักษร)</span><input v-model.trim="campaignToken" class="input input-bordered w-full font-mono" type="password" autocomplete="off" required minlength="64" maxlength="64" placeholder="วางรหัสแคมเปญที่ได้รับ" /><span class="label-text-alt">ใช้ตรวจสอบแคมเปญเท่านั้น ระบบไม่บันทึกรหัสใน browser</span></label>
          <div class="p6-row-action"><button class="btn w-full" type="button" :disabled="busy || campaignToken.length !== 64" @click="work.validateCampaign(campaignToken)"><span v-if="work.phase.value === 'validating'" class="loading loading-spinner loading-sm"></span>ตรวจสอบแคมเปญ</button></div>
        </div>
        <div v-if="campaignReady" class="alert alert-success mt-3">แคมเปญพร้อมรับคำขอ</div>
        <div v-else-if="work.phase.value === 'error' && step === 0" class="alert alert-error mt-3" role="alert"><span>ตรวจสอบแคมเปญไม่ผ่าน ({{ work.failure.value?.code }})</span></div>
      </fieldset>

      <fieldset v-show="step === 1" :ref="(el) => { stepPanels[1] = el }" class="fieldset rounded-box border border-base-300 bg-base-100 p-5 sm:p-6" :disabled="editingLocked">
        <legend class="fieldset-legend text-lg font-semibold">2. ข้อมูลยานพาหนะ</legend>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <label class="field-stack"><span class="label-text font-semibold">เลขทะเบียน</span><input v-model.trim="fields.plate" class="input input-bordered w-full" required maxlength="24" placeholder="เช่น กข 1234" /></label>
          <label class="field-stack"><span class="label-text font-semibold">จังหวัดของทะเบียน</span><select v-if="canonicalMode" v-model="fields.province" class="select select-bordered w-full" required><option disabled value="">เลือกจังหวัด</option><option v-for="item in lists.provinces" :key="item.code" :value="item.code">{{ item.label }}</option></select><input v-else v-model.trim="fields.province" class="input input-bordered w-full" required maxlength="32" /></label>
          <label class="field-stack"><span class="label-text font-semibold">ประเภทป้าย</span><select v-if="canonicalMode" v-model="fields.plateType" class="select select-bordered w-full" required><option disabled value="">เลือกประเภทป้าย</option><option v-for="item in lists.plateTypes" :key="item.code" :value="item.code">{{ item.label }}</option></select><input v-else v-model.trim="fields.plateType" class="input input-bordered w-full" required maxlength="100" /></label>
          <label class="field-stack"><span class="label-text font-semibold">ประเภทยานพาหนะ</span><select v-if="canonicalMode" v-model="fields.vehicleType" class="select select-bordered w-full" required><option disabled value="">เลือกประเภทยานพาหนะ</option><option v-for="item in lists.vehicleTypes" :key="item.code" :value="item.code">{{ item.label }}</option></select><input v-else v-model.trim="fields.vehicleType" class="input input-bordered w-full" required maxlength="100" /></label>
          <div class="field-stack"><span class="label-text font-semibold">ยี่ห้อ</span><template v-if="canonicalMode && lists.brands.length"><SearchableReferenceCombobox v-if="brandChoice !== CUSTOM_BRAND_CHOICE" v-model="brandChoice" label="ยี่ห้อ" :options="lists.brands" required /><input v-else v-model.trim="customBrand" class="input input-bordered w-full" required maxlength="100" aria-label="ระบุยี่ห้อยานพาหนะ" placeholder="ระบุยี่ห้อตามสมุดคู่มือจดทะเบียน" /><button class="btn btn-ghost btn-sm self-start" type="button" @click="toggleCustomBrand">{{ brandChoice === CUSTOM_BRAND_CHOICE ? 'เลือกจากรายการยี่ห้อ' : 'ไม่พบยี่ห้อ? ระบุเอง' }}</button></template><input v-else v-model.trim="fields.brand" class="input input-bordered w-full" required maxlength="100" aria-label="ยี่ห้อยานพาหนะ" /><span class="label-text-alt">ค้นหายี่ห้อจากรายการ หรือระบุเองหากไม่พบ</span></div>
          <label class="field-stack"><span class="label-text font-semibold">รุ่น</span><input v-model.trim="fields.model" class="input input-bordered w-full" required maxlength="100" placeholder="กรอกรุ่นตามสมุดคู่มือจดทะเบียน" /><span class="label-text-alt">กรอกชื่อรุ่นเองเพื่อรองรับรถทุกรุ่น</span></label>
          <label class="field-stack"><span class="label-text font-semibold">สี</span><select v-if="canonicalMode && lists.colors.length" v-model="colorChoice" class="select select-bordered w-full" required aria-describedby="vehicle-color-help"><option disabled value="">เลือกสี</option><option v-for="item in lists.colors" :key="item.code" :value="item.code">{{ item.label }}</option><option :value="CUSTOM_COLOR_CHOICE">สีอื่น — ระบุเอง</option></select><input v-if="canonicalMode && lists.colors.length && colorChoice === CUSTOM_COLOR_CHOICE" v-model.trim="customColor" class="input input-bordered w-full" required maxlength="100" aria-label="ระบุสีรถ" placeholder="ระบุสีตามสมุดคู่มือจดทะเบียน" /><input v-else-if="!canonicalMode || !lists.colors.length" v-model.trim="fields.color" class="input input-bordered w-full" required maxlength="100" /><span id="vehicle-color-help" class="label-text-alt">เลือกสีตั้งต้น หรือเลือกสีอื่นเพื่อกรอกเอง</span></label>
          <label class="field-stack"><span class="label-text font-semibold">หน่วยงาน</span><SearchableReferenceCombobox v-if="canonicalMode" v-model="fields.organizationId" label="หน่วยงาน" :options="organizations" required /><input v-else v-model.trim="fields.organizationId" class="input input-bordered w-full" required maxlength="100" /></label>
        </div>
      </fieldset>

      <fieldset v-show="step === 2" :ref="(el) => { stepPanels[2] = el }" class="fieldset rounded-box border border-base-300 bg-base-100 p-5 sm:p-6" :disabled="editingLocked">
        <legend class="fieldset-legend text-lg font-semibold">3. ผู้ประสานงาน</legend>
        <div class="grid gap-4 sm:grid-cols-3">
          <label class="field-stack"><span class="label-text font-semibold">ชื่อผู้ประสานงาน</span><input v-model.trim="fields.contactName" class="input input-bordered w-full" required maxlength="200" /></label>
          <label class="field-stack"><span class="label-text font-semibold">เบอร์โทรศัพท์</span><input v-model="contactPhoneInput" class="input input-bordered w-full" type="tel" inputmode="tel" autocomplete="off" required placeholder="081-234-5678" aria-describedby="contact-phone-help" /><span id="contact-phone-help" class="label-text-alt">{{ fields.contactPhone ? `จะบันทึกเป็น ${fields.contactPhone}` : 'กรอกเบอร์มือถือหรือเบอร์บ้าน 9–10 หลัก' }}</span></label>
          <label class="field-stack"><span class="label-text font-semibold">ความสัมพันธ์กับรถ</span><select v-if="canonicalMode" v-model="fields.relationship" class="select select-bordered w-full" required><option disabled value="">เลือกความสัมพันธ์</option><option v-for="item in lists.relationships" :key="item.code" :value="item.code">{{ item.label }}</option></select><input v-else v-model.trim="fields.relationship" class="input input-bordered w-full" required maxlength="100" /></label>
        </div>
      </fieldset>

      <fieldset v-show="step === 3" :ref="(el) => { stepPanels[3] = el }" class="fieldset rounded-box border border-base-300 bg-base-100 p-5 sm:p-6" :disabled="editingLocked">
        <legend class="fieldset-legend text-lg font-semibold">4. ภาพหลักฐาน 5 ตำแหน่ง</legend>
        <p class="mb-3 text-sm leading-6 text-base-content/80">JPEG, PNG หรือ WebP ไม่เกิน 5 MB ต่อภาพ บนมือถือกดแล้วถ่ายจากกล้องได้ทันที</p>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div v-for="slot in REGISTRATION_PHOTO_SLOTS" :key="slot.id" class="rounded-box border border-base-300 p-3">
            <label class="field-stack">
              <span class="label-text flex items-center justify-between font-semibold">{{ slot.label }}<span v-if="work.uploaded.value[slot.id]" class="badge badge-success badge-sm">อัปโหลดแล้ว</span><span v-else-if="previews[slot.id]" class="badge badge-ghost badge-sm">พร้อม</span></span>
              <div class="grid aspect-video place-items-center overflow-hidden rounded-box bg-base-200">
                <img v-if="previews[slot.id]" :src="previews[slot.id]" :alt="`ภาพ${slot.label}ที่เลือก`" class="h-full w-full object-cover" />
                <span v-else class="text-sm text-base-content/80">ยังไม่มีภาพ</span>
              </div>
              <input class="file-input file-input-bordered w-full" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" :aria-label="`เลือกภาพ${slot.label}`" @change="selectFile(slot.id, $event)" />
            </label>
            <p v-if="fileProblems[slot.id]" class="mt-2 text-sm font-medium" role="alert">⚠ {{ fileProblems[slot.id] }}</p>
          </div>
        </div>
      </fieldset>

      <section v-show="step === 4" class="card card-border bg-base-100" aria-labelledby="review-title">
        <div class="card-body gap-4 p-5 sm:p-6">
          <h2 id="review-title" class="card-title text-lg">5. ตรวจทานก่อนส่ง</h2>
          <dl class="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <div v-for="[label, value] in reviewRows" :key="label" class="flex justify-between gap-3 border-b border-base-200 py-1"><dt class="text-base-content/80">{{ label }}</dt><dd class="text-right font-medium">{{ value || '—' }}</dd></div>
          </dl>
          <ul class="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="ภาพที่จะส่ง">
            <li v-for="slot in REGISTRATION_PHOTO_SLOTS" :key="slot.id" class="text-center text-xs"><img v-if="previews[slot.id]" :src="previews[slot.id]" :alt="`ภาพ${slot.label}`" class="aspect-square w-full rounded-box object-cover" /><span>{{ slot.label }}</span></li>
          </ul>
          <p class="text-sm text-base-content/80">เมื่อกดส่ง ระบบจะอัปโหลดภาพทั้ง 5 ภาพแล้วส่งคำขอเข้าคิวตรวจสอบ ใช้เวลาประมาณ 10–20 วินาที อย่าปิดหน้านี้</p>
        </div>
      </section>

      <div v-if="work.phase.value === 'uploading'" class="alert alert-info" role="status"><span class="loading loading-spinner loading-sm"></span><span>กำลังอัปโหลดภาพ {{ Object.keys(work.uploaded.value).length }} / 5</span><progress class="progress w-32" :value="Object.keys(work.uploaded.value).length" max="5"></progress></div>
      <div v-else-if="work.phase.value === 'submitting'" class="alert alert-info" role="status"><span class="loading loading-spinner loading-sm"></span><span>อัปโหลดครบแล้ว กำลังส่งคำขอลงทะเบียน</span></div>
      <div v-else-if="work.phase.value === 'uncertain'" class="alert alert-warning" role="alert"><div><p class="font-semibold">ไม่ทราบผลแน่ชัด (การเชื่อมต่อขาดระหว่างส่ง)</p><p class="text-sm">ข้อมูลถูกล็อกไว้ กด “ส่งซ้ำด้วยข้อมูลเดิม” ได้อย่างปลอดภัย ถ้าคำขอแรกบันทึกแล้ว ระบบจะคืนรหัสคำขอเดิมและไม่สร้างซ้ำ</p><p v-if="work.failure.value?.requestId" class="font-mono text-xs">{{ work.failure.value.requestId }}</p></div><button class="btn btn-sm" type="button" @click="work.retrySame">ส่งซ้ำด้วยข้อมูลเดิม</button></div>
      <div v-else-if="work.phase.value === 'error' && work.failure.value?.code === 'REFERENCE_VERSION_STALE'" class="alert alert-warning"><div><p class="font-semibold">รายการข้อมูลกลางมีการปรับปรุง</p><p class="text-sm">โหลดรายการใหม่ ตรวจสอบค่าที่เลือก แล้วกดส่งคำขออีกครั้ง ระบบจะไม่ส่งซ้ำอัตโนมัติ</p></div><button class="btn btn-sm" type="button" @click="reloadReferences">โหลดรายการใหม่</button></div>
      <div v-else-if="work.phase.value === 'error' && step > 0" class="alert alert-error" role="alert"><span>ส่งคำขอไม่สำเร็จ ({{ work.failure.value?.code }}) แก้ไขข้อมูลแล้วส่งใหม่ได้</span></div>
      <p v-if="stepError" class="font-medium" role="alert">⚠ {{ stepError }}</p>

      <div class="flex flex-wrap justify-between gap-3">
        <button v-if="step > 0" class="btn min-h-11" type="button" :disabled="editingLocked" @click="back">ย้อนกลับ</button><span v-else></span>
        <button v-if="step < STEPS.length - 1" class="btn btn-primary min-h-11" type="submit" :disabled="busy">ถัดไป</button>
        <button v-else class="btn btn-primary min-h-11" type="submit" :disabled="editingLocked || !allPhotosReady || !campaignReady"><span v-if="busy" class="loading loading-spinner loading-sm"></span>ส่งคำขอลงทะเบียน</button>
      </div>
    </form>
    <template #footer><p class="text-sm text-base-content/80">คำขอใหม่จะอยู่ในสถานะรอตรวจสอบ การรับคำขอไม่เท่ากับการอนุมัติยานพาหนะ</p></template>
  </PageTemplateComponent>
</template>
