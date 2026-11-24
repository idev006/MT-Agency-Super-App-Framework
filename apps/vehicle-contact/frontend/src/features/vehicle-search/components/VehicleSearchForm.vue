<script setup>
import { reactive } from 'vue'
import SearchableReferenceCombobox from '../../reference-data/components/SearchableReferenceCombobox.vue'
import { PROVINCES } from '../../../domain/reference/provinces.js'

defineProps({ busy: { type: Boolean, default: false } })
const emit = defineEmits(['search'])
const fields = reactive({ plate: '', province: '' })
const errors = reactive({ plate: '', province: '' })

function submit() {
  errors.plate = fields.plate.trim() ? '' : 'กรุณาระบุหมายเลขทะเบียน'
  errors.province = PROVINCES.some((p) => p.code === fields.province) ? '' : 'กรุณาเลือกจังหวัดจากรายการ'
  if (errors.plate || errors.province) return
  emit('search', { plate: fields.plate, province: fields.province })
}
</script>

<template>
  <form class="card card-border bg-base-100 shadow-none" novalidate @submit.prevent="submit">
    <fieldset class="card-body fieldset gap-5 p-5 sm:p-6" :disabled="busy">
      <legend class="fieldset-legend text-lg font-medium">ค้นหาจากทะเบียนรถ</legend>
      <div class="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(14rem,.8fr)_auto] md:items-start">
        <label class="field-stack">
          <span class="label font-medium text-base-content">หมายเลขทะเบียน</span>
          <input v-model="fields.plate" class="input input-bordered input-lg min-h-12 w-full text-xl" name="plate" autocomplete="off" maxlength="24" placeholder="เช่น กข 1234" :aria-invalid="Boolean(errors.plate)" :aria-describedby="errors.plate ? 'plate-error' : undefined">
          <span v-if="errors.plate" id="plate-error" class="text-sm font-medium" role="alert">{{ errors.plate }}</span>
        </label>
        <div class="field-stack">
          <span class="label font-medium text-base-content">จังหวัด</span>
          <SearchableReferenceCombobox v-model="fields.province" label="จังหวัด" placeholder="พิมพ์ชื่อจังหวัด" :options="PROVINCES" required />
          <span v-if="errors.province" class="text-sm font-medium" role="alert">{{ errors.province }}</span>
        </div>
        <button class="btn btn-primary btn-lg min-h-12 md:mt-8" type="submit" :disabled="busy">
          <span v-if="busy" class="loading loading-spinner loading-sm" aria-hidden="true"></span>
          {{ busy ? 'กำลังค้นหา…' : 'ค้นหา' }}
        </button>
      </div>
      <p v-if="busy" class="text-sm text-base-content/80" role="status">ระบบส่วนกลางอาจใช้เวลาหลายวินาที กรุณารอ</p>
    </fieldset>
  </form>
</template>
