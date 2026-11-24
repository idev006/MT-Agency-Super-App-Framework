<script setup>
import { computed, reactive, ref } from 'vue'
import AppIcon from '../../../components/common/AppIcon.vue'
import ResponsiveDateTimeField from '../../../components/common/ResponsiveDateTimeField.vue'
import { bangkokLocalToIso, bangkokNowInput, formatBangkokDateTime } from '../../../domain/time/bangkok-date-time.js'
import { campaignDisplayName, campaignRegistrationLink } from '../../../domain/campaigns/campaign-link.js'
import { qrImageDataUrl } from '../../../infrastructure/media/qr-image.js'
import { campaignState, copySecret } from '../../common/useOneTimeSecretGuard.js'

// VC-ADR-031 (owner 2026-11-25): the campaign code is not a secret and must stay copyable. Each
// open campaign offers what an admin actually does with it: copy/share the registration LINK (the
// registrant never types the code), show a QR for posters, or copy the bare code.
const props = defineProps({ campaigns: { type: Array, required: true }, lastCreatedId: { type: String, default: '' }, busy: Boolean })
const emit = defineEmits(['create', 'revoke'])
const form = reactive({ name: '', startsAt: '', endsAt: '', maxSubmissions: 100 })
const dateError = computed(() => {
  if (!form.startsAt || !form.endsAt) return ''
  try {
    const start = Date.parse(bangkokLocalToIso(form.startsAt)), end = Date.parse(bangkokLocalToIso(form.endsAt))
    if (start >= end) return 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น'
    if (end <= Date.now()) return 'เวลาสิ้นสุดต้องอยู่ในอนาคต'
    return ''
  } catch { return 'วันที่หรือเวลาไม่ถูกต้อง' }
})
const minimumDateTime = bangkokNowInput()
function submit() {
  if (dateError.value) return
  emit('create', { name: form.name.trim(), startsAt: bangkokLocalToIso(form.startsAt), endsAt: bangkokLocalToIso(form.endsAt), maxSubmissions: Number(form.maxSubmissions) })
  form.name = ''
}
const formatDate = (value) => formatBangkokDateTime(value)
const canShare = typeof globalThis.navigator?.share === 'function'
const created = computed(() => props.campaigns.find((item) => item.campaignId === props.lastCreatedId) || null)

const copied = ref('')
async function copy(item, kind) {
  const text = kind === 'link' ? campaignRegistrationLink(item.campaignToken) : item.campaignToken
  if (await copySecret(text)) {
    copied.value = `${item.campaignId}:${kind}`
    setTimeout(() => { if (copied.value === `${item.campaignId}:${kind}`) copied.value = '' }, 2500)
  }
}
const isCopied = (item, kind) => copied.value === `${item.campaignId}:${kind}`
async function share(item) {
  try { await globalThis.navigator.share({ title: campaignDisplayName(item), text: `ลิงก์ลงทะเบียนยานพาหนะ: ${campaignDisplayName(item)}`, url: campaignRegistrationLink(item.campaignToken) }) } catch { /* user cancelled */ }
}

const qrDialog = ref(null)
const qrFor = ref(null)
const qrImage = computed(() => (qrFor.value ? qrImageDataUrl(campaignRegistrationLink(qrFor.value.campaignToken)) : ''))
function openQr(item) { qrFor.value = item; qrDialog.value?.showModal?.() }
function closeQr() { qrDialog.value?.close?.(); qrFor.value = null }
const progress = (item) => Math.min(100, Math.round((Number(item.submittedCount) / Math.max(1, Number(item.maxSubmissions))) * 100))
</script>

<template>
  <div class="space-y-6">
    <div v-if="created" class="alert alert-success items-start" role="status">

      <div class="min-w-0"><h2 class="font-semibold">สร้างแคมเปญ “{{ campaignDisplayName(created) }}” แล้ว</h2><p class="mt-1 leading-6">คัดลอกหรือแชร์ลิงก์ลงทะเบียนได้จากการ์ดด้านล่าง กลับมาคัดลอกใหม่ได้ทุกเมื่อ</p></div>
    </div>

    <form class="card card-border bg-base-100 shadow-none" @submit.prevent="submit"><div class="card-body gap-4 p-5 sm:p-6">
      <div><h2 class="card-title text-xl">สร้างแคมเปญลงทะเบียน</h2><p class="mt-1 text-sm text-base-content/80">ตั้งชื่อให้จำง่าย กำหนดช่วงเวลาไทย (Asia/Bangkok) และจำนวนคำขอสูงสุด</p></div>
      <label class="field-stack min-w-0"><span class="label-text font-semibold">ชื่อแคมเปญ</span><input v-model="form.name" class="input input-bordered w-full min-w-0" type="text" maxlength="120" placeholder="เช่น ลงทะเบียนรถ สภ.เมือง ธ.ค. 2569" :disabled="busy" /></label>
      <div class="grid min-w-0 gap-4 md:grid-cols-3"><ResponsiveDateTimeField v-model="form.startsAt" name="campaign-start" label="เริ่มต้น" type="datetime-local" :min="minimumDateTime" required :disabled="busy" help-text="เวลาไทย (Asia/Bangkok)" :error="dateError" /><ResponsiveDateTimeField v-model="form.endsAt" name="campaign-end" label="สิ้นสุด" type="datetime-local" :min="form.startsAt || minimumDateTime" required :disabled="busy" help-text="เวลาไทย (Asia/Bangkok)" :error="dateError" /><label class="field-stack min-w-0"><span class="label-text font-semibold">จำนวนคำขอสูงสุด</span><input v-model.number="form.maxSubmissions" class="input input-bordered w-full min-w-0" type="number" min="1" max="100000" required :disabled="busy" /></label></div>
      <div class="card-actions justify-end"><button class="btn btn-primary" type="submit" :disabled="busy || !form.startsAt || !form.endsAt || Boolean(dateError)"><span v-if="busy" class="loading loading-spinner loading-sm"></span><AppIcon v-else name="add" />สร้างแคมเปญ</button></div>
    </div></form>

    <section aria-labelledby="campaign-list-title">
      <h2 id="campaign-list-title" class="mb-3 text-xl font-semibold">รายการแคมเปญ</h2>
      <p v-if="!campaigns.length" class="text-base-content/80">ยังไม่มีแคมเปญ</p>
      <ul class="grid gap-4 lg:grid-cols-2">
        <li v-for="item in campaigns" :key="item.campaignId" class="card card-border bg-base-100 shadow-none" :class="{ 'border-success': item.campaignId === lastCreatedId }" :data-campaign="item.campaignId">
          <div class="card-body gap-3 p-5">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <h3 class="min-w-0 break-words text-lg font-semibold">{{ campaignDisplayName(item) }}</h3>
              <span class="badge" :class="campaignState(item).tone">{{ campaignState(item).label }}</span>
            </div>
            <p class="text-sm text-base-content/80">{{ formatDate(item.startsAt) }} – {{ formatDate(item.endsAt) }}</p>
            <div>
              <div class="flex justify-between text-sm"><span>รับแล้ว</span><span class="font-medium">{{ item.submittedCount }} / {{ item.maxSubmissions }}</span></div>
              <progress class="progress progress-primary mt-1 w-full" :value="progress(item)" max="100" :aria-label="`รับแล้ว ${item.submittedCount} จาก ${item.maxSubmissions}`"></progress>
            </div>
            <template v-if="campaignState(item).active">
              <div v-if="item.campaignToken" class="flex flex-wrap gap-2" data-share-actions>
                <button class="btn btn-primary btn-sm" type="button" @click="copy(item, 'link')">{{ isCopied(item, 'link') ? 'คัดลอกลิงก์แล้ว ✓' : 'คัดลอกลิงก์ลงทะเบียน' }}</button>
                <button v-if="canShare" class="btn btn-sm" type="button" @click="share(item)">แชร์</button>
                <button class="btn btn-sm" type="button" @click="openQr(item)"><AppIcon name="qr" />แสดง QR</button>
                <button class="btn btn-ghost btn-sm" type="button" @click="copy(item, 'code')">{{ isCopied(item, 'code') ? 'คัดลอกรหัสแล้ว ✓' : 'คัดลอกรหัส' }}</button>
              </div>
              <p v-else class="text-sm text-base-content/80" data-legacy-campaign>แคมเปญนี้สร้างก่อนระบบเก็บรหัส จึงคัดลอกไม่ได้ ถ้าต้องการแจกลิงก์ให้สร้างแคมเปญใหม่</p>
              <div class="card-actions justify-end"><button class="btn btn-sm btn-ghost text-error" type="button" :disabled="busy" @click="emit('revoke', item)">เพิกถอน</button></div>
            </template>
          </div>
        </li>
      </ul>
    </section>

    <dialog ref="qrDialog" class="modal" aria-labelledby="campaign-qr-title" @close="qrFor = null">
      <div v-if="qrFor" class="modal-box max-w-sm text-center">
        <h2 id="campaign-qr-title" class="text-lg font-semibold">{{ campaignDisplayName(qrFor) }}</h2>
        <p class="mt-1 text-sm text-base-content/80">สแกนด้วยกล้องมือถือเพื่อเปิดหน้าลงทะเบียน</p>
        <img :src="qrImage" alt="QR ลิงก์ลงทะเบียนแคมเปญ" class="mx-auto mt-4 w-64 max-w-full bg-white [image-rendering:pixelated]" />
        <div class="modal-action justify-center">
          <a class="btn btn-primary btn-sm" :href="qrImage" :download="`qr-${campaignDisplayName(qrFor)}.gif`">ดาวน์โหลดภาพ QR</a>
          <button class="btn btn-sm" type="button" @click="closeQr">ปิด</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button>ปิด</button></form>
    </dialog>
  </div>
</template>
