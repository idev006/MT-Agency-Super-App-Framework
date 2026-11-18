<script setup>
import { storeToRefs } from 'pinia'
import ThemePicker from '../common/ThemePicker.vue'
import { useSessionStore } from '../../stores/session.js'
import { useUiStore } from '../../stores/ui.js'
defineEmits(['request-signout'])
const auth = useSessionStore()
const ui = useUiStore()
const { session, roles, transport } = storeToRefs(auth)
</script>
<template>
  <header class="sticky top-0 z-20 border-b border-base-300 bg-base-100/95 backdrop-blur">
    <div class="navbar gap-3 px-4 sm:px-6">
      <button class="btn btn-ghost btn-square lg:hidden" type="button" aria-label="เปิดเมนู" @click="ui.navigationOpen = true">☰</button>
      <div class="min-w-0 flex-1">
        <strong class="block truncate">ระบบประสานข้อมูลยานพาหนะ</strong>
        <span class="flex items-center gap-2 text-xs text-base-content/55"><i class="status status-success"></i>{{ transport === 'worker' ? 'ผ่าน Cloudflare Worker' : 'เชื่อม GAS โดยตรง' }}</span>
      </div>
      <ThemePicker class="hidden sm:grid" />
      <div class="hidden text-right md:block">
        <span class="block text-sm font-bold">{{ session?.displayName || session?.username || 'ผู้ใช้งาน' }}</span>
        <span class="block text-xs text-base-content/55">{{ roles.join(', ') || 'ไม่มีบทบาท' }}</span>
      </div>
      <button class="btn btn-outline btn-sm" type="button" @click="$emit('request-signout')">ออกจากระบบ</button>
    </div>
  </header>
</template>
