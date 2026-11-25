<script setup>
import { storeToRefs } from 'pinia'
import RoleMenuGrid from '../components/dashboard/RoleMenuGrid.vue'
import PendingWorkPanel from '../components/dashboard/PendingWorkPanel.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import { labelsForRoles } from '../domain/identity/role-presentation.js'
import { usePendingWork } from '../features/dashboard/usePendingWork.js'
import { useSessionStore } from '../stores/session.js'
const auth = useSessionStore()
const { roles, permissions, menuItems, session, transport } = storeToRefs(auth)
const pending = usePendingWork(permissions)
</script>
<template>
  <PageTemplateComponent
    eyebrow="ภาพรวมการทำงาน"
    :title="`สวัสดี ${session?.displayName || session?.username || 'ผู้ใช้งาน'}`"
    description="งานที่รอคุณอยู่และงานทั้งหมดตามสิทธิ์ของบัญชีนี้"
  >
    <template #actions>
      <div class="flex flex-wrap gap-2" role="group" aria-label="หน้าที่ของผู้ใช้">
        <span v-for="(label, index) in labelsForRoles(roles)" :key="roles[index]" class="badge badge-ghost" :title="roles[index]">{{ label }}</span>
      </div>
    </template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>
    <PendingWorkPanel :items="pending.items.value" @retry="pending.refresh" />
    <section>
      <div class="mb-5"><h2 class="text-2xl font-semibold">งานทั้งหมดของคุณ</h2><p class="mt-1 leading-7 text-base-content/70">แสดงเฉพาะงานที่บัญชีนี้มีสิทธิ์</p></div>
      <RoleMenuGrid :items="menuItems" />
    </section>
  </PageTemplateComponent>
</template>
