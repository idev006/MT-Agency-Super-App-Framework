<script setup>
import { computed } from 'vue'

// D1: one status vocabulary + colour for the whole app; never wraps (owner audit P2-9).
const STATUS = Object.freeze({
  ACTIVE: { label: 'ใช้งาน', tone: 'badge-success' },
  INACTIVE: { label: 'ระงับ', tone: 'badge-ghost' },
  SUSPENDED: { label: 'ระงับการใช้งาน', tone: 'badge-warning' },
  DISABLED: { label: 'ปิดใช้งาน', tone: 'badge-ghost' },
  REVOKED: { label: 'เพิกถอนแล้ว', tone: 'badge-ghost' },
  PENDING_APPROVAL: { label: 'รอตรวจ', tone: 'badge-info' },
  APPROVED: { label: 'อนุมัติแล้ว', tone: 'badge-success' },
  REJECTED: { label: 'ปฏิเสธ', tone: 'badge-error' },
})
const props = defineProps({ status: { type: String, default: '' }, size: { type: String, default: 'badge-sm' } })
const view = computed(() => STATUS[props.status] || { label: props.status || '—', tone: 'badge-ghost' })
</script>

<template>
  <span class="badge whitespace-nowrap" :class="[view.tone, size]">{{ view.label }}</span>
</template>
