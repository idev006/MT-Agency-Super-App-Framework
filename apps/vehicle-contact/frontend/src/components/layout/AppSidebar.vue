<script setup>
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'
import { useSessionStore } from '../../stores/session.js'
import { useUiStore } from '../../stores/ui.js'
const auth = useSessionStore()
const ui = useUiStore()
const route = useRoute()
const { menuItems } = storeToRefs(auth)
</script>
<template>
  <aside class="flex min-h-full w-72 flex-col border-r border-base-300 bg-base-100 p-4">
    <RouterLink class="mb-6 flex items-center gap-3 px-2" :to="{ name: 'dashboard' }" @click="ui.closeNavigation">
      <span class="grid size-11 place-items-center rounded-xl bg-primary text-lg font-black text-primary-content">P6</span>
      <span><strong class="block">Vehicle Contact</strong><small class="text-base-content/55">Application shell</small></span>
    </RouterLink>
    <nav class="menu w-full gap-1 p-0" aria-label="เมนูหลัก">
      <template v-for="item in menuItems" :key="item.id">
        <RouterLink v-if="item.route" :to="{ name: item.route }" :class="{ 'menu-active': route.name === item.route }" @click="ui.closeNavigation">
          <span class="text-lg" aria-hidden="true">{{ item.icon }}</span><span>{{ item.label }}</span>
        </RouterLink>
        <button v-else class="justify-between opacity-55" type="button" disabled><span class="flex items-center gap-3"><span class="text-lg">{{ item.icon }}</span>{{ item.label }}</span><span class="badge badge-ghost badge-xs">เร็วๆ นี้</span></button>
      </template>
    </nav>
    <div class="mt-auto rounded-2xl bg-base-200 p-4 text-xs leading-5 text-base-content/65">
      เมนูมาจาก Pinia ซึ่งคำนวณจาก role ที่ GAS ส่งกลับ แต่ GAS ยังคงตรวจสิทธิ์ทุก API operation
    </div>
  </aside>
</template>
