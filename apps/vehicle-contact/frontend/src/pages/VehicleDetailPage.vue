<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import VehicleDetailPanel from '../features/vehicle-search/components/VehicleDetailPanel.vue'
import { useSessionStore } from '../stores/session.js'

const route = useRoute()
const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
// R7: breadcrumb follows where the user came from (registry vs search).
const fromRegistry = computed(() => route.query.from === 'registry')
const permissionSet = computed(() => new Set(permissions.value))
</script>

<template>
  <PageTemplateComponent eyebrow="งานค้นหา" title="รายละเอียดยานพาหนะ" description="ดูข้อมูล ผู้ประสานงาน รูปประกอบ และประวัติตามสิทธิ์ของเซสชันนี้">
    <template #breadcrumbs><span class="text-base-content"><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span aria-hidden="true"> / </span><RouterLink v-if="fromRegistry" class="link" :to="{ name: 'vehicle-registry' }">ทะเบียนยานพาหนะ</RouterLink><RouterLink v-else class="link" :to="{ name: 'vehicle-search' }">ค้นหายานพาหนะ</RouterLink><span aria-hidden="true"> / </span><span aria-current="page">รายละเอียด</span></span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>
    <template #toolbar><div class="flex gap-2"><RouterLink class="btn btn-sm" :to="{ name: fromRegistry ? 'vehicle-registry' : 'vehicle-search' }">{{ fromRegistry ? 'กลับไปทะเบียน' : 'ค้นหาใหม่' }}</RouterLink><RouterLink v-if="permissionSet.has('vehicle.update') && String(route.params.vehicleId || '')" class="btn btn-sm btn-primary" :to="{ name: 'vehicle-maintenance', params: { vehicleId: String(route.params.vehicleId || '') } }">แก้ไขข้อมูล</RouterLink><RouterLink v-if="permissionSet.has('qr.manage') && String(route.params.vehicleId || '')" class="btn btn-sm" :to="{ name: 'qr-governance', query: { vehicleId: String(route.params.vehicleId || '') } }">จัดการ QR</RouterLink></div></template>

    <VehicleDetailPanel :vehicle-id="String(route.params.vehicleId || '')" />
  </PageTemplateComponent>
</template>