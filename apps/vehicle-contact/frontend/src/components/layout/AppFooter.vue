<script setup>
import { storeToRefs } from 'pinia'
import packageInfo from '../../../package.json'
import { useSessionStore } from '../../stores/session.js'

const { backendRelease } = storeToRefs(useSessionStore())
</script>

<template>
  <footer class="border-t border-base-300 bg-base-100 px-4 py-4 text-center text-sm text-base-content/60 sm:px-6">
    <p>P6 Vehicle Contact · สภาพแวดล้อมทดสอบ · ห้ามใช้ข้อมูลบุคคลจริง</p>
    <p class="mt-1 font-mono text-xs">
      Frontend v{{ packageInfo.version }} · Backend API {{ backendRelease?.apiVersion || 'ไม่ทราบ' }} · Service v{{ backendRelease?.backendVersion || 'ไม่ทราบ' }}
    </p>
  </footer>
</template>
