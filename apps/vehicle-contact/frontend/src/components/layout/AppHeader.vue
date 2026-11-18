<script setup>
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ThemePicker from '../common/ThemePicker.vue'
import { useSessionStore } from '../../stores/session.js'
import { useUiStore } from '../../stores/ui.js'
defineEmits(['request-signout'])
const auth = useSessionStore()
const ui = useUiStore()
const route = useRoute()
const { session } = storeToRefs(auth)
const pageTitle = computed(() => route.meta.title || 'ระบบประสานข้อมูลยานพาหนะ')
</script>
<template>
  <header class="sticky top-0 z-30 border-b border-base-300 bg-base-100/95 backdrop-blur">
    <div class="navbar min-h-[4.5rem] gap-2 px-4 sm:gap-4 sm:px-6">
      <button class="btn btn-ghost min-h-11 lg:hidden" type="button" @click="ui.navigationOpen = true">เมนู</button>
      <div class="min-w-0 flex-1 border-l-2 border-primary pl-3 lg:border-l-0 lg:pl-0">
        <span class="hidden text-sm text-base-content/60 sm:block">ระบบประสานข้อมูลยานพาหนะ</span>
        <strong class="block truncate text-sm font-medium sm:text-base">{{ pageTitle }}</strong>
      </div>
      <ThemePicker class="hidden lg:grid" />
      <div class="hidden max-w-48 text-right md:block">
        <span class="block truncate text-sm font-medium">{{ session?.displayName || 'ผู้ใช้งาน' }}</span>
        <span class="block truncate text-sm text-base-content/70">รหัสผู้ใช้ {{ session?.userId || '—' }}</span>
      </div>
      <button class="btn btn-outline hidden min-h-11 sm:inline-flex" type="button" @click="$emit('request-signout')">ออกจากระบบ</button>
      <details class="dropdown dropdown-end sm:hidden">
        <summary class="btn btn-outline min-h-11">บัญชี</summary>
        <div class="dropdown-content z-40 mt-2 w-56 rounded-box border border-base-300 bg-base-100 p-3 shadow-lg">
          <p class="truncate font-medium">{{ session?.displayName || 'ผู้ใช้งาน' }}</p>
          <p class="mb-3 truncate text-sm text-base-content/70">รหัสผู้ใช้ {{ session?.userId || '—' }}</p>
          <button class="btn btn-outline min-h-11 w-full" type="button" @click="$emit('request-signout')">ออกจากระบบ</button>
        </div>
      </details>
    </div>
  </header>
</template>
