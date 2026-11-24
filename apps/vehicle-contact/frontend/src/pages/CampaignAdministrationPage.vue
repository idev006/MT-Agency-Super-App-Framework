<script setup>
import { inject, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { campaignAdministrationRepositoryKey } from '../application/campaigns/campaign-administration-port.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import PaginationControl from '../components/common/PaginationControl.vue'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import CampaignAdministrationPanel from '../features/campaigns/components/CampaignAdministrationPanel.vue'
import { useCampaignAdministration } from '../features/campaigns/useCampaignAdministration.js'
import { useSessionStore } from '../stores/session.js'

const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const administration = useCampaignAdministration({ repository: inject(campaignAdministrationRepositoryKey), permissions })
const revokeTarget = ref(null)
async function revokeConfirmed() { await administration.revoke(revokeTarget.value.campaignId); revokeTarget.value = null }
onMounted(() => administration.load())
</script>

<template>
  <PageTemplateComponent eyebrow="การกำกับการลงทะเบียน" title="แคมเปญลงทะเบียน" description="สร้างช่วงรับลงทะเบียน แชร์ลิงก์หรือ QR ให้ผู้ลงทะเบียน ตรวจสอบโควตา และเพิกถอนแคมเปญที่ไม่ควรใช้งานต่อ">
    <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span aria-hidden="true"> / </span><span aria-current="page">แคมเปญลงทะเบียน</span></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>
    <div v-if="administration.phase.value === 'idle' || administration.phase.value === 'loading'" class="space-y-3" role="status"><span class="sr-only">กำลังโหลดแคมเปญ</span><div class="skeleton h-32 w-full"></div><div class="skeleton h-48 w-full"></div></div>
    <div v-else-if="administration.phase.value === 'forbidden'" class="alert alert-warning"><span>เซสชันนี้ไม่มีสิทธิ์จัดการแคมเปญ</span></div>
    <div v-else-if="administration.phase.value === 'unauthenticated'" class="alert alert-warning"><span>เซสชันสิ้นสุดแล้ว กรุณาเข้าสู่ระบบใหม่</span></div>
    <div v-else-if="administration.phase.value === 'error'" class="alert alert-error"><div><strong>โหลดแคมเปญไม่สำเร็จ</strong><button class="btn btn-sm mt-2" type="button" @click="administration.load">ลองอีกครั้ง</button></div></div>
    <template v-else>
      <div v-if="administration.actionPhase.value === 'uncertain'" class="alert alert-warning mb-4"><span>ไม่สามารถยืนยันผลคำสั่งได้ กรุณาโหลดรายการใหม่ก่อนทำซ้ำ</span></div>
      <div v-else-if="administration.actionPhase.value === 'error'" class="alert alert-error mb-4"><span>ดำเนินการแคมเปญไม่สำเร็จ</span></div>
      <CampaignAdministrationPanel :campaigns="administration.campaigns.value" :last-created-id="administration.lastCreatedId.value" :busy="administration.actionPhase.value === 'submitting'" @create="administration.create" @revoke="revokeTarget = $event" />
      <PaginationControl v-if="administration.pagination.value.total" class="mt-4" :page="administration.page.value" :page-size="administration.pageSize.value" :total-items="administration.pagination.value.total" :disabled="administration.phase.value === 'loading'" label="แบ่งหน้ารายการแคมเปญ" @update:page="administration.changePage" @update:page-size="administration.changePageSize" />
    </template>
    <template #footer><p class="text-sm text-base-content/80">ลิงก์ลงทะเบียนคัดลอกได้ตลอดเวลา ถ้าลิงก์หลุดไปที่ที่ไม่ต้องการ ให้เพิกถอนแคมเปญแล้วสร้างใหม่</p></template>
  </PageTemplateComponent>
  <ConfirmDialog :open="Boolean(revokeTarget)" title="เพิกถอนแคมเปญหรือไม่" message="ลิงก์ลงทะเบียนของแคมเปญนี้จะใช้ไม่ได้ทันที และการเพิกถอนไม่มีปุ่มย้อนกลับ" confirm-label="เพิกถอนแคมเปญ" :busy="administration.actionPhase.value === 'submitting'" @cancel="revokeTarget = null" @confirm="revokeConfirmed" />
</template>
