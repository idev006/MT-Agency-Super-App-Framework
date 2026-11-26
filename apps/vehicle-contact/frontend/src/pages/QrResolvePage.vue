<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { qrResolveRepositoryKey } from '../application/vehicles/qr-resolve-port.js'
import { qrScannerKey } from '../application/scanner/qr-scanner-port.js'
import { vehicleDetailRepositoryKey } from '../application/vehicles/vehicle-detail-port.js'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import VehicleSearchResult from '../features/vehicle-search/components/VehicleSearchResult.vue'
import { useQrResolve } from '../features/vehicle-search/useQrResolve.js'
import QrScannerPanel from '../features/qr-scanner/components/QrScannerPanel.vue'
import { useQrScanner } from '../features/qr-scanner/useQrScanner.js'
import { useSessionStore } from '../stores/session.js'

// Owner 2026-11-26 ("ต้องไม่สร้างความสับสนจาก workflow และการแสดงผล"): ONE step on screen at a time.
//   Step 1 "สแกน": the camera (and, folded, the fallbacks: photo of the QR, typing the code, plate search).
//   Step 2 "ผลการตรวจสอบ": the vehicle (or a plain reason why not) + "สแกนคันถัดไป" — the camera is gone.
const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const work = useQrResolve({ repository: inject(qrResolveRepositoryKey), permissions })
const detailRepository = inject(vehicleDetailRepositoryKey, null)
const loadPhoto = typeof detailRepository?.photo === 'function' ? (args) => detailRepository.photo(args) : null
const token = ref('')
const permissionSet = computed(() => new Set(permissions.value))
const readerId = 'p6vc-qr-reader'
const step = computed(() => (work.phase.value === 'idle' ? 'scan' : 'result'))
// After a vehicle QR is read the camera stops (privacy, battery) and the result is brought into view.
async function resolveAndShow(candidate) {
  await work.resolve(candidate)
  globalThis.document?.getElementById('qr-result')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
}
const scanner = useQrScanner({ scanner: inject(qrScannerKey), elementId: readerId, onDecoded: resolveAndShow })

async function submit() {
  const candidate = token.value
  token.value = ''
  await scanner.stop() // the camera view leaves the screen with step 1
  await resolveAndShow(candidate)
}
async function scanNext() {
  work.reset()
  await scanner.start()
}

const route = useRoute()
const router = useRouter()
// VC-ADR-032 (A): opened from a sticker link (#/q/<code> → ?t=<code>): drop it from the URL, then resolve.
onMounted(async () => {
  scanner.bindLifecycle()
  const code = typeof route.query.t === 'string' ? route.query.t : ''
  if (code) { await router.replace({ query: {} }); await resolveAndShow(code) }
})
onBeforeUnmount(() => { work.clearSensitive(); scanner.destroy() })

const OUTCOME = Object.freeze({
  empty: { tone: 'alert-info', title: 'ไม่พบ QR นี้ในระบบ', text: 'QR อาจไม่ใช่ของระบบนี้ หรือพิมพ์รหัสผิด ลองสแกนใหม่ หรือค้นหาด้วยเลขทะเบียน' },
  revoked: { tone: 'alert-warning', title: 'QR นี้ถูกเพิกถอนแล้ว', text: 'สติกเกอร์นี้ใช้ไม่ได้แล้ว (เช่น ออก QR ใหม่แทน หรือรถถูกยกเลิก) ค้นหาด้วยเลขทะเบียนเพื่อดูข้อมูลปัจจุบัน' },
  inactive: { tone: 'alert-warning', title: 'รถคันนี้ไม่อยู่ในสถานะใช้งาน', text: 'ระบบไม่แสดงข้อมูลรถที่ไม่ได้ใช้งาน ติดต่อผู้ดูแลระบบหากคิดว่าไม่ถูกต้อง' },
  invalid: { tone: 'alert-warning', title: 'รูปแบบรหัส QR ไม่ถูกต้อง', text: 'รหัส QR ต้องเป็นตัวอักษร 64 ตัว ลองสแกนใหม่' },
  forbidden: { tone: 'alert-warning', title: 'บัญชีนี้ไม่มีสิทธิ์ตรวจสอบยานพาหนะ', text: 'ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์' },
})
</script>

<template>
  <PageTemplateComponent eyebrow="งานตรวจสอบ" title="ตรวจสอบ QR ยานพาหนะ" description="สแกน QR บนรถ → ตรวจว่าเป็นคันเดียวกัน → โทรหาผู้ประสานงาน">
    <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span aria-hidden="true"> / </span><span aria-current="page">ตรวจสอบ QR</span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>

    <ol class="steps steps-horizontal mb-4 w-full text-sm" aria-label="ขั้นตอน">
      <li class="step" :class="'step-primary'">สแกน QR</li>
      <li class="step" :class="step === 'result' ? 'step-primary' : ''">ตรวจรถและโทร</li>
    </ol>

    <!-- Step 1: scan -->
    <template v-if="step === 'scan'">
      <QrScannerPanel :reader-id="readerId" :phase="scanner.phase.value" :failure-code="scanner.failure.value?.code" :devices="scanner.devices.value" :selected-device-id="scanner.selectedDeviceId.value" :facing-mode="scanner.facingMode.value" :active-facing-mode="scanner.activeFacingMode.value" :active="scanner.active.value"
        :notice="scanner.notice.value" :busy="scanner.busy.value" @start="scanner.start" @stop="scanner.stop" @switch="scanner.switchCamera" @select-device="scanner.selectDevice" @scan-file="scanner.scanFile" />
      <details class="collapse collapse-arrow mt-4 border border-base-300 bg-base-100">
        <summary class="collapse-title font-medium">สแกนไม่ได้? กรอกรหัส QR เอง หรือค้นหาด้วยเลขทะเบียน</summary>
        <div class="collapse-content space-y-4">
          <form autocomplete="off" @submit.prevent="submit">
            <fieldset class="fieldset gap-3" :disabled="work.phase.value === 'loading'">
              <legend class="sr-only">กรอกรหัส QR</legend>
              <div class="p6-form-row md:grid-cols-[minmax(0,1fr)_auto]">
              <label class="field-stack">
                <span class="label font-medium text-base-content">รหัส QR (64 ตัวอักษร)</span>
                <input v-model.trim="token" class="input input-bordered min-h-11 w-full font-mono" type="password" inputmode="text" minlength="64" maxlength="64" pattern="[A-Fa-f0-9]{64}" autocomplete="off" autocapitalize="none" spellcheck="false" required aria-describedby="qr-token-help">
                <span id="qr-token-help" class="text-sm text-base-content/80">ระบบใช้รหัสในหน่วยความจำระหว่างคำขอเท่านั้น ไม่บันทึกลง URL หรือ browser storage</span>
              </label>
              <div class="p6-row-action"><button class="btn btn-primary w-full px-6" type="submit" :disabled="token.length !== 64 || work.phase.value === 'loading'">ตรวจสอบ QR</button></div>
              </div>
            </fieldset>
          </form>
          <RouterLink class="btn btn-ghost w-full sm:w-auto" :to="{ name: 'vehicle-search' }">ค้นหาด้วยเลขทะเบียนแทน</RouterLink>
        </div>
      </details>
    </template>

    <!-- Step 2: result -->
    <section v-else id="qr-result" class="scroll-mt-28 space-y-4" aria-live="polite">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-semibold">ผลการตรวจสอบ QR</h2>
        <button class="btn btn-primary min-h-11" type="button" :disabled="work.phase.value === 'loading' || scanner.busy.value" @click="scanNext">สแกนคันถัดไป</button>
      </div>
      <div v-if="work.phase.value === 'loading'" class="space-y-3" role="status"><span class="sr-only">กำลังตรวจสอบ QR</span><div class="skeleton h-48 w-full"></div><div class="skeleton h-24 w-full"></div></div>
      <div v-else-if="OUTCOME[work.phase.value]" class="alert items-start shadow-none" :class="OUTCOME[work.phase.value].tone" data-qr-outcome>
        <div><h3 class="font-semibold">{{ OUTCOME[work.phase.value].title }}</h3><p class="mt-1">{{ OUTCOME[work.phase.value].text }}</p>
          <RouterLink v-if="work.phase.value !== 'forbidden'" class="btn btn-sm mt-3" :to="{ name: 'vehicle-search' }">ค้นหาด้วยเลขทะเบียน</RouterLink></div>
      </div>
      <div v-else-if="work.phase.value === 'unauthenticated'" class="alert alert-warning"><div><p>เซสชันสิ้นสุดแล้ว กรุณาเข้าสู่ระบบอีกครั้ง</p><RouterLink class="btn btn-sm mt-3" :to="{ name: 'sign-in' }">เข้าสู่ระบบ</RouterLink></div></div>
      <div v-else-if="work.phase.value === 'recoverable-error' || work.phase.value === 'error'" class="alert alert-error items-start"><div><h3 class="font-medium">ตรวจสอบ QR ไม่สำเร็จ</h3><p class="mt-1">{{ work.phase.value === 'recoverable-error' ? 'การเชื่อมต่อขัดข้อง ลองอีกครั้งได้' : 'ระบบปฏิเสธคำขอโดยไม่เปิดเผยข้อมูลยานพาหนะ' }}</p><button v-if="work.phase.value === 'recoverable-error'" class="btn btn-sm mt-3" type="button" @click="work.retry">ลองอีกครั้ง</button><details v-if="work.failure.value?.requestId" class="collapse collapse-arrow mt-3 bg-base-100 text-base-content"><summary class="collapse-title font-medium">รายละเอียดสำหรับเจ้าหน้าที่สนับสนุน</summary><div class="collapse-content break-all font-mono text-sm">{{ work.failure.value.requestId }}</div></details></div></div>
      <VehicleSearchResult v-if="work.phase.value === 'success'" :result="work.result.value" :load-photo="loadPhoto" :can-read-contacts="permissionSet.has('vehicle.contact.read')" :can-read-photos="permissionSet.has('vehicle.photos.read')" :can-read-history="permissionSet.has('vehicle.history.read')" />
    </section>
  </PageTemplateComponent>
</template>
