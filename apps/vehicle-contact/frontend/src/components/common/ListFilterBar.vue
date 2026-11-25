<script setup>
import { reactive, watch } from 'vue'

// D2 (owner audit: admin lists were cluttered and unfilterable): one filter bar for every admin list.
// Selects apply at once; the text search applies on Enter / "ค้นหา". Filtering happens on the server
// (before pagination), so totals and pages stay correct. `defaults` is what "ล้างตัวกรอง" returns to.
const props = defineProps({
  modelValue: { type: Object, required: true },
  defaults: { type: Object, required: true },
  fields: { type: Array, default: () => [] }, // [{ key, label, options: [{ value, label }] }]
  searchLabel: { type: String, default: 'ค้นหา' },
  searchPlaceholder: { type: String, default: '' },
  busy: Boolean,
})
const emit = defineEmits(['apply'])
const local = reactive({ ...props.modelValue })
watch(() => props.modelValue, (value) => Object.assign(local, value))
const apply = () => emit('apply', { ...local, q: String(local.q || '').trim() })
function reset() { Object.assign(local, props.defaults); apply() }
const isDefault = () => Object.keys(props.defaults).every((k) => String(local[k] || '') === String(props.defaults[k] || ''))
</script>

<template>
  <form class="flex flex-wrap items-end gap-3" role="search" @submit.prevent="apply">
    <label v-for="field in fields" :key="field.key" class="field-stack min-w-36">
      <span class="label-text text-sm font-medium">{{ field.label }}</span>
      <select v-model="local[field.key]" class="select select-bordered select-sm w-full" :disabled="busy" @change="apply">
        <option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    </label>
    <label class="field-stack min-w-48 flex-1">
      <span class="label-text text-sm font-medium">{{ searchLabel }}</span>
      <input v-model="local.q" class="input input-bordered input-sm w-full" type="search" maxlength="100" :placeholder="searchPlaceholder" :disabled="busy" />
    </label>
    <button class="btn btn-sm" type="submit" :disabled="busy">ค้นหา</button>
    <button v-if="!isDefault()" class="btn btn-ghost btn-sm" type="button" :disabled="busy" @click="reset">ล้างตัวกรอง</button>
  </form>
</template>
