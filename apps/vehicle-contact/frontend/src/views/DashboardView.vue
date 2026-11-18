<script setup>
import { storeToRefs } from 'pinia'
import RoleMenuGrid from '../components/dashboard/RoleMenuGrid.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import { useSessionStore } from '../stores/session.js'
const auth = useSessionStore()
const { roles, menuItems, session, transport } = storeToRefs(auth)
</script>
<template>
  <PageTemplateComponent
    eyebrow="Dashboard ตามบทบาท"
    :title="`สวัสดี ${session?.displayName || session?.username || 'ผู้ใช้งาน'}`"
    description="PageComponent นี้วางเนื้อหาลงใน PageTemplateComponent ขณะที่ AppShell ดูแล header, sidebar และ footer ของทั้งแอป"
  >
    <template #actions><div class="flex flex-wrap gap-2"><span v-for="role in roles" :key="role" class="badge badge-primary badge-outline">{{ role }}</span></div></template>
    <template #status>
      <div class="grid overflow-hidden rounded-2xl border border-base-300 bg-base-100 sm:grid-cols-3">
        <div class="p-4 sm:p-5"><span class="text-xs text-base-content/50">TRANSPORT</span><strong class="mt-1 block">{{ transport === 'worker' ? 'Cloudflare Worker' : 'Direct GAS' }}</strong></div>
        <div class="border-base-300 p-4 sm:border-x sm:p-5"><span class="text-xs text-base-content/50">SESSION</span><strong class="mt-1 block text-success">Active</strong></div>
        <div class="p-4 sm:p-5"><span class="text-xs text-base-content/50">เมนูที่ใช้ได้</span><strong class="mt-1 block">{{ menuItems.length }} รายการ</strong></div>
      </div>
    </template>
    <section><div class="mb-4"><h2 class="text-xl font-black">งานของคุณ</h2><p class="text-sm text-base-content/55">คำนวณจาก role ซึ่ง GAS ส่งกลับใน auth.session</p></div><RoleMenuGrid :items="menuItems" /></section>
    <template #footer><p class="text-xs text-base-content/50">สิทธิ์ที่แสดงใน UI ใช้เพื่อการนำทางเท่านั้น GAS ต้องตรวจสิทธิ์ซ้ำทุก operation</p></template>
  </PageTemplateComponent>
</template>
