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
const expiryTime = computed(() => {
  if (!props.expiresAt || Number.isNaN(Date.parse(props.expiresAt))) return ''
  return new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }).format(new Date(props.expiresAt))
})
const expiryLabel = computed(() => {
  if (!expiryTime.value) return 'กำลังตรวจสอบ'
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short',
  }).format(new Date(props.expiresAt))
})
</script>

<template>
  <!-- R6 (E2E P3): on phones the full strip took ~1/3 of the first screen on every page.
       Phones get one folded line; tablets/desktop keep the full strip. -->
  <details class="operational-context-compact collapse collapse-arrow border border-base-300 bg-base-100 md:hidden" aria-label="บริบทการปฏิบัติงาน">
    <summary class="collapse-title min-h-0 py-2 text-sm">
      <span class="font-medium">{{ presentedRoles }}</span><span v-if="expiryTime" class="text-base-content/80"> · ใช้ได้ถึง {{ expiryTime }} น.</span>
    </summary>
    <div class="collapse-content text-sm">
      <p>เส้นทางเชื่อมต่อ: {{ connectionLabel }} <span class="status status-success" aria-hidden="true"></span> พร้อมใช้งาน</p>
      <p>เซสชันสิ้นสุด: {{ expiryLabel }} (เวลาไทย)</p>
      <p class="sr-only">รหัสบทบาท {{ roles.join(', ') }}</p>
    </div>
  </details>
  <section class="operational-context stats stats-horizontal hidden w-full border border-base-300 bg-base-100 shadow-none md:inline-grid" aria-label="บริบทการปฏิบัติงาน">
    <div class="stat min-w-0">
      <div class="stat-title">หน้าที่ปัจจุบัน</div>
      <div class="stat-value truncate text-base font-semibold" :title="presentedRoles">{{ presentedRoles }}</div>
      <div class="stat-desc sr-only">รหัสบทบาท {{ roles.join(', ') }}</div>
    </div>
    <div class="stat min-w-0">
      <div class="stat-title">เส้นทางเชื่อมต่อ</div>
      <div class="stat-value text-base font-semibold">{{ connectionLabel }}</div>
      <div class="stat-desc flex items-center gap-2"><span class="status status-success" aria-hidden="true"></span>พร้อมใช้งาน</div>
    </div>
    <div class="stat min-w-0">
      <div class="stat-title">เซสชันสิ้นสุด</div>
      <div class="stat-value text-base font-semibold">{{ expiryLabel }}</div>
      <div class="stat-desc">เวลาไทย (Asia/Bangkok)</div>
    </div>
  </section>
</template>
