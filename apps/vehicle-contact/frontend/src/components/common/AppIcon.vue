<script setup>
import { computed } from 'vue'

const icons = Object.freeze({
  dashboard: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'],
  connection: ['M8 12h8', 'M12 8v8', 'M5.5 5.5a9 9 0 0 0 0 13', 'M18.5 5.5a9 9 0 0 1 0 13'],
  account: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4 21a8 8 0 0 1 16 0'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M22 21v-2a4 4 0 0 0-3-3.87'],
  organizations: ['M3 21h18', 'M5 21V8l7-5 7 5v13', 'M9 21v-6h6v6'],
  campaigns: ['M3 11v2', 'M6 9v6l11 4V5L6 9Z', 'M10 16v4'],
  qr: ['M3 3h6v6H3z', 'M15 3h6v6h-6z', 'M3 15h6v6H3z', 'M15 15h2v2h-2z', 'M19 15h2v6h-6v-2'],
  settings: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M12 2v3', 'M12 19v3', 'M4.93 4.93l2.12 2.12', 'M16.95 16.95l2.12 2.12', 'M2 12h3', 'M19 12h3', 'M4.93 19.07l2.12-2.12', 'M16.95 7.05l2.12-2.12'],
  retention: ['M4 7h16', 'M9 11v6', 'M15 11v6', 'M6 7l1 14h10l1-14', 'M9 7V4h6v3'],
  audit: ['M9 11l2 2 4-4', 'M6 3h12v18H6z'],
  previous: ['m15 18-6-6 6-6'],
  next: ['m9 18 6-6-6-6'],
  add: ['M12 5v14', 'M5 12h14'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z'],
})

const props = defineProps({
  name: { type: String, required: true, validator: (value) => ['dashboard', 'connection', 'account', 'users', 'organizations', 'campaigns', 'qr', 'settings', 'retention', 'audit', 'previous', 'next', 'add', 'edit'].includes(value) },
  label: { type: String, default: '' },
  sizeClass: { type: String, default: 'size-5' },
})
const paths = computed(() => icons[props.name] || [])
</script>

<template>
  <svg :class="sizeClass" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false" :aria-hidden="label ? undefined : 'true'" :role="label ? 'img' : undefined" :aria-label="label || undefined">
    <path v-for="path in paths" :key="path" :d="path" />
  </svg>
</template>
