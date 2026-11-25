<script setup>
import { computed, inject, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { campaignAdministrationRepositoryKey } from '../application/campaigns/campaign-administration-port.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import EntityDrawer from '../components/common/EntityDrawer.vue'
import FormDialog from '../components/common/FormDialog.vue'
import ListFilterBar from '../components/common/ListFilterBar.vue'
import PaginationControl from '../components/common/PaginationControl.vue'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import CampaignAdministrationPanel from '../features/campaigns/components/CampaignAdministrationPanel.vue'
import CampaignCreateForm from '../features/campaigns/components/CampaignCreateForm.vue'
import CampaignShareTools from '../features/campaigns/components/CampaignShareTools.vue'
import CampaignSummary from '../features/campaigns/components/CampaignSummary.vue'
import { useCampaignAdministration } from '../features/campaigns/useCampaignAdministration.js'
import { campaignDisplayName } from '../domain/campaigns/campaign-link.js'
import { useSessionStore } from '../stores/session.js'

// D2 (VC-ADR-037 pattern): filter bar → table → drawer (?campaign=<id>) with share tools + revoke;
// "สร้างแคมเปญ" is a dialog, and the new campaign's drawer opens right after so the link is one click away.
const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const administration = useCampaignAdministration({ repository: inject(campaignAdministrationRepositoryKey), permissions })
const busy = computed(() => administration.actionPhase.value === 'submitting')
const FILTER_DEFAULTS = Object.freeze({ state: 'CURRENT', q: '' })
const filterFields = [{ key: 'state', label: 'สถานะ', options: [
  { value: 'CURRENT', label: 'เปิดรับ + ยังไม่เริ่ม' }, { value: 'OPEN', label: 'เปิดรับอยู่' }, { value: 'UPCOMING', label: 'ยังไม่เริ่ม' },
  { value: 'ENDED', label: 'หมดเวลาแล้ว' }, { value: 'REVOKED', label: 'เพิกถอนแล้ว' }, { value: '', label: 'ทั้งหมด' },
] }]

const route = useRoute()
const router = useRouter()
const openId = computed(() => (typeof route.query.campaign === 'string' ? route.query.campaign : ''))
const openCampaign = computed(() => administration.campaigns.value.find((c) => c.campaignId === openId.value) || null)
let pushedHere = false
function openManage(campaign) { administration.actionPhase.value = 'idle'; pushedHere = true; router.push({ query: { ...route.query, campaign: campaign.campaignId } }) }
function closeManage() {
  if (pushedHere) { pushedHere = false; router.back(); return }
  const { campaign, ...rest } = route.query
  router.replace({ query: rest })
}

const createOpen = ref(false)
async function create(input) {
  if (!(await administration.create(input))) return
  createOpen.value = false
  const created = administration.campaigns.value.find((c) => c.campaignId === administration.lastCreatedId.value)
  if (created) openManage(created)
}
const revokeTarget = ref(null)
async function revokeConfirmed() { await administration.revoke(revokeTarget.value.campaignId); revokeTarget.value = null }
onMounted(() => administration.load())
</script>

<template>
  <PageTemplateComponent eyebrow="การกำกับการลงทะเบียน" title="แคมเปญลงทะเบียน" description="สร้างช่วงรับลงทะเบียน แชร์ลิงก์หรือ QR ให้ผู้ลงทะเบียน ตรวจสอบโควตา และเพิกถอนแคมเปญที่ไม่ควรใช้งานต่อ">
    <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span aria-hidden="true"> / </span><span aria-current="page">แคมเปญลงทะเบียน</span></template>
    <template #actions><button v-if="administration.canManage.value" class="btn btn-primary btn-sm" type="button" @click="administration.actionPhase.value = 'idle'; createOpen = true">สร้างแคมเปญ</button></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>
    <ListFilterBar v-if="administration.phase.value !== 'forbidden' && administration.phase.value !== 'unauthenticated'" class="mb-4" :model-value="administration.filters.value" :defaults="FILTER_DEFAULTS" :fields="filterFields" search-label="ค้นหาชื่อแคมเปญ" :busy="administration.phase.value === 'loading'" @apply="administration.applyFilters" />
    <div v-if="administration.phase.value === 'idle' || administration.phase.value === 'loading'" class="space-y-3" role="status"><span class="sr-only">กำลังโหลดแคมเปญ</span><div class="skeleton h-12 w-full"></div><div class="skeleton h-12 w-full"></div></div>
    <div v-else-if="administration.phase.value === 'forbidden'" class="alert alert-warning"><span>เซสชันนี้ไม่มีสิทธิ์จัดการแคมเปญ</span></div>
    <div v-else-if="administration.phase.value === 'unauthenticated'" class="alert alert-warning"><span>เซสชันสิ้นสุดแล้ว กรุณาเข้าสู่ระบบใหม่</span></div>
    <div v-else-if="administration.phase.value === 'error'" class="alert alert-error"><div><strong>โหลดแคมเปญไม่สำเร็จ</strong><button class="btn btn-sm mt-2" type="button" @click="administration.load">ลองอีกครั้ง</button></div></div>
    <div v-else-if="administration.phase.value === 'empty'" class="alert alert-info"><span>ไม่พบแคมเปญตามตัวกรอง ลองเลือกสถานะ “ทั้งหมด” หรือสร้างแคมเปญใหม่</span></div>
    <template v-else>
      <div v-if="administration.actionPhase.value === 'uncertain' && !openCampaign" class="alert alert-warning mb-4"><span>ไม่สามารถยืนยันผลคำสั่งได้ กรุณาโหลดรายการใหม่ก่อนทำซ้ำ</span></div>
      <CampaignAdministrationPanel :campaigns="administration.campaigns.value" :total="administration.pagination.value.total" :last-created-id="administration.lastCreatedId.value" @manage="openManage" />
      <PaginationControl v-if="administration.pagination.value.total" class="mt-4" :page="administration.page.value" :page-size="administration.pageSize.value" :total-items="administration.pagination.value.total" :disabled="administration.phase.value === 'loading'" label="แบ่งหน้ารายการแคมเปญ" @update:page="administration.changePage" @update:page-size="administration.changePageSize" />
    </template>
  </PageTemplateComponent>

  <EntityDrawer :open="Boolean(openCampaign)" :title="openCampaign ? `แคมเปญ ${campaignDisplayName(openCampaign)}` : 'แคมเปญ'" close-label="กลับไปรายการ" @close="closeManage">
    <template v-if="openCampaign">
      <div v-if="openCampaign.campaignId === administration.lastCreatedId.value" class="alert alert-success mb-4" role="status"><span>สร้างแคมเปญแล้ว คัดลอกหรือแชร์ลิงก์ลงทะเบียนได้ด้านล่าง กลับมาคัดลอกใหม่ได้ทุกเมื่อ</span></div>
      <div v-if="administration.actionPhase.value === 'error' || administration.actionPhase.value === 'uncertain'" class="alert alert-error mb-4"><span>ดำเนินการไม่สำเร็จ ({{ administration.actionFailure.value?.code }})</span></div>
      <CampaignSummary class="mb-4" :campaign="openCampaign" />
      <section class="card card-border bg-base-100 shadow-none"><div class="card-body gap-3 p-5">
        <h3 class="font-semibold">แชร์ให้ผู้ลงทะเบียน</h3>
        <CampaignShareTools :campaign="openCampaign" :busy="busy" @revoke="revokeTarget = $event" />
      </div></section>
    </template>
  </EntityDrawer>

  <FormDialog :open="createOpen" title="สร้างแคมเปญลงทะเบียน" wide @close="createOpen = false">
    <div v-if="administration.actionPhase.value === 'error' || administration.actionPhase.value === 'uncertain'" class="alert alert-error mb-4" role="alert"><span>สร้างแคมเปญไม่สำเร็จ ({{ administration.actionFailure.value?.code }})</span></div>
    <CampaignCreateForm :busy="busy" @create="create" @cancel="createOpen = false" />
  </FormDialog>

  <ConfirmDialog :open="Boolean(revokeTarget)" title="เพิกถอนแคมเปญหรือไม่" message="ลิงก์ลงทะเบียนของแคมเปญนี้จะใช้ไม่ได้ทันที และการเพิกถอนไม่มีปุ่มย้อนกลับ" confirm-label="เพิกถอนแคมเปญ" :busy="busy" @cancel="revokeTarget = null" @confirm="revokeConfirmed" />
</template>
