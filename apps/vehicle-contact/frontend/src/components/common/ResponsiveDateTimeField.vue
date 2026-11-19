<script setup>
import { computed, useId } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  type: { type: String, default: 'datetime-local', validator: (value) => ['date', 'time', 'datetime-local'].includes(value) },
  name: { type: String, required: true },
  label: { type: String, required: true },
  min: { type: String, default: '' },
  max: { type: String, default: '' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  helpText: { type: String, default: '' },
  error: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])
const fieldId = useId()
const helpId = `${fieldId}-help`
const errorId = `${fieldId}-error`
const describedBy = computed(() => [props.helpText ? helpId : '', props.error ? errorId : ''].filter(Boolean).join(' ') || undefined)
</script>

<template>
  <label class="field-stack min-w-0 max-w-full overflow-hidden" :for="fieldId">
    <span class="label-text font-semibold">{{ label }}</span>
    <input :id="fieldId" class="input input-bordered w-full min-w-0 max-w-full" :class="{ 'input-error': error }" :type="type" :name="name" :value="modelValue" :min="min || undefined" :max="max || undefined" :required="required" :disabled="disabled" :aria-describedby="describedBy" :aria-invalid="error ? 'true' : undefined" @input="emit('update:modelValue', $event.target.value)" />
    <span v-if="helpText" :id="helpId" class="text-sm leading-6 text-base-content/60">{{ helpText }}</span>
    <span v-if="error" :id="errorId" class="text-sm leading-6 text-error" role="alert">{{ error }}</span>
  </label>
</template>
