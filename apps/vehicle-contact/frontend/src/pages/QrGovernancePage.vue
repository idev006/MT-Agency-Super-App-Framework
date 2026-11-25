<script setup>
import { computed, inject, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { qrGovernanceRepositoryKey } from '../application/qr/qr-governance-port.js'
import { vehicleSearchRepositoryKey } from '../application/vehicles/vehicle-search-port.js'
import { vehicleDetailRepositoryKey } from '../application/vehicles/vehicle-detail-port.js'
import QrHistoryTable from '../features/qr-governance/components/QrHistoryTable.vue'
import VehicleQrImage from '../features/qr-governance/components/VehicleQrImage.vue'
import { QR_REASONS, qrReasonLabel, qrReasonProblem } from '../domain/reference/qr-reasons.js'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import VehicleSearchForm from '../features/vehicle-search/components/VehicleSearchForm.vue'
import { useQrGovernance } from '../features/qr-governance/useQrGovernance.js'
import { copySecret, useOneTimeSecretGuard } from '../features/common/useOneTimeSecretGuard.js'
import { provinceLabel } from '../domain/reference/provinces.js'
import { useSessionStore } from '../stores/session.js'

// R6 (E2E P3): the page asked for the raw 64-char vehicle id, which nobody has. It now finds the
// vehicle by plate + province (or arrives with ?vehicleId= from the vehicle detail page).
const route = useRoute()
const auth = useSessionStore(); const { roles, permissions, session, transport } = storeToRefs(auth)
const work = useQrGovernance({ repository: inject(qrGovernanceRepositoryKey) })
const searchRepository = inject(vehicleSearchRepositoryKey)
const detailRepository = inject(vehicleDetailRepositoryKey)
const vehicle = ref(null)
const findPhase = ref('idle')
const findCode = ref('')
const pendingAction = ref('')
const reasonForm = ref({ reason: '', note: '' })
const reasonProblem = computed(() => (pendingAction.value ? qrReasonProblem(pendingAction.value, reasonForm.value.reason, reasonForm.value.note) : ''))
function openAction(action) { reasonForm.value = { reason: action === 'issue' ? 'NEW' : '', note: '' }; pendingAction.value = action }
const copied = ref(false)
const labels = { issue: 'ออก QR ใหม่', replace: 'เปลี่ยน QR', revoke: 'เพิกถอน QR' }
const warnings = {
  issue: 'ใช้เมื่อรถยังไม่มี QR ที่ใช้งานอยู่ ถ้ามีอยู่แล้วระบบจะปฏิเสธ',
  replace: 'QR เดิมจะใช้ไม่ได้ทันที และได้รหัส QR ใหม่ที่แสดงครั้งเดียว',
  revoke: 'QR ของรถคันนี้จะใช้ไม่ได้ทันที จนกว่าจะออก QR ใหม่',
}
const token = computed(() => work.result.value?.token || '')
useOneTimeSecretGuard(token)

async function runFind(load) {
  findPhase.value = 'loading'; findCode.value = ''; vehicle.value = null; work.clearSensitiveResult()
  try {
    const found = await load()
    vehicle.value = found || null
    findPhase.value = found ? 'found' : 'empty'
    if (found) work.loadHistory(found.vehicleId)
  } catch (error) { findCode.value = error?.code || 'UNEXPECTED_ERROR'; findPhase.value = 'error' }
}
function searchPlate(criteria) {
  return runFind(async () => (await searchRepository.lookup(criteria, { permissions: permissions.value })).vehicle)
}
onMounted(() => {
  const id = String(route.query.vehicleId || '')
  if (id) runFind(async () => (await detailRepository.detail(id, { permissions: permissions.value })).vehicle)
})
async function confirm() {
  const action = pendingAction.value; pendingAction.value = ''; copied.value = false
  await work.execute(action, vehicle.value.vehicleId, { ...reasonForm.value })
}
async function copyToken() { copied.value = await copySecret(token.value) }
</script>
<template>
  <PageTemplateComponent eyebrow="การกำกับดูแล" title="จัดการ QR" description="ค้นหารถด้วยทะเบียน แล้วออก เปลี่ยน หรือเพิกถอน QR ของรถคันนั้น">
    <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span> / จัดการ QR</span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>
    <template #toolbar><VehicleSearchForm :busy="findPhase === 'loading'" @search="searchPlate" /></template>

    <section aria-live="polite">
      <div v-if="findPhase === 'loading'" class="skeleton h-32 w-full" role="status"><span class="sr-only">กำลังค้นหารถ</span></div>
      <div v-else-if="findPhase === 'empty'" class="alert alert-info">ไม่พบรถที่ใช้งานอยู่ตามทะเบียนนี้</div>
      <div v-else-if="findPhase === 'error'" class="alert alert-error">ค้นหาไม่สำเร็จ ({{ findCode }})</div>
      <div v-else-if="findPhase === 'idle'" class="alert">ค้นหารถด้วยทะเบียนและจังหวัดก่อน แล้วเลือกการดำเนินการกับ QR</div>

      <div v-else-if="vehicle" class="card card-border bg-base-100">
        <div class="card-body gap-4">
          <div class="flex flex-wrap items-center gap-4">
            <span class="vehicle-plate"><strong class="text-2xl leading-tight">{{ vehicle.plate }}</strong><span>{{ provinceLabel(vehicle.province) || vehicle.province }}</span></span>
            <p class="text-base-content/80">{{ [vehicle.brand, vehicle.model, vehicle.labels?.color || vehicle.color].filter(Boolean).join(' · ') }}</p>
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <div v-for="action in ['issue', 'replace', 'revoke']" :key="action" class="rounded-box border border-base-300 p-3">
              <button class="btn min-h-11 w-full" :class="action === 'revoke' ? 'btn-error' : action === 'issue' ? 'btn-primary' : ''" type="button" :disabled="work.phase.value === 'submitting'" @click="openAction(action)">{{ labels[action] }}</button>
              <p class="mt-2 text-sm text-base-content/80">{{ warnings[action] }}</p>
            </div>
          </div>
          <div class="divider">ประวัติ QR ของรถคันนี้</div>
          <QrHistoryTable :items="work.history.value" :phase="work.historyPhase.value" />
        </div>
      </div>
    </section>

    <div v-if="work.phase.value === 'success'" class="alert alert-success mt-5 items-start" role="status"><div class="min-w-0"><h2 class="font-semibold">ดำเนินการสำเร็จ</h2>
      <template v-if="token"><p class="mt-2">รหัส QR แสดงครั้งเดียว คัดลอกไปพิมพ์สติกเกอร์ตอนนี้ ถ้าออกจากหน้านี้ระบบจะถามยืนยันก่อน</p><code class="mt-2 block break-all rounded-box bg-base-100 p-3 text-base-content">{{ token }}</code><VehicleQrImage :token="token" />
        <div class="mt-3 flex flex-wrap gap-2"><button class="btn btn-primary btn-sm" type="button" @click="copyToken">{{ copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกรหัส QR' }}</button><button class="btn btn-sm" type="button" @click="work.clearSensitiveResult">บันทึกแล้ว ปิดและล้างรหัส</button></div></template>
    </div></div>
    <div v-else-if="work.phase.value === 'uncertain'" class="alert alert-warning mt-5">ไม่ทราบผลแน่ชัด ค้นหารถคันนี้อีกครั้งเพื่อตรวจสถานะก่อนดำเนินการซ้ำ</div>
    <div v-else-if="work.phase.value === 'error'" class="alert alert-error mt-5">ดำเนินการไม่สำเร็จ ({{ work.failure.value?.code }})</div>
  </PageTemplateComponent>
  <dialog class="modal" :open="Boolean(pendingAction)" aria-labelledby="qr-reason-title">
    <div v-if="pendingAction" class="modal-box">
      <h2 id="qr-reason-title" class="text-lg font-semibold">{{ labels[pendingAction] }}</h2>
      <p class="mt-1 text-sm text-base-content/80">{{ warnings[pendingAction] }}</p>
      <label class="field-stack mt-4"><span class="label-text font-semibold">เหตุผล (บันทึกในประวัติ QR)</span>
        <select v-model="reasonForm.reason" class="select select-bordered w-full"><option value="" disabled>เลือกเหตุผล</option><option v-for="code in QR_REASONS[pendingAction]" :key="code" :value="code">{{ qrReasonLabel(code) }}</option></select></label>
      <label class="field-stack mt-3"><span class="label-text font-semibold">หมายเหตุ{{ reasonForm.reason === 'OTHER' ? ' (จำเป็น)' : ' (ถ้ามี)' }}</span>
        <textarea v-model="reasonForm.note" class="textarea textarea-bordered w-full" maxlength="200" rows="2"></textarea></label>
      <p v-if="reasonProblem" class="mt-2 text-sm text-error">{{ reasonProblem }}</p>
      <div class="modal-action"><button class="btn" type="button" :disabled="work.phase.value === 'submitting'" @click="pendingAction = ''">ไม่ใช่ กลับไป</button><button class="btn" :class="pendingAction === 'revoke' ? 'btn-error' : 'btn-primary'" type="button" :disabled="Boolean(reasonProblem) || work.phase.value === 'submitting'" @click="confirm">{{ labels[pendingAction] }}</button></div>
    </div>
  </dialog>
</template>
