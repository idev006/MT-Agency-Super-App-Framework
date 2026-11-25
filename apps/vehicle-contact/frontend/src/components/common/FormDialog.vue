<script setup>
import { nextTick, ref, useId, watch } from 'vue'

// D2: the standard create/edit dialog (native <dialog>: focus trap, Esc closes). Content in the default
// slot; the host owns the form and closes the dialog (open=false) when the write succeeds.
const props = defineProps({ open: Boolean, title: { type: String, required: true }, wide: Boolean })
const emit = defineEmits(['close'])
const dialog = ref(null)
const titleId = `form-dialog-title-${useId()}`
watch(() => props.open, async (open) => {
  await nextTick()
  if (open && !dialog.value?.open) dialog.value?.showModal?.()
  if (!open && dialog.value?.open) dialog.value.close()
}, { immediate: true })
</script>

<template>
  <dialog ref="dialog" class="modal" :aria-labelledby="titleId" @close="emit('close')">
    <div class="modal-box" :class="wide ? 'max-w-3xl' : 'max-w-lg'">
      <div class="mb-4 flex items-start justify-between gap-3">
        <h2 :id="titleId" class="text-lg font-semibold">{{ title }}</h2>
        <button class="btn btn-ghost btn-sm btn-square" type="button" aria-label="ปิด" @click="emit('close')">✕</button>
      </div>
      <slot v-if="open" />
    </div>
    <form method="dialog" class="modal-backdrop"><button>ปิด</button></form>
  </dialog>
</template>
