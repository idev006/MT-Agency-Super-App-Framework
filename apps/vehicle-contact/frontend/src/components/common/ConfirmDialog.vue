<script setup>
defineProps({
  open: { type: Boolean, default: false }, title: { type: String, required: true },
  message: { type: String, required: true }, confirmLabel: { type: String, default: 'ยืนยัน' },
  busy: { type: Boolean, default: false },
})
defineEmits(['confirm', 'cancel'])
</script>
<template>
  <Teleport to="body">
    <div v-if="open" class="modal modal-open" role="dialog" aria-modal="true" :aria-label="title" @click.self="$emit('cancel')">
      <div class="modal-box max-w-md">
        <h2 class="text-xl font-black">{{ title }}</h2>
        <p class="mt-3 leading-7 text-base-content/70">{{ message }}</p>
        <div class="modal-action">
          <button class="btn" type="button" :disabled="busy" @click="$emit('cancel')">ยกเลิก</button>
          <button class="btn btn-error" type="button" :disabled="busy" @click="$emit('confirm')">
            <span v-if="busy" class="loading loading-spinner loading-sm"></span>{{ confirmLabel }}
          </button>
        </div>
      </div>
      <div class="modal-backdrop bg-neutral/50" aria-hidden="true"></div>
    </div>
  </Teleport>
</template>
