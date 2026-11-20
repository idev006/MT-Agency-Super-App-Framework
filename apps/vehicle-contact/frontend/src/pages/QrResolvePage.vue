<script setup>
import { computed, inject, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { qrResolveRepositoryKey } from '../application/vehicles/qr-resolve-port.js'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import VehicleSearchResult from '../features/vehicle-search/components/VehicleSearchResult.vue'
import { useQrResolve } from '../features/vehicle-search/useQrResolve.js'
import { useSessionStore } from '../stores/session.js'

const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const work = useQrResolve({ repository: inject(qrResolveRepositoryKey), permissions })
const token = ref('')
const permissionSet = computed(() => new Set(permissions.value))

async function submit() {
  const candidate = token.value
  token.value = ''
  await work.resolve(candidate)
}

onUnmounted(work.clearSensitive)
</script>

<template>
  <PageTemplateComponent eyebrow="งานตรวจสอบ" title="ตรวจสอบ QR ยานพาหนะ" description="กรอก token ที่อ่านจาก QR เพื่อเรียกข้อมูลรถตามสิทธิ์ของเซสชันนี้">
    <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span aria-hidden="true"> / </span><span aria-current="page">ตรวจสอบ QR</span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>
    <template #toolbar>
      <form class="card card-border bg-base-100 shadow-none" autocomplete="off" @submit.prevent="submit">
        <fieldset class="card-body gap-4 p-5 sm:p-6" :disabled="work.phase.value === 'loading'">
          <legend class="fieldset-legend text-lg font-medium">QR token</legend>
          <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <label class="field-stack">
              <span class="label font-medium">Token 64 ตัวอักษร</span>
              <input v-model.trim="token" class="input input-bordered min-h-11 w-full font-mono" type="password" inputmode="text" minlength="64" maxlength="64" pattern="[A-Fa-f0-9]{64}" autocomplete="off" autocapitalize="none" spellcheck="false" required aria-describedby="qr-token-help">
              <span id="qr-token-help" class="text-sm text-base-content/65">ระบบใช้ token ในหน่วยความจำระหว่างคำขอเท่านั้น และไม่บันทึกลง URL หรือ browser storage</span>
            </label>
            <button class="btn btn-primary min-h-11 md:mt-8" type="submit" :disabled="token.length !== 64 || work.phase.value === 'loading'">
              <span v-if="work.phase.value === 'loading'" class="loading loading-spinner loading-sm" aria-hidden="true"></span>
              ตรวจสอบ QR
            </button>
          </div>
        </fieldset>
      </form>
    </template>

    <section aria-live="polite">
      <div v-if="work.phase.value === 'idle'" class="alert items-start shadow-none"><div><h2 class="font-medium">พร้อมตรวจสอบ</h2><p class="mt-1">กรอก token จากเครื่องอ่าน QR โดยไม่ต้องส่ง token ผ่าน URL</p></div></div>
      <div v-else-if="work.phase.value === 'loading'" class="space-y-4" role="status"><span class="sr-only">กำลังตรวจสอบ QR</span><div class="skeleton h-40 w-full"></div><div class="grid gap-4 sm:grid-cols-2"><div class="skeleton h-40"></div><div class="skeleton h-40"></div></div></div>
      <div v-else-if="work.phase.value === 'invalid'" class="alert alert-warning">รูปแบบ QR token ไม่ถูกต้อง กรุณาอ่าน QR ใหม่</div>
      <div v-else-if="work.phase.value === 'empty'" class="alert alert-info">ไม่พบ QR ที่ใช้งานอยู่ QR อาจไม่ถูกต้อง ถูกเพิกถอน หรือยานพาหนะไม่ได้อยู่ในสถานะใช้งาน</div>
      <div v-else-if="work.phase.value === 'forbidden'" class="alert alert-warning">เซสชันนี้ไม่ได้รับอนุญาตให้ตรวจสอบยานพาหนะ</div>
      <div v-else-if="work.phase.value === 'unauthenticated'" class="alert alert-warning"><div><p>เซสชันสิ้นสุดแล้ว กรุณาเข้าสู่ระบบอีกครั้ง</p><RouterLink class="btn btn-sm mt-3" :to="{ name: 'sign-in' }">เข้าสู่ระบบ</RouterLink></div></div>
      <div v-else-if="work.phase.value === 'recoverable-error' || work.phase.value === 'error'" class="alert alert-error items-start"><div><h2 class="font-medium">ตรวจสอบ QR ไม่สำเร็จ</h2><p class="mt-1">{{ work.phase.value === 'recoverable-error' ? 'การเชื่อมต่อขัดข้อง สามารถลองคำขอเดิมอีกครั้งได้' : 'ระบบปฏิเสธคำขอโดยไม่เปิดเผยข้อมูลยานพาหนะ' }}</p><button v-if="work.phase.value === 'recoverable-error'" class="btn btn-sm mt-3" type="button" @click="work.retry">ลองอีกครั้ง</button><details v-if="work.failure.value?.requestId" class="collapse collapse-arrow mt-3 bg-base-100 text-base-content"><summary class="collapse-title font-medium">รายละเอียดสำหรับเจ้าหน้าที่สนับสนุน</summary><div class="collapse-content break-all font-mono text-sm">{{ work.failure.value.requestId }}</div></details></div></div>
      <VehicleSearchResult v-else-if="work.phase.value === 'success'" :result="work.result.value" :can-read-contacts="permissionSet.has('vehicle.contact.read')" :can-read-photos="permissionSet.has('vehicle.photos.read')" :can-read-history="permissionSet.has('vehicle.history.read')" />
    </section>
    <template #footer><p class="text-sm text-base-content/70">GAS ตรวจสอบ session, permission, สถานะ QR และบันทึกการค้นหาทุกครั้ง กล้องสแกนจะเพิ่มใน slice ถัดไป</p></template>
  </PageTemplateComponent>
</template>
