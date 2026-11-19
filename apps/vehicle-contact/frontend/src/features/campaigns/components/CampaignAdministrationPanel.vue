<script setup>
import { computed, reactive } from 'vue'
import AppIcon from '../../../components/common/AppIcon.vue'
import ResponsiveDateTimeField from '../../../components/common/ResponsiveDateTimeField.vue'
import { bangkokLocalToIso, bangkokNowInput, formatBangkokDateTime } from '../../../domain/time/bangkok-date-time.js'
const props = defineProps({ campaigns: { type: Array, required: true }, oneTimeToken: { type: Object, default: null }, busy: Boolean })
const emit = defineEmits(['create', 'revoke', 'dismiss-token'])
const form = reactive({ startsAt: '', endsAt: '', maxSubmissions: 100 })
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
function submit() { if (dateError.value) return; emit('create', { startsAt: bangkokLocalToIso(form.startsAt), endsAt: bangkokLocalToIso(form.endsAt), maxSubmissions: Number(form.maxSubmissions) }) }
const formatDate = (value) => formatBangkokDateTime(value)
</script>

<template>
  <div class="space-y-6">
    <div v-if="oneTimeToken" class="alert alert-warning items-start" role="status"><div class="min-w-0"><h2 class="font-semibold">บันทึกโทเคนแคมเปญตอนนี้</h2><p class="mt-1 leading-6">ระบบจะแสดงค่านี้ครั้งเดียว ห้ามส่งผ่าน log, issue หรือช่องทางสาธารณะ</p><code class="mt-3 block break-all rounded-box bg-base-100 p-3 text-base-content">{{ oneTimeToken.token }}</code><button class="btn btn-sm mt-3" type="button" @click="emit('dismiss-token')">ฉันบันทึกแล้ว ปิดการแสดง</button></div></div>
    <form class="card card-border bg-base-100 shadow-none" @submit.prevent="submit"><div class="card-body gap-4 p-5 sm:p-6"><div><h2 class="card-title text-xl">สร้างแคมเปญลงทะเบียน</h2><p class="mt-1 text-sm text-base-content/65">กำหนดช่วงเวลาไทย (Asia/Bangkok) และจำนวนคำขอสูงสุด</p></div><div class="grid min-w-0 gap-4 md:grid-cols-3"><ResponsiveDateTimeField v-model="form.startsAt" name="campaign-start" label="เริ่มต้น" type="datetime-local" :min="minimumDateTime" required :disabled="busy" help-text="เวลาไทย (Asia/Bangkok)" :error="dateError" /><ResponsiveDateTimeField v-model="form.endsAt" name="campaign-end" label="สิ้นสุด" type="datetime-local" :min="form.startsAt || minimumDateTime" required :disabled="busy" help-text="เวลาไทย (Asia/Bangkok)" :error="dateError" /><label class="field-stack min-w-0"><span class="label-text font-semibold">จำนวนคำขอสูงสุด</span><input v-model.number="form.maxSubmissions" class="input input-bordered w-full min-w-0" type="number" min="1" max="100000" required :disabled="busy" /></label></div><div class="card-actions justify-end"><button class="btn btn-primary" type="submit" :disabled="busy || !form.startsAt || !form.endsAt || Boolean(dateError)"><span v-if="busy" class="loading loading-spinner loading-sm"></span><AppIcon v-else name="add" />สร้างแคมเปญ</button></div></div></form>
    <section class="card card-border bg-base-100 shadow-none" aria-labelledby="campaign-list-title"><div class="card-body p-5 sm:p-6"><h2 id="campaign-list-title" class="card-title text-xl">รายการแคมเปญ</h2><ul class="list mt-4 rounded-box border border-base-300"><li v-for="item in campaigns" :key="item.campaignId" class="list-row grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><strong class="font-medium">{{ formatDate(item.startsAt) }} – {{ formatDate(item.endsAt) }}</strong><p class="mt-1 text-sm text-base-content/65">รับแล้ว {{ item.submittedCount }} / {{ item.maxSubmissions }} รายการ</p><span class="badge badge-sm mt-2" :class="item.status === 'ACTIVE' ? 'badge-success' : 'badge-ghost'">{{ item.status === 'ACTIVE' ? 'ใช้งาน' : 'สิ้นสุด/เพิกถอน' }}</span></div><button v-if="item.status === 'ACTIVE'" class="btn btn-sm btn-error sm:justify-self-end" type="button" :disabled="busy" @click="emit('revoke', item)">เพิกถอน</button></li></ul></div></section>
  </div>
</template>
