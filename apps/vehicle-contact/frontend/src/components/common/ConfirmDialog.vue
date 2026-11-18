<script setup>
import { nextTick, ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false }, title: { type: String, required: true },
  message: { type: String, required: true }, confirmLabel: { type: String, default: 'ยืนยัน' },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['confirm', 'cancel'])
const dialog = ref(null)
const cancelButton = ref(null)
let returnFocus = null

watch(() => props.open, async (open) => {
  if (open) {
    returnFocus = document.activeElement
    await nextTick()
    if (!dialog.value?.open) dialog.value?.showModal()
    cancelButton.value?.focus()
    return
  }
  await nextTick()
  const focusTarget = returnFocus
  if (dialog.value?.open) dialog.value.close()
  returnFocus = null
  await nextTick()
  if (focusTarget instanceof HTMLElement && focusTarget.isConnected) focusTarget.focus()
}, { immediate: true, flush: 'sync' })

function cancel(event) {
  event?.preventDefault()
  if (!props.busy) emit('cancel')
}
</script>
<template>
  <Teleport to="body">
    <dialog ref="dialog" class="modal" :aria-labelledby="'confirm-dialog-title'" @cancel="cancel" @click.self="cancel">
      <div class="modal-box max-w-md">
        <h2 id="confirm-dialog-title" class="text-xl font-semibold">{{ title }}</h2>
        <p class="mt-3 leading-7 text-base-content/70">{{ message }}</p>
        <div class="modal-action">
          <button ref="cancelButton" class="btn min-h-11" type="button" :disabled="busy" @click="cancel">ยกเลิก</button>
          <button class="btn btn-error" type="button" :disabled="busy" @click="$emit('confirm')">
            <span v-if="busy" class="loading loading-spinner loading-sm"></span>{{ confirmLabel }}
          </button>
        </div>
      </div>
      <form class="modal-backdrop" method="dialog"><button type="button" aria-label="ปิดหน้าต่างยืนยัน" @click="cancel">ปิด</button></form>
    </dialog>
  </Teleport>
</template>
