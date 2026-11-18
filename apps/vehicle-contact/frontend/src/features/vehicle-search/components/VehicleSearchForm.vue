<script setup>
import { reactive } from 'vue'

defineProps({ busy: { type: Boolean, default: false } })
const emit = defineEmits(['search'])
const fields = reactive({ plate: '', province: '' })
const errors = reactive({ plate: '', province: '' })

function submit() {
  errors.plate = fields.plate.trim() ? '' : 'กรุณาระบุหมายเลขทะเบียน'
  errors.province = /^[A-Za-z0-9_-]{1,32}$/.test(fields.province.trim())
    ? ''
    : 'กรุณาระบุรหัสจังหวัดให้ถูกต้อง เช่น TH-10'
  if (errors.plate || errors.province) return
  emit('search', { plate: fields.plate, province: fields.province })
}
</script>

<template>
  <form class="card card-border bg-base-100 shadow-none" novalidate @submit.prevent="submit">
    <fieldset class="card-body fieldset gap-5 p-5 sm:p-6" :disabled="busy">
      <legend class="fieldset-legend text-lg font-medium">ค้นหาจากทะเบียนรถ</legend>
      <div class="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(12rem,.7fr)_auto] md:items-start">
        <label class="field-stack">
          <span class="label font-medium">หมายเลขทะเบียน</span>
          <input v-model="fields.plate" class="input input-bordered min-h-11 w-full" name="plate" autocomplete="off" maxlength="24" placeholder="กข 1234" :aria-invalid="Boolean(errors.plate)" :aria-describedby="errors.plate ? 'plate-error' : undefined">
          <span v-if="errors.plate" id="plate-error" class="text-sm text-error">{{ errors.plate }}</span>
        </label>
        <label class="field-stack">
          <span class="label font-medium">จังหวัด (รหัส)</span>
          <input v-model="fields.province" class="input input-bordered min-h-11 w-full uppercase" name="province" autocomplete="off" maxlength="32" placeholder="TH-10" :aria-invalid="Boolean(errors.province)" :aria-describedby="errors.province ? 'province-error' : 'province-help'">
          <span v-if="errors.province" id="province-error" class="text-sm text-error">{{ errors.province }}</span>
          <span v-else id="province-help" class="text-sm text-base-content/65">ใช้รหัสจังหวัดตามระบบ</span>
        </label>
        <button class="btn btn-primary min-h-11 md:mt-8" type="submit" :disabled="busy">
          <span v-if="busy" class="loading loading-spinner loading-sm" aria-hidden="true"></span>
          {{ busy ? 'กำลังค้นหา' : 'ค้นหายานพาหนะ' }}
        </button>
      </div>
    </fieldset>
  </form>
</template>
