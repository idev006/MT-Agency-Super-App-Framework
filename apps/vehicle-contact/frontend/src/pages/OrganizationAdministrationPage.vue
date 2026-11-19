<script setup>
import { inject, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { organizationAdministrationRepositoryKey } from '../application/organizations/organization-administration-port.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import OrganizationAdministrationPanel from '../features/organizations/components/OrganizationAdministrationPanel.vue'
import { useOrganizationAdministration } from '../features/organizations/useOrganizationAdministration.js'
import { useSessionStore } from '../stores/session.js'

const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const administration = useOrganizationAdministration({ repository: inject(organizationAdministrationRepositoryKey), permissions })
const disableTarget = ref(null)
async function disableConfirmed() { await administration.disable(disableTarget.value.organizationId); disableTarget.value = null }
onMounted(() => administration.load())
</script>

<template>
  <PageTemplateComponent eyebrow="การดูแลระบบ" title="หน่วยงาน" description="ดูแลโครงสร้างหน่วยงานตำรวจและหน่วยงานภายนอกที่ระบบใช้ตรวจสอบขอบเขตข้อมูล">
    <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span aria-hidden="true"> / </span><span aria-current="page">หน่วยงาน</span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>
    <div v-if="administration.phase.value === 'idle' || administration.phase.value === 'loading'" class="space-y-3" role="status"><span class="sr-only">กำลังโหลดหน่วยงาน</span><div class="skeleton h-28 w-full"></div><div class="skeleton h-48 w-full"></div></div>
    <div v-else-if="administration.phase.value === 'forbidden'" class="alert alert-warning"><span>เซสชันนี้ไม่มีสิทธิ์อ่านข้อมูลหน่วยงาน</span></div>
    <div v-else-if="administration.phase.value === 'unauthenticated'" class="alert alert-warning"><span>เซสชันสิ้นสุดแล้ว กรุณาเข้าสู่ระบบใหม่</span></div>
    <div v-else-if="administration.phase.value === 'error'" class="alert alert-error"><div><strong>โหลดข้อมูลหน่วยงานไม่สำเร็จ</strong><button class="btn btn-sm mt-2" type="button" @click="administration.load">ลองอีกครั้ง</button></div></div>
    <template v-else>
      <div v-if="administration.actionPhase.value === 'uncertain'" class="alert alert-warning mb-4"><span>ไม่สามารถยืนยันผลการบันทึกได้ กรุณาโหลดรายการใหม่ก่อนทำซ้ำ</span></div>
      <div v-else-if="administration.actionPhase.value === 'error'" class="alert alert-error mb-4"><span>บันทึกไม่สำเร็จ ไม่มีการสั่งซ้ำอัตโนมัติ</span></div>
      <div v-else-if="administration.actionPhase.value === 'success'" class="alert alert-success mb-4"><span>บันทึกข้อมูลหน่วยงานแล้ว</span></div>
      <OrganizationAdministrationPanel :organizations="administration.organizations.value" :can-manage="administration.canManage.value" :busy="administration.actionPhase.value === 'submitting'" @create="administration.create" @update="administration.update" @disable="disableTarget = $event" />
    </template>
    <template #footer><p class="text-sm text-base-content/70">การปิดใช้งานไม่ลบประวัติเดิม และ GAS จะตรวจสิทธิ์ซ้ำทุกคำขอ</p></template>
  </PageTemplateComponent>
  <ConfirmDialog :open="Boolean(disableTarget)" title="ปิดใช้งานหน่วยงานหรือไม่" :message="`หน่วยงาน ${disableTarget?.name || ''} จะไม่พร้อมสำหรับงานใหม่ แต่ประวัติเดิมยังคงอยู่`" confirm-label="ปิดใช้งาน" :busy="administration.actionPhase.value === 'submitting'" @cancel="disableTarget = null" @confirm="disableConfirmed" />
</template>
