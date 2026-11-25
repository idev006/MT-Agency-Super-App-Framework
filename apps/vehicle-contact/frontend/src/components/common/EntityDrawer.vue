<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

// VC-ADR-037 (owner 2026-11-25): the standard list → detail pattern. Desktop: a panel on the right over
// the kept list; phone: full screen with "กลับไปรายการ". The page that hosts it keeps the open item in
// the URL, so links are shareable and Back closes the drawer. Escape closes; focus moves into the panel
// and returns to the element that opened it.
const props = defineProps({
  open: Boolean,
  title: { type: String, default: '' },
  closeLabel: { type: String, default: 'กลับไปรายการ' },
})
const emit = defineEmits(['close'])
const panel = ref(null)
let opener = null

function onKey(event) { if (event.key === 'Escape') emit('close') }
watch(() => props.open, async (open) => {
  if (open) {
    opener = document.activeElement
    document.addEventListener('keydown', onKey)
    await nextTick()
    panel.value?.focus()
  } else {
    document.removeEventListener('keydown', onKey)
    if (opener && typeof opener.focus === 'function') opener.focus()
    opener = null
  }
}, { immediate: true })
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="entity-drawer fixed inset-0 z-50 flex justify-end">
      <div class="absolute inset-0 hidden bg-black/40 md:block" aria-hidden="true" @click="emit('close')"></div>
      <section ref="panel" class="relative flex h-full w-full flex-col bg-base-200 shadow-xl outline-none md:w-[min(64rem,62vw)]" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1">
        <header class="flex items-center justify-between gap-3 border-b border-base-300 bg-base-100 px-4 py-3">
          <button class="btn btn-sm min-h-11" type="button" @click="emit('close')"><span aria-hidden="true">←</span> {{ closeLabel }}</button>
          <h2 class="min-w-0 truncate text-base font-semibold">{{ title }}</h2>
          <span class="hidden text-xs text-base-content/80 md:inline">กด Esc เพื่อปิด</span>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5"><slot /></div>
      </section>
    </div>
  </Teleport>
</template>
