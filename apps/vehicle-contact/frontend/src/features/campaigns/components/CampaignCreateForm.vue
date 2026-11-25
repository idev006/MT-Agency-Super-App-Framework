<script setup>
import { computed, reactive } from 'vue'
import AppIcon from '../../../components/common/AppIcon.vue'
import ResponsiveDateTimeField from '../../../components/common/ResponsiveDateTimeField.vue'
import { bangkokLocalToIso, bangkokNowInput } from '../../../domain/time/bangkok-date-time.js'

// D2: the create form, shown in a dialog from the campaigns page.
defineProps({ busy: Boolean })
const emit = defineEmits(['create', 'cancel'])
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
}
</script>

<template>
  <form class="grid gap-4" @submit.prevent="submit">
    <p class="text-sm text-base-content/80">ตั้งชื่อให้จำง่าย กำหนดช่วงเวลาไทย (Asia/Bangkok) และจำนวนคำขอสูงสุด</p>
    <label class="field-stack min-w-0"><span class="label-text font-semibold">ชื่อแคมเปญ</span><input v-model="form.name" class="input input-bordered w-full min-w-0" type="text" maxlength="120" placeholder="เช่น ลงทะเบียนรถ สภ.เมือง ธ.ค. 2569" :disabled="busy" /></label>
    <div class="grid min-w-0 gap-4 sm:grid-cols-2"><ResponsiveDateTimeField v-model="form.startsAt" name="campaign-start" label="เริ่มต้น" type="datetime-local" :min="minimumDateTime" required :disabled="busy" help-text="เวลาไทย (Asia/Bangkok)" :error="dateError" /><ResponsiveDateTimeField v-model="form.endsAt" name="campaign-end" label="สิ้นสุด" type="datetime-local" :min="form.startsAt || minimumDateTime" required :disabled="busy" help-text="เวลาไทย (Asia/Bangkok)" :error="dateError" /></div>
    <label class="field-stack min-w-0"><span class="label-text font-semibold">จำนวนคำขอสูงสุด</span><input v-model.number="form.maxSubmissions" class="input input-bordered w-full min-w-0" type="number" min="1" max="100000" required :disabled="busy" /></label>
    <div class="modal-action mt-0"><button class="btn" type="button" @click="emit('cancel')">ยกเลิก</button><button class="btn btn-primary" type="submit" :disabled="busy || !form.startsAt || !form.endsAt || Boolean(dateError)"><span v-if="busy" class="loading loading-spinner loading-sm"></span><AppIcon v-else name="add" />สร้างแคมเปญ</button></div>
  </form>
</template>
