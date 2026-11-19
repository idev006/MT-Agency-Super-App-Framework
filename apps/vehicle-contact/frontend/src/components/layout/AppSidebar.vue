<script setup>
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'
import { useSessionStore } from '../../stores/session.js'
import { useUiStore } from '../../stores/ui.js'
import ThemePicker from '../common/ThemePicker.vue'
import AppIcon from '../common/AppIcon.vue'
const auth = useSessionStore()
const ui = useUiStore()
const route = useRoute()
const { menuItems } = storeToRefs(auth)
</script>
<template>
  <aside class="flex min-h-full w-[17rem] flex-col border-r border-base-300 bg-base-100 p-4">
    <RouterLink class="mb-6 flex min-h-14 items-center gap-3 rounded-box px-2" :to="{ name: 'dashboard' }" @click="ui.closeNavigation">
      <span class="p6-brand-mark grid size-11 place-items-center rounded-box bg-neutral text-lg font-semibold text-neutral-content">P6</span>
      <span class="min-w-0"><strong class="block truncate font-semibold">Vehicle Contact</strong><small class="text-base-content/60">ศูนย์ประสานข้อมูลยานพาหนะ</small></span>
    </RouterLink>
    <div class="mb-3 flex items-center justify-between px-2">
      <span class="text-sm font-medium text-base-content/60">เมนูหลัก</span>
      <span class="badge badge-warning">ระบบทดสอบ</span>
    </div>
    <nav class="menu w-full gap-1 p-0 text-base" aria-label="เมนูหลัก">
      <template v-for="item in menuItems" :key="item.id">
        <RouterLink v-if="item.route" class="flex min-h-11 items-center" :to="{ name: item.route }" :aria-current="route.name === item.route ? 'page' : undefined" :class="{ 'menu-active': route.name === item.route }" @click="ui.closeNavigation">
          <AppIcon v-if="item.icon" :name="item.icon" size-class="size-4" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </template>
    </nav>
    <div class="mt-auto space-y-3 pt-6">
      <ThemePicker class="lg:hidden" />
      <div class="alert alert-warning items-start text-sm shadow-none">
        <div><strong class="font-medium">สำหรับการพัฒนาเท่านั้น</strong><p class="mt-1 leading-6">ห้ามใช้ข้อมูลบุคคลจริงในสภาพแวดล้อมนี้</p></div>
      </div>
    </div>
  </aside>
</template>
