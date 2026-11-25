<script setup>
import { computed, inject, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { organizationAdministrationRepositoryKey } from '../application/organizations/organization-administration-port.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import EntityDrawer from '../components/common/EntityDrawer.vue'
import FormDialog from '../components/common/FormDialog.vue'
import ListFilterBar from '../components/common/ListFilterBar.vue'
import PaginationControl from '../components/common/PaginationControl.vue'
import StatusBadge from '../components/common/StatusBadge.vue'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import OrganizationAdministrationPanel from '../features/organizations/components/OrganizationAdministrationPanel.vue'
import OrganizationForm from '../features/organizations/components/OrganizationForm.vue'
import { useOrganizationAdministration } from '../features/organizations/useOrganizationAdministration.js'
import { useSessionStore } from '../stores/session.js'

// D2 (VC-ADR-037 pattern): filter bar → table → drawer (?org=<id>) for edit / disable / enable;
// "เพิ่มหน่วยงาน" is a dialog. Default filter = ACTIVE.
const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const repository = inject(organizationAdministrationRepositoryKey)
const administration = useOrganizationAdministration({ repository, permissions })
const busy = computed(() => administration.actionPhase.value === 'submitting')
const FILTER_DEFAULTS = Object.freeze({ status: 'ACTIVE', type: '', q: '' })
const filterFields = [
  { key: 'status', label: 'สถานะ', options: [{ value: 'ACTIVE', label: 'ใช้งาน' }, { value: 'DISABLED', label: 'ปิดใช้งาน' }, { value: '', label: 'ทั้งหมด' }] },
  { key: 'type', label: 'ประเภท', options: [{ value: '', label: 'ทุกประเภท' }, { value: 'POLICE', label: 'หน่วยงานตำรวจ' }, { value: 'EXTERNAL', label: 'หน่วยงานภายนอก' }] },
]

// parent choices = every ACTIVE police organization (not just the current page)
const parents = ref([])
async function loadParents() {
  try { parents.value = (await repository.list({ page: 1, pageSize: 100, filters: { status: 'ACTIVE', type: 'POLICE' } })).organizations } catch { parents.value = [] }
}
async function reloadAll() { await administration.load(); loadParents() }

const route = useRoute()
const router = useRouter()
const openId = computed(() => (typeof route.query.org === 'string' ? route.query.org : ''))
const openOrg = computed(() => administration.organizations.value.find((o) => o.organizationId === openId.value) || null)
let pushedHere = false
function openManage(org) { administration.actionPhase.value = 'idle'; pushedHere = true; router.push({ query: { ...route.query, org: org.organizationId } }) }
function closeManage() {
  if (pushedHere) { pushedHere = false; router.back(); return }
  const { org, ...rest } = route.query
  router.replace({ query: rest })
}

const createOpen = ref(false)
async function create(input) { if (await administration.create(input)) { createOpen.value = false; loadParents() } }
async function update(input) { if (await administration.update(input)) loadParents() }
const disableTarget = ref(null)
async function disableConfirmed() { await administration.disable(disableTarget.value.organizationId); disableTarget.value = null; loadParents() }
const enableTarget = ref(null)
async function enableConfirmed() { await administration.enable(enableTarget.value.organizationId); enableTarget.value = null; loadParents() }
const typeLabel = (type) => type === 'POLICE' ? 'หน่วยงานตำรวจ' : 'หน่วยงานภายนอก'
onMounted(reloadAll)
</script>

<template>
  <PageTemplateComponent eyebrow="การดูแลระบบ" title="หน่วยงาน" description="ดูแลโครงสร้างหน่วยงานตำรวจและหน่วยงานภายนอกที่ระบบใช้ตรวจสอบขอบเขตข้อมูล">
    <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span aria-hidden="true"> / </span><span aria-current="page">หน่วยงาน</span></template>
    <template #actions><button v-if="administration.canManage.value" class="btn btn-primary btn-sm" type="button" @click="administration.actionPhase.value = 'idle'; createOpen = true">เพิ่มหน่วยงาน</button></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>
    <ListFilterBar v-if="administration.phase.value !== 'forbidden' && administration.phase.value !== 'unauthenticated'" class="mb-4" :model-value="administration.filters.value" :defaults="FILTER_DEFAULTS" :fields="filterFields" search-label="ค้นหาชื่อหน่วยงาน" :busy="administration.phase.value === 'loading'" @apply="administration.applyFilters" />
    <div v-if="administration.phase.value === 'idle' || administration.phase.value === 'loading'" class="space-y-3" role="status"><span class="sr-only">กำลังโหลดหน่วยงาน</span><div class="skeleton h-12 w-full"></div><div class="skeleton h-12 w-full"></div></div>
    <div v-else-if="administration.phase.value === 'forbidden'" class="alert alert-warning"><span>เซสชันนี้ไม่มีสิทธิ์อ่านข้อมูลหน่วยงาน</span></div>
    <div v-else-if="administration.phase.value === 'unauthenticated'" class="alert alert-warning"><span>เซสชันสิ้นสุดแล้ว กรุณาเข้าสู่ระบบใหม่</span></div>
    <div v-else-if="administration.phase.value === 'error'" class="alert alert-error"><div><strong>โหลดข้อมูลหน่วยงานไม่สำเร็จ</strong><button class="btn btn-sm mt-2" type="button" @click="administration.load">ลองอีกครั้ง</button></div></div>
    <div v-else-if="administration.phase.value === 'empty'" class="alert alert-info"><span>ไม่พบหน่วยงานตามตัวกรอง ลองเปลี่ยนสถานะเป็น “ทั้งหมด” หรือล้างคำค้นหา</span></div>
    <template v-else>
      <template v-if="!openOrg && !createOpen">
        <div v-if="administration.actionPhase.value === 'uncertain'" class="alert alert-warning mb-4"><span>ไม่สามารถยืนยันผลการบันทึกได้ กรุณาโหลดรายการใหม่ก่อนทำซ้ำ</span></div>
        <div v-else-if="administration.actionPhase.value === 'success'" class="alert alert-success mb-4"><span>บันทึกข้อมูลหน่วยงานแล้ว</span></div>
      </template>
      <OrganizationAdministrationPanel :organizations="administration.organizations.value" :total="administration.pagination.value.total" :can-manage="administration.canManage.value" @manage="openManage" />
      <PaginationControl v-if="administration.pagination.value.total" class="mt-4" :page="administration.page.value" :page-size="administration.pageSize.value" :total-items="administration.pagination.value.total" :disabled="administration.phase.value === 'loading'" label="แบ่งหน้ารายการหน่วยงาน" @update:page="administration.changePage" @update:page-size="administration.changePageSize" />
    </template>
  </PageTemplateComponent>

  <EntityDrawer :open="Boolean(openOrg)" :title="openOrg ? `หน่วยงาน ${openOrg.name}` : 'หน่วยงาน'" close-label="กลับไปรายการ" @close="closeManage">
    <template v-if="openOrg">
      <div v-if="administration.actionPhase.value === 'uncertain'" class="alert alert-warning mb-4"><span>ไม่สามารถยืนยันผลการบันทึกได้ กรุณาโหลดรายการใหม่ก่อนทำซ้ำ</span></div>
      <div v-else-if="administration.actionPhase.value === 'error'" class="alert alert-error mb-4"><span>บันทึกไม่สำเร็จ ({{ administration.actionFailure.value?.code }}) ไม่มีการสั่งซ้ำอัตโนมัติ</span></div>
      <div v-else-if="administration.actionPhase.value === 'success'" class="alert alert-success mb-4"><span>บันทึกข้อมูลหน่วยงานแล้ว</span></div>
      <section class="card card-border mb-4 bg-base-100 shadow-none"><div class="card-body gap-2 p-5">
        <div class="flex flex-wrap items-center justify-between gap-2"><h3 class="font-semibold">{{ openOrg.name }}</h3><StatusBadge :status="openOrg.status" /></div>
        <p class="text-sm text-base-content/80">{{ typeLabel(openOrg.type) }}<span v-if="openOrg.parentName"> · ภายใต้ {{ openOrg.parentName }}</span></p>
      </div></section>
      <section v-if="openOrg.status === 'ACTIVE'" class="card card-border mb-4 bg-base-100 shadow-none"><div class="card-body gap-3 p-5">
        <h3 class="font-semibold">แก้ไขหน่วยงาน</h3>
        <OrganizationForm :organization="openOrg" :parents="parents" :busy="busy" :can-manage="administration.canManage.value" @update="update" />
      </div></section>
      <section v-if="administration.canManage.value" class="card card-border bg-base-100 shadow-none"><div class="card-body gap-3 p-5">
        <h3 class="font-semibold">สถานะหน่วยงาน</h3>
        <div v-if="openOrg.status === 'ACTIVE'" class="flex flex-wrap items-center justify-between gap-2"><p class="text-sm text-base-content/80">ปิดใช้งานแล้วจะไม่พร้อมสำหรับงานใหม่ ประวัติเดิมยังคงอยู่</p><button class="btn btn-error btn-sm" type="button" :disabled="busy" @click="disableTarget = openOrg">ปิดใช้งาน</button></div>
        <div v-else class="flex flex-wrap items-center justify-between gap-2"><p class="text-sm text-base-content/80">หน่วยงานนี้ปิดใช้งานอยู่</p><button class="btn btn-primary btn-sm" type="button" :disabled="busy" @click="enableTarget = openOrg">เปิดใช้งานอีกครั้ง</button></div>
      </div></section>
    </template>
  </EntityDrawer>

  <FormDialog :open="createOpen" title="เพิ่มหน่วยงาน" @close="createOpen = false">
    <div v-if="administration.actionPhase.value === 'error' || administration.actionPhase.value === 'uncertain'" class="alert alert-error mb-4" role="alert"><span>บันทึกไม่สำเร็จ ({{ administration.actionFailure.value?.code }})</span></div>
    <OrganizationForm :parents="parents" :busy="busy" :can-manage="administration.canManage.value" @create="create" @cancel="createOpen = false" />
  </FormDialog>

  <ConfirmDialog :open="Boolean(disableTarget)" title="ปิดใช้งานหน่วยงานหรือไม่" :message="`หน่วยงาน ${disableTarget?.name || ''} จะไม่พร้อมสำหรับงานใหม่ แต่ประวัติเดิมยังคงอยู่`" confirm-label="ปิดใช้งาน" :busy="busy" @cancel="disableTarget = null" @confirm="disableConfirmed" />
  <ConfirmDialog :open="Boolean(enableTarget)" title="เปิดใช้งานหน่วยงานอีกครั้งหรือไม่" :message="`หน่วยงาน ${enableTarget?.name || ''} จะกลับมาใช้กับงานใหม่ได้ และบันทึกประวัติการเปิดใช้งาน`" confirm-label="เปิดใช้งานอีกครั้ง" :busy="busy" @cancel="enableTarget = null" @confirm="enableConfirmed" />
</template>
