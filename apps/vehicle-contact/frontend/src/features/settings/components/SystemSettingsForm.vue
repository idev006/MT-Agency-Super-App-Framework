<script setup>
import { reactive, watch } from 'vue'
const props = defineProps({ settings: { type: Object, required: true }, canManage: Boolean, busy: Boolean })
const emit = defineEmits(['save'])
const form = reactive({ idleTimeoutMinutes: 30, retentionDays: 30 })
watch(() => props.settings, (value) => Object.assign(form, value), { immediate: true })
</script>

<template>
  <form class="card card-border max-w-3xl bg-base-100 shadow-none" @submit.prevent="emit('save', { ...form })"><div class="card-body gap-5 p-5 sm:p-6"><div><h2 class="card-title text-xl">นโยบายระบบ</h2><p class="mt-1 leading-6 text-base-content/65">ค่าที่บันทึกมีผลกับ session และวงจรการเก็บข้อมูลของระบบส่วนกลาง</p></div><label class="field-stack"><span class="label-text font-semibold">เวลาว่างสูงสุดของ session (นาที)</span><input v-model.number="form.idleTimeoutMinutes" class="input input-bordered w-full" type="number" min="1" max="480" required :disabled="!canManage || busy" /><span class="text-sm text-base-content/60">1–480 นาที</span></label><label class="field-stack"><span class="label-text font-semibold">ระยะเวลาเก็บข้อมูล (วัน)</span><input v-model.number="form.retentionDays" class="input input-bordered w-full" type="number" min="1" max="3650" required :disabled="!canManage || busy" /><span class="text-sm text-base-content/60">1–3,650 วัน</span></label><div class="card-actions justify-end"><button class="btn btn-primary" type="submit" :disabled="!canManage || busy"><span v-if="busy" class="loading loading-spinner loading-sm"></span>บันทึกการตั้งค่า</button></div></div></form>
</template>
