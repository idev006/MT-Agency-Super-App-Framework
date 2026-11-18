<script setup>
import { computed } from 'vue'
import { labelsForRoles } from '../../domain/identity/role-presentation.js'

const props = defineProps({
  roles: { type: Array, default: () => [] },
  transport: { type: String, required: true },
  expiresAt: { type: String, default: '' },
})

const presentedRoles = computed(() => labelsForRoles(props.roles).join(' · ') || 'ยังไม่ได้กำหนดบทบาท')
const connectionLabel = computed(() => props.transport === 'worker' ? 'ผ่าน Cloudflare' : 'เชื่อม GAS โดยตรง')
const expiryLabel = computed(() => {
  if (!props.expiresAt || Number.isNaN(Date.parse(props.expiresAt))) return 'กำลังตรวจสอบ'
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short',
  }).format(new Date(props.expiresAt))
})
</script>

<template>
  <section class="stats stats-vertical w-full border border-base-300 bg-base-100 shadow-none md:stats-horizontal" aria-label="บริบทการปฏิบัติงาน">
    <div class="stat min-w-0">
      <div class="stat-title">หน้าที่ปัจจุบัน</div>
      <div class="stat-value truncate text-lg font-semibold" :title="presentedRoles">{{ presentedRoles }}</div>
      <div class="stat-desc sr-only">รหัสบทบาท {{ roles.join(', ') }}</div>
    </div>
    <div class="stat min-w-0">
      <div class="stat-title">เส้นทางเชื่อมต่อ</div>
      <div class="stat-value text-lg font-semibold">{{ connectionLabel }}</div>
      <div class="stat-desc flex items-center gap-2"><span class="status status-success" aria-hidden="true"></span>พร้อมใช้งาน</div>
    </div>
    <div class="stat min-w-0">
      <div class="stat-title">เซสชันสิ้นสุด</div>
      <div class="stat-value text-lg font-semibold">{{ expiryLabel }}</div>
      <div class="stat-desc">เวลาไทย (Asia/Bangkok)</div>
    </div>
  </section>
</template>
