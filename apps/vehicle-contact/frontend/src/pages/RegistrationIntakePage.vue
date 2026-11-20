<script setup>
import { computed, inject, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { registrationIntakeRepositoryKey } from '../application/registrations/registration-intake-port.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import { REGISTRATION_PHOTO_SLOTS, useRegistrationIntake } from '../features/registrations/useRegistrationIntake.js'
import { useSessionStore } from '../stores/session.js'

const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const work = useRegistrationIntake({ repository: inject(registrationIntakeRepositoryKey), permissions })
const campaignToken = ref('')
const confirmationOpen = ref(false)
const files = reactive({})
const fields = reactive({ plate: '', province: '', plateType: '', vehicleType: '', brand: '', model: '', color: '', organizationId: '', relationship: '', contactName: '', contactPhone: '' })
const allPhotosReady = computed(() => REGISTRATION_PHOTO_SLOTS.every((slot) => files[slot.id] instanceof File))
const busy = computed(() => ['validating', 'uploading', 'submitting'].includes(work.phase.value))

function selectFile(slot, event) { files[slot] = event.target.files?.[0] || null }
async function confirmSubmit() { confirmationOpen.value = false; await work.submit({ campaignToken: campaignToken.value.trim(), fields: { ...fields }, files }) }
</script>

<template>
  <PageTemplateComponent eyebrow="งานรับคำขอ" title="รับลงทะเบียนยานพาหนะ" description="บันทึกข้อมูลผู้ขอลงทะเบียน ยานพาหนะ และภาพหลักฐานให้ครบ ก่อนส่งเข้าคิวตรวจสอบ">
    <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span> / รับลงทะเบียนยานพาหนะ</span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>

    <div v-if="!work.canReceive.value" class="alert alert-warning">เซสชันนี้ไม่มีสิทธิ์รับลงทะเบียนยานพาหนะ</div>
    <div v-else-if="work.phase.value === 'success'" class="card card-border bg-base-100"><div class="card-body"><span class="badge badge-success">ส่งคำขอแล้ว</span><h2 class="card-title text-2xl">คำขอเข้าสู่คิวตรวจสอบ</h2><p>รหัสคำขอ <strong class="break-all">{{ work.result.value.requestId }}</strong></p><p class="text-sm text-base-content/70">รหัสยานพาหนะ {{ work.result.value.vehicleId }}</p><div class="card-actions mt-3"><button class="btn btn-primary" type="button" @click="work.reset">รับลงทะเบียนรายการถัดไป</button><RouterLink class="btn" :to="{ name: 'registration-review' }">เปิดคิวตรวจสอบ</RouterLink></div></div></div>

    <form v-else class="space-y-6" @submit.prevent="confirmationOpen = true">
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
          <label class="field-stack"><span class="label-text font-semibold">รหัสจังหวัด</span><input v-model.trim="fields.province" class="input input-bordered w-full" required maxlength="32" /></label>
          <label class="field-stack"><span class="label-text font-semibold">ประเภทป้าย</span><input v-model.trim="fields.plateType" class="input input-bordered w-full" required maxlength="100" /></label>
          <label class="field-stack"><span class="label-text font-semibold">ประเภทยานพาหนะ</span><input v-model.trim="fields.vehicleType" class="input input-bordered w-full" required maxlength="100" /></label>
          <label class="field-stack"><span class="label-text font-semibold">ยี่ห้อ</span><input v-model.trim="fields.brand" class="input input-bordered w-full" required maxlength="100" /></label>
          <label class="field-stack"><span class="label-text font-semibold">รุ่น</span><input v-model.trim="fields.model" class="input input-bordered w-full" required maxlength="100" /></label>
          <label class="field-stack"><span class="label-text font-semibold">สี</span><input v-model.trim="fields.color" class="input input-bordered w-full" required maxlength="100" /></label>
          <label class="field-stack"><span class="label-text font-semibold">รหัสหน่วยงาน</span><input v-model.trim="fields.organizationId" class="input input-bordered w-full" required maxlength="100" /></label>
        </div>
      </fieldset>

      <fieldset class="fieldset rounded-box border border-base-300 bg-base-100 p-5 sm:p-6">
        <legend class="fieldset-legend text-lg font-semibold">3. ผู้ประสานงาน</legend>
        <div class="grid gap-4 sm:grid-cols-3">
          <label class="field-stack"><span class="label-text font-semibold">ชื่อผู้ประสานงาน</span><input v-model.trim="fields.contactName" class="input input-bordered w-full" required maxlength="200" /></label>
          <label class="field-stack"><span class="label-text font-semibold">โทรศัพท์รูปแบบสากล</span><input v-model.trim="fields.contactPhone" class="input input-bordered w-full" type="tel" required pattern="\+[1-9][0-9]{6,14}" placeholder="+66812345678" /></label>
          <label class="field-stack"><span class="label-text font-semibold">ความสัมพันธ์กับรถ</span><input v-model.trim="fields.relationship" class="input input-bordered w-full" required maxlength="100" /></label>
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
      <div v-else-if="work.phase.value === 'error'" class="alert alert-error"><span>ส่งคำขอไม่สำเร็จ ({{ work.failure.value?.code }})</span></div>

      <div class="flex justify-end"><button class="btn btn-primary min-h-11" type="submit" :disabled="busy || !allPhotosReady || campaignToken.length !== 64">ตรวจทานและส่งคำขอ</button></div>
    </form>
    <template #footer><p class="text-sm text-base-content/70">คำขอใหม่จะอยู่ในสถานะรอตรวจสอบ การรับคำขอไม่เท่ากับการอนุมัติยานพาหนะ</p></template>
  </PageTemplateComponent>

  <ConfirmDialog :open="confirmationOpen" title="ส่งคำขอลงทะเบียนหรือไม่" message="ระบบจะอัปโหลดภาพทั้ง 5 ตำแหน่ง แล้วส่งข้อมูลเข้าสู่คิวตรวจสอบ ยังไม่มีการอนุมัติยานพาหนะในขั้นตอนนี้" confirm-label="ส่งคำขอลงทะเบียน" :busy="busy" @cancel="confirmationOpen = false" @confirm="confirmSubmit" />
</template>
