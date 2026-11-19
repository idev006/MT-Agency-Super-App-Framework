<script setup>
import { inject, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { qrGovernanceRepositoryKey } from '../application/qr/qr-governance-port.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import { useQrGovernance } from '../features/qr-governance/useQrGovernance.js'
import { useSessionStore } from '../stores/session.js'
const auth = useSessionStore(); const { roles, session, transport } = storeToRefs(auth)
const work = useQrGovernance({ repository: inject(qrGovernanceRepositoryKey) })
const vehicleId = ref(''); const pendingAction = ref('')
const labels = { issue: 'ออก QR ใหม่', replace: 'เปลี่ยน QR', revoke: 'เพิกถอน QR' }
async function confirm() { const action = pendingAction.value; pendingAction.value = ''; await work.execute(action, vehicleId.value) }
</script>
<template>
  <PageTemplateComponent eyebrow="การกำกับดูแล" title="จัดการ QR" description="ออก เปลี่ยน หรือเพิกถอน QR สำหรับรหัสยานพาหนะที่ทราบแล้ว">
    <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span> / จัดการ QR</span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>
    <form class="card card-border bg-base-100" @submit.prevent><div class="card-body gap-5">
      <label class="field-stack"><span class="label-text font-semibold">รหัสยานพาหนะ</span><input v-model.trim="vehicleId" class="input input-bordered w-full" required autocomplete="off" /></label>
      <div class="flex flex-wrap gap-3"><button class="btn btn-primary" type="button" :disabled="!vehicleId || work.phase.value === 'submitting'" @click="pendingAction = 'issue'">ออก QR ใหม่</button><button class="btn" type="button" :disabled="!vehicleId || work.phase.value === 'submitting'" @click="pendingAction = 'replace'">เปลี่ยน QR</button><button class="btn btn-error" type="button" :disabled="!vehicleId || work.phase.value === 'submitting'" @click="pendingAction = 'revoke'">เพิกถอน QR</button></div>
    </div></form>
    <div v-if="work.phase.value === 'success'" class="alert alert-success mt-5 items-start"><div><h2 class="font-semibold">ดำเนินการสำเร็จ</h2><p v-if="work.result.value?.token" class="mt-2">Token แสดงครั้งเดียว โปรดคัดลอกและเก็บในช่องทางที่ปลอดภัย</p><code v-if="work.result.value?.token" class="mt-2 block break-all rounded-box bg-base-100 p-3 text-base-content">{{ work.result.value.token }}</code><button class="btn btn-sm mt-3" type="button" @click="work.clearSensitiveResult">ปิดและล้าง Token</button></div></div>
    <div v-else-if="work.phase.value === 'uncertain'" class="alert alert-warning mt-5">ไม่ทราบผลแน่ชัด กรุณาตรวจสถานะก่อนดำเนินการซ้ำ</div>
    <div v-else-if="work.phase.value === 'error'" class="alert alert-error mt-5">ดำเนินการไม่สำเร็จ ({{ work.failure.value?.code }})</div>
    <template #footer><p class="text-sm text-base-content/70">หน้านี้ไม่ให้สิทธิ์ค้นหายานพาหนะโดยอัตโนมัติ และไม่เก็บ QR token ใน browser storage</p></template>
  </PageTemplateComponent>
  <ConfirmDialog :open="Boolean(pendingAction)" :title="`${labels[pendingAction]}หรือไม่`" message="การดำเนินการนี้อาจทำให้ QR เดิมใช้งานไม่ได้" :confirm-label="labels[pendingAction]" :busy="work.phase.value === 'submitting'" @cancel="pendingAction = ''" @confirm="confirm" />
</template>
