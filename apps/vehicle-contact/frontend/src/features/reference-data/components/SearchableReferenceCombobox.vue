<script setup>
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'ค้นหาและเลือกรายการ' },
  disabled: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
  label: { type: String, required: true },
})
const emit = defineEmits(['update:modelValue'])
const control = ref(null)
const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
const listboxId = `reference-list-${Math.random().toString(36).slice(2)}`
const selected = computed(() => props.options.find(({ code }) => code === props.modelValue) || null)
const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase('th')
  const rows = needle ? props.options.filter(({ code, label }) => `${label} ${code}`.toLocaleLowerCase('th').includes(needle)) : props.options
  return rows.slice(0, 50)
})

watch(() => props.modelValue, () => { if (!open.value) query.value = selected.value?.label || '' }, { immediate: true })
watch(() => props.options, () => { if (props.modelValue && !selected.value) emit('update:modelValue', '') })
watch([() => props.modelValue, () => props.required], () => nextTick(() => {
  control.value?.setCustomValidity(props.required && !props.modelValue ? 'กรุณาเลือกรายการจากรายการ' : '')
}), { immediate: true })
function show() { if (!props.disabled) { open.value = true; query.value = selected.value?.label || ''; activeIndex.value = 0 } }
function choose(option) { emit('update:modelValue', option.code); query.value = option.label; open.value = false }
function closeLater() { globalThis.setTimeout(() => { open.value = false; query.value = selected.value?.label || '' }, 120) }
async function move(delta) {
  if (!open.value) show()
  await nextTick()
  if (!filtered.value.length) return
  activeIndex.value = (activeIndex.value + delta + filtered.value.length) % filtered.value.length
}
function keydown(event) {
  if (event.key === 'ArrowDown') { event.preventDefault(); move(1) }
  else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1) }
  else if (event.key === 'Enter' && open.value && filtered.value[activeIndex.value]) { event.preventDefault(); choose(filtered.value[activeIndex.value]) }
  else if (event.key === 'Escape') { open.value = false; query.value = selected.value?.label || '' }
}
</script>

<template>
  <div class="relative">
    <input
      ref="control"
      v-model="query"
      class="input input-bordered w-full"
      type="text"
      role="combobox"
      autocomplete="off"
      :aria-label="label"
      :aria-expanded="open"
      :aria-controls="listboxId"
      :aria-activedescendant="open && filtered[activeIndex] ? `${listboxId}-${activeIndex}` : undefined"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required && !modelValue"
      @focus="show"
      @input="open = true; activeIndex = 0; emit('update:modelValue', '')"
      @blur="closeLater"
      @keydown="keydown"
    />
    <ul v-if="open" :id="listboxId" class="menu absolute z-30 mt-1 max-h-64 w-full flex-nowrap overflow-y-auto rounded-box border border-base-300 bg-base-100 p-2 shadow-xl" role="listbox">
      <li v-for="(option, index) in filtered" :key="option.code" :id="`${listboxId}-${index}`" role="option" :aria-selected="option.code === modelValue">
        <button class="flex min-h-11 items-center justify-between gap-3" :class="{ 'menu-active': index === activeIndex }" type="button" @mousedown.prevent @click="choose(option)">
          <span class="min-w-0 truncate">{{ option.label }}</span><span class="shrink-0 font-mono text-xs opacity-60">{{ option.code }}</span>
        </button>
      </li>
      <li v-if="!filtered.length" class="px-3 py-3 text-sm text-base-content/60">ไม่พบรายการที่ค้นหา</li>
    </ul>
  </div>
</template>
