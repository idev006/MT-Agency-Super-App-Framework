<script setup>
import { storeToRefs } from 'pinia'
import RoleMenuGrid from '../components/dashboard/RoleMenuGrid.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import { labelsForRoles } from '../domain/identity/role-presentation.js'
import { useSessionStore } from '../stores/session.js'
const auth = useSessionStore()
const { roles, menuItems, session, transport } = storeToRefs(auth)
</script>
<template>
  <PageTemplateComponent
    eyebrow="ภาพรวมการทำงาน"
    :title="`สวัสดี ${session?.displayName || session?.username || 'ผู้ใช้งาน'}`"
    description="เลือกงานที่ต้องการดำเนินการ ระบบจะแสดงเฉพาะรายการที่สอดคล้องกับสิทธิ์ของเซสชันนี้"
  >
    <template #actions>
      <div class="flex flex-wrap gap-2" role="group" aria-label="หน้าที่ของผู้ใช้">
        <span v-for="(label, index) in labelsForRoles(roles)" :key="roles[index]" class="badge badge-ghost" :title="roles[index]">{{ label }}</span>
      </div>
    </template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>
    <section>
      <div class="mb-5"><h2 class="text-2xl font-semibold">งานของคุณ</h2><p class="mt-1 leading-7 text-base-content/65">เริ่มจากงานที่พร้อมใช้งาน หรือตรวจสอบรายการที่กำลังพัฒนาสำหรับสิทธิ์ของคุณ</p></div>
      <RoleMenuGrid :items="menuItems" />
    </section>
    <template #footer><p class="text-sm text-base-content/70">ระบบส่วนกลางจะตรวจสอบสิทธิ์อีกครั้งก่อนเปิดเผยข้อมูลหรือบันทึกการเปลี่ยนแปลง</p></template>
  </PageTemplateComponent>
</template>
