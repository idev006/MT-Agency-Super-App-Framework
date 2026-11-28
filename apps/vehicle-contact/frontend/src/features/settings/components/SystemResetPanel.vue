<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import DataTable from '../../../components/common/DataTable.vue'

// VC-ADR-039 (owner 2026-11-26): system admin resets the data for testing / first set-up.
// Step 1 "ตรวจสอบก่อนลบ" counts what goes (nothing is deleted). Step 2 needs the phrase + the password;
// the server refuses if anything changed since step 1. Drive photo files go to the Drive trash (30-day undo).
// The password lives only in this component's memory and is cleared when done or when leaving the page.
const props = defineProps({ repository: { type: Object, required: true } })
const TABLE_LABELS = Object.freeze({
  vc_vehicles: 'รถ', vc_vehicle_contacts: 'ผู้ประสานงาน', vc_vehicle_photos: 'รายการภาพรถ', vc_qr_tokens: 'QR', vc_lookup_audit: 'บันทึกการเข้าดู',
  vc_change_audit: 'ประวัติการเปลี่ยนแปลง (audit)', vc_users: 'บัญชีผู้ใช้', vc_user_identities: 'การเชื่อมบัญชี Google', vc_user_roles: 'บทบาทของผู้ใช้',
  vc_user_permissions: 'สิทธิ์เพิ่มของผู้ใช้', vc_sessions: 'การเข้าสู่ระบบ (session) ของผู้อื่น', vc_organizations: 'หน่วยงาน', vc_campaigns: 'แคมเปญลงทะเบียน',
  vc_registration_requests: 'คำขอลงทะเบียน', vc_change_requests: 'คำขอเปลี่ยนแปลง', vc_retention_jobs: 'งานลบข้อมูลตามระยะเวลา', vc_photo_staging: 'ภาพที่อัปโหลดรอส่ง',
  vc_idempotency: 'บันทึกกันส่งซ้ำ', vc_operation_journal: 'journal การทำงาน', vc_security_events: 'เหตุการณ์ความปลอดภัย',
  vc_reference_values: 'ข้อมูลอ้างอิง (จังหวัด ยี่ห้อ สี …)', vc_settings: 'การตั้งค่า (รวมประเภทบุคคล/สีสติกเกอร์)', vc_roles: 'บทบาท', vc_role_permissions: 'สิทธิ์ของบทบาท', vc_migration_journal: 'ประวัติการย้ายข้อมูล',
})
const label = (t) => TABLE_LABELS[t] || t
const ERRORS = Object.freeze({
  OPERATION_DISABLED: 'ฟังก์ชันนี้ปิดอยู่ที่เซิร์ฟเวอร์ (เปิดได้เฉพาะระบบทดสอบ)',
  RESET_PLAN_STALE: 'ข้อมูลเปลี่ยนไปหลังการตรวจสอบ กรุณากด "ตรวจสอบก่อนลบ" ใหม่',
  INVALID_CREDENTIALS: 'รหัสผ่านไม่ถูกต้อง',
  RESET_CONFIRMATION_INVALID: 'ข้อความยืนยันไม่ถูกต้อง',
  FORBIDDEN: 'บัญชีนี้ไม่มีสิทธิ์รีเซ็ตข้อมูล',
})
const keepUsers = ref(true)
const keepCampaigns = ref(false)
const phase = ref('idle') // idle | previewing | ready | running | done | error
const errorCode = ref('')
const plan = ref(null)
const result = ref(null)
const phrase = ref('')
const password = ref('')
const columns = [{ key: 'table', label: 'ข้อมูล', kind: 'text' }, { key: 'count', label: 'จำนวน', kind: 'number' }]
const deleteRows = computed(() => Object.entries(plan.value?.deleteByTable || {}).map(([t, n]) => ({ id: t, table: label(t), count: n })))
// the only session a reset keeps is the admin's own (live test 2026-11-26: it was labelled "of others")
const keptRows = computed(() => Object.entries(plan.value?.keptByTable || {}).map(([t, n]) => ({ id: t, table: t === 'vc_sessions' ? 'การเข้าสู่ระบบ (session) ของคุณ' : label(t), count: n })))
const canRun = computed(() => phase.value === 'ready' && plan.value && phrase.value === plan.value.phrase && password.value.length > 0)
const errorText = computed(() => ERRORS[errorCode.value] || (errorCode.value ? `ไม่สำเร็จ (${errorCode.value})` : ''))
const options = () => ({ keepUsers: keepUsers.value, keepCampaigns: keepCampaigns.value })
watch([keepUsers, keepCampaigns], () => { if (phase.value !== 'running') { plan.value = null; phase.value = 'idle' } })

async function preview() {
  phase.value = 'previewing'; errorCode.value = ''; result.value = null
  try { plan.value = await props.repository.resetPreview(options()); phase.value = 'ready' }
  catch (error) { errorCode.value = error?.code || 'UNEXPECTED_ERROR'; phase.value = 'error' }
}
async function run() {
  if (!canRun.value) return
  phase.value = 'running'; errorCode.value = ''
  try {
    result.value = await props.repository.resetExecute({ confirmation: phrase.value, password: password.value, planDigest: plan.value.planDigest, ...options() })
    phase.value = 'done'
    if (!result.value.drive.more) clearSecret()
  } catch (error) {
    errorCode.value = error?.code || 'UNEXPECTED_ERROR'; phase.value = errorCode.value === 'RESET_PLAN_STALE' ? 'error' : 'ready'
    if (errorCode.value === 'RESET_PLAN_STALE') plan.value = null
  }
}
// Drive is time-boxed per call: continue with a fresh preview (the database is already empty).
async function continueDrive() {
  await preview()
  if (phase.value === 'ready') await run()
}
function clearSecret() { password.value = ''; phrase.value = '' }
onBeforeUnmount(clearSecret)
</script>

<template>
  <section class="card card-border border-error/50 bg-base-100 shadow-none" aria-labelledby="system-reset-title" data-system-reset>
    <div class="card-body gap-4">
      <div>
        <h2 id="system-reset-title" class="card-title"><span class="badge badge-error">ลบถาวร</span> รีเซ็ตข้อมูลระบบ (สำหรับทดสอบ / ตั้งต้นระบบ)</h2>
        <p class="text-sm text-base-content/80">ลบข้อมูลการใช้งานทั้งหมดใน Firestore และย้ายภาพรถใน Google Drive ไปถังขยะ (กู้คืนได้ 30 วัน) <strong>เก็บไว้:</strong> ข้อมูลอ้างอิง การตั้งค่า (รวมประเภทบุคคล/สีสติกเกอร์) บทบาทและสิทธิ์ และบัญชีของคุณ การลบใน Firestore ย้อนกลับไม่ได้</p>
      </div>
      <fieldset class="flex flex-wrap gap-x-6 gap-y-2" :disabled="phase === 'running' || phase === 'previewing'">
        <legend class="sr-only">ตัวเลือก</legend>
        <label class="flex min-h-11 cursor-pointer items-center gap-2"><input v-model="keepUsers" type="checkbox" class="checkbox" />เก็บบัญชีผู้ใช้และหน่วยงานทั้งหมด</label>
        <label class="flex min-h-11 cursor-pointer items-center gap-2"><input v-model="keepCampaigns" type="checkbox" class="checkbox" />เก็บแคมเปญลงทะเบียน</label>
      </fieldset>
      <div><button class="btn" type="button" :disabled="phase === 'running' || phase === 'previewing'" @click="preview"><span v-if="phase === 'previewing'" class="loading loading-spinner loading-sm"></span>1. ตรวจสอบก่อนลบ</button></div>
      <div v-if="errorText" class="alert alert-error" role="alert"><span>{{ errorText }}</span></div>

      <template v-if="plan && phase !== 'done'">
        <p class="font-semibold" data-reset-total>จะลบ {{ plan.deleteTotal.toLocaleString('th-TH') }} รายการ · ภาพใน Drive {{ plan.driveFiles.toLocaleString('th-TH') }} ไฟล์ไปถังขยะ</p>
        <div class="grid gap-4 lg:grid-cols-2">
          <div><h3 class="mb-2 font-semibold text-error">ที่จะลบ</h3><DataTable :columns="columns" :rows="deleteRows" row-key="id" label="ข้อมูลที่จะลบ" /></div>
          <div><h3 class="mb-2 font-semibold text-success">ที่เก็บไว้</h3><DataTable :columns="columns" :rows="keptRows" row-key="id" label="ข้อมูลที่เก็บไว้" /></div>
        </div>
        <form class="grid gap-3 rounded-box border border-error/40 p-4 sm:grid-cols-2" @submit.prevent="run">
          <label class="field-stack"><span class="label-text font-semibold">พิมพ์ <code class="font-mono">{{ plan.phrase }}</code> เพื่อยืนยัน</span><input v-model="phrase" class="input input-bordered w-full font-mono" autocomplete="off" spellcheck="false" :aria-label="`พิมพ์ ${plan.phrase} เพื่อยืนยัน`" /></label>
          <label class="field-stack"><span class="label-text font-semibold">รหัสผ่านของคุณ</span><input v-model="password" class="input input-bordered w-full" type="password" autocomplete="current-password" aria-label="รหัสผ่านของคุณ" /></label>
          <div class="sm:col-span-2"><button class="btn btn-error" type="submit" :disabled="!canRun"><span v-if="phase === 'running'" class="loading loading-spinner loading-sm"></span>2. ลบข้อมูลถาวร</button></div>
        </form>
      </template>

      <div v-if="phase === 'done' && result" class="alert alert-success items-start" role="status" data-reset-result>
        <div>
          <p class="font-semibold">รีเซ็ตแล้ว: ลบ {{ result.deleted.toLocaleString('th-TH') }} รายการ</p>
          <p v-if="result.drive.status === 'DONE'">ย้ายภาพใน Drive ไปถังขยะ {{ result.drive.trashed.toLocaleString('th-TH') }} ไฟล์</p>
          <p v-else-if="result.drive.more">ย้ายภาพไปถังขยะแล้ว {{ result.drive.trashed.toLocaleString('th-TH') }} ไฟล์ ยังเหลืออีก <button class="btn btn-sm ml-2" type="button" @click="continueDrive">ลบภาพที่เหลือต่อ</button></p>
          <p v-else>ภาพใน Drive: ทำไม่ได้ ({{ result.drive.status }}) ระบบลบภาพค้างให้อัตโนมัติทุกวัน</p>
        </div>
      </div>
    </div>
  </section>
</template>
