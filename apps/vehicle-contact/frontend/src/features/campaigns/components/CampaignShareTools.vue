<script setup>
import { computed, ref } from 'vue'
import AppIcon from '../../../components/common/AppIcon.vue'
import { campaignDisplayName, campaignRegistrationLink } from '../../../domain/campaigns/campaign-link.js'
import { qrImageDataUrl } from '../../../infrastructure/media/qr-image.js'
import { campaignState, copySecret } from '../../common/useOneTimeSecretGuard.js'

// VC-ADR-031 (owner 2026-11-25): the campaign code is not a secret and must stay copyable. What an admin
// actually does with an open campaign: copy/share the registration LINK (the registrant never types the
// code), show a QR for posters, or copy the bare code. D2: shown in the campaign drawer.
const props = defineProps({ campaign: { type: Object, required: true }, busy: Boolean })
const emit = defineEmits(['revoke'])
const canShare = typeof globalThis.navigator?.share === 'function'
const state = computed(() => campaignState(props.campaign))
const copied = ref('')
async function copy(kind) {
  const text = kind === 'link' ? campaignRegistrationLink(props.campaign.campaignToken) : props.campaign.campaignToken
  if (await copySecret(text)) { copied.value = kind; setTimeout(() => { if (copied.value === kind) copied.value = '' }, 2500) }
}
async function share() {
  const item = props.campaign
  try { await globalThis.navigator.share({ title: campaignDisplayName(item), text: `ลิงก์ลงทะเบียนยานพาหนะ: ${campaignDisplayName(item)}`, url: campaignRegistrationLink(item.campaignToken) }) } catch { /* user cancelled */ }
}
const qrDialog = ref(null)
const qrOpen = ref(false)
const qrImage = computed(() => (qrOpen.value ? qrImageDataUrl(campaignRegistrationLink(props.campaign.campaignToken)) : ''))
function openQr() { qrOpen.value = true; qrDialog.value?.showModal?.() }
function closeQr() { qrDialog.value?.close?.(); qrOpen.value = false }
</script>

<template>
  <div class="grid gap-3" :data-campaign="campaign.campaignId">
    <template v-if="state.active">
      <div v-if="campaign.campaignToken" class="flex flex-wrap gap-2" data-share-actions>
        <button class="btn btn-primary btn-sm" type="button" @click="copy('link')">{{ copied === 'link' ? 'คัดลอกลิงก์แล้ว ✓' : 'คัดลอกลิงก์ลงทะเบียน' }}</button>
        <button v-if="canShare" class="btn btn-sm" type="button" @click="share">แชร์</button>
        <button class="btn btn-sm" type="button" @click="openQr"><AppIcon name="qr" />แสดง QR</button>
        <button class="btn btn-ghost btn-sm" type="button" @click="copy('code')">{{ copied === 'code' ? 'คัดลอกรหัสแล้ว ✓' : 'คัดลอกรหัส' }}</button>
      </div>
      <p v-else class="text-sm text-base-content/80" data-legacy-campaign>แคมเปญนี้สร้างก่อนระบบเก็บรหัส จึงคัดลอกไม่ได้ ถ้าต้องการแจกลิงก์ให้สร้างแคมเปญใหม่</p>
      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-base-300 pt-3"><p class="text-sm text-base-content/80">ถ้าลิงก์หลุดไปที่ที่ไม่ต้องการ ให้เพิกถอนแล้วสร้างใหม่</p><button class="btn btn-sm btn-ghost text-error" type="button" :disabled="busy" @click="emit('revoke', campaign)">เพิกถอน</button></div>
    </template>
    <p v-else class="text-sm text-base-content/80">แคมเปญนี้{{ state.label }} ไม่มีลิงก์ให้แชร์</p>

    <dialog ref="qrDialog" class="modal" aria-labelledby="campaign-qr-title" @close="qrOpen = false">
      <div v-if="qrOpen" class="modal-box max-w-sm text-center">
        <h2 id="campaign-qr-title" class="text-lg font-semibold">{{ campaignDisplayName(campaign) }}</h2>
        <p class="mt-1 text-sm text-base-content/80">สแกนด้วยกล้องมือถือเพื่อเปิดหน้าลงทะเบียน</p>
        <img :src="qrImage" alt="QR ลิงก์ลงทะเบียนแคมเปญ" class="mx-auto mt-4 w-64 max-w-full bg-white [image-rendering:pixelated]" />
        <div class="modal-action justify-center">
          <a class="btn btn-primary btn-sm" :href="qrImage" :download="`qr-${campaignDisplayName(campaign)}.gif`">ดาวน์โหลดภาพ QR</a>
          <button class="btn btn-sm" type="button" @click="closeQr">ปิด</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button>ปิด</button></form>
    </dialog>
  </div>
</template>
