<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import packageInfo from '../../../package.json'
import { useSessionStore } from '../../stores/session.js'

const session = useSessionStore()
const { backendRelease, authenticated, transport, endpoint } = storeToRefs(session)

const channelLabel = computed(() => (transport.value === 'worker' ? 'Cloudflare Worker' : 'GAS Direct (exec)'))
const endpointHost = computed(() => {
  try { return new URL(endpoint.value).host } catch { return endpoint.value || '—' }
})
const databaseLabel = computed(() => {
  const engine = backendRelease.value?.persistence?.engine
  return engine === 'firestore' ? 'Firestore' : engine === 'sheets' ? 'Google Sheets' : 'ไม่ทราบ'
})
const dualWrite = computed(() => backendRelease.value?.persistence?.dualWrite === true)
const statusLabel = computed(() => (backendRelease.value?.status === 'ready' ? 'พร้อมใช้งาน' : backendRelease.value?.status || 'ไม่ทราบ'))
</script>

<template>
  <footer class="border-t border-base-300 bg-base-100 px-4 py-4 text-center text-sm text-base-content/60 sm:px-6">
    <p>P6 Vehicle Contact · สภาพแวดล้อมทดสอบ · ห้ามใช้ข้อมูลบุคคลจริง</p>
    <p class="mt-1 font-mono text-xs">
      Frontend v{{ packageInfo.version }} · Backend API {{ backendRelease?.apiVersion || 'ไม่ทราบ' }} · Service v{{ backendRelease?.backendVersion || 'ไม่ทราบ' }}
    </p>
    <dl v-if="authenticated" class="mx-auto mt-3 grid max-w-3xl grid-cols-1 gap-x-6 gap-y-1 text-left font-mono text-xs sm:grid-cols-2">
      <div class="flex justify-between gap-2 border-b border-base-200 py-1">
        <dt class="text-base-content/50">Frontend</dt>
        <dd class="text-base-content/80">v{{ packageInfo.version }} · Vue shell</dd>
      </div>
      <div class="flex justify-between gap-2 border-b border-base-200 py-1">
        <dt class="text-base-content/50">ช่องทาง Backend</dt>
        <dd class="truncate text-base-content/80" :title="endpoint">{{ channelLabel }} · {{ endpointHost }}</dd>
      </div>
      <div class="flex justify-between gap-2 border-b border-base-200 py-1">
        <dt class="text-base-content/50">API</dt>
        <dd class="text-base-content/80">{{ backendRelease?.apiVersion || '—' }} · {{ statusLabel }}</dd>
      </div>
      <div class="flex justify-between gap-2 border-b border-base-200 py-1">
        <dt class="text-base-content/50">ฐานข้อมูล</dt>
        <dd class="text-base-content/80">{{ databaseLabel }}<span v-if="dualWrite" class="badge badge-xs badge-outline ml-2 align-middle">dual-write</span></dd>
      </div>
    </dl>
  </footer>
</template>