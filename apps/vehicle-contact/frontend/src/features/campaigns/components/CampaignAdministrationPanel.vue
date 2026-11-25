<script setup>
import { ref } from 'vue'
import DataTable from '../../../components/common/DataTable.vue'
import { formatBangkokDateTime } from '../../../domain/time/bangkok-date-time.js'
import { campaignDisplayName, campaignRegistrationLink } from '../../../domain/campaigns/campaign-link.js'
import { campaignState, copySecret } from '../../common/useOneTimeSecretGuard.js'

// D2: campaigns as one DataTable. Open campaigns keep a one-click "คัดลอกลิงก์" in the row (VC-ADR-031:
// the code stays copyable at any time); "จัดการ" opens the drawer with QR / share / code / revoke.
defineProps({ campaigns: { type: Array, required: true }, total: { type: Number, default: 0 }, lastCreatedId: { type: String, default: '' } })
const emit = defineEmits(['manage'])
const columns = [
  { key: 'name', label: 'ชื่อแคมเปญ', kind: 'name' },
  { key: 'period', label: 'ช่วงเวลา (เวลาไทย)', kind: 'date' },
  { key: 'quota', label: 'รับแล้ว / สูงสุด', kind: 'number' },
  { key: 'state', label: 'สถานะ', kind: 'status' },
  { key: 'actions', label: 'การจัดการ', srOnly: true, kind: 'actions' },
]
const formatDate = (value) => formatBangkokDateTime(value)
const copied = ref('')
async function copyLink(item) {
  if (await copySecret(campaignRegistrationLink(item.campaignToken))) { copied.value = item.campaignId; setTimeout(() => { if (copied.value === item.campaignId) copied.value = '' }, 2500) }
}
</script>

<template>
  <section aria-labelledby="campaign-list-title">
    <div class="mb-3 flex items-center justify-between gap-3"><h2 id="campaign-list-title" class="text-lg font-semibold">รายการแคมเปญ</h2><span class="badge badge-neutral">{{ total }} แคมเปญ</span></div>
    <DataTable :columns="columns" :rows="campaigns" row-key="campaignId" label="รายการแคมเปญ">
      <template #cell-name="{ row }"><span :data-campaign-row="row.campaignId">{{ campaignDisplayName(row) }}</span><span v-if="row.campaignId === lastCreatedId" class="badge badge-success badge-sm ml-2">ใหม่</span></template>
      <template #cell-period="{ row }"><span class="whitespace-nowrap text-sm">{{ formatDate(row.startsAt) }} – {{ formatDate(row.endsAt) }}</span></template>
      <template #cell-quota="{ row }"><span class="whitespace-nowrap">{{ row.submittedCount }} / {{ row.maxSubmissions }}</span></template>
      <template #cell-state="{ row }"><span class="badge badge-sm whitespace-nowrap" :class="campaignState(row).tone">{{ campaignState(row).label }}</span></template>
      <template #cell-actions="{ row }"><div class="flex justify-end gap-2 whitespace-nowrap"><button v-if="campaignState(row).active && row.campaignToken" class="btn btn-primary btn-sm" type="button" @click="copyLink(row)">{{ copied === row.campaignId ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์' }}</button><button class="btn btn-sm" type="button" :data-manage-campaign="row.campaignId" @click="emit('manage', row)">จัดการ</button></div></template>
    </DataTable>
  </section>
</template>
