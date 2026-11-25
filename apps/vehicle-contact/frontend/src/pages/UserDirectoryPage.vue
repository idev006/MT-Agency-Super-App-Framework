<script setup>
import { computed, inject, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { userDirectoryRepositoryKey } from '../application/users/user-directory-port.js'
import { organizationAdministrationRepositoryKey } from '../application/organizations/organization-administration-port.js'
import EntityDrawer from '../components/common/EntityDrawer.vue'
import ListFilterBar from '../components/common/ListFilterBar.vue'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import PaginationControl from '../components/common/PaginationControl.vue'
import UserDirectoryList from '../features/user-directory/components/UserDirectoryList.vue'
import UserAdministrationPanel from '../features/user-administration/components/UserAdministrationPanel.vue'
import UserCreateDialog from '../features/user-administration/components/UserCreateDialog.vue'
import { USER_ROLES, useUserAdministration } from '../features/user-administration/useUserAdministration.js'
import { useUserDirectory } from '../features/user-directory/useUserDirectory.js'
import { roleLabels } from '../domain/identity/role-presentation.js'
import { useSessionStore } from '../stores/session.js'

// D2 (VC-ADR-037 pattern): filter bar → table → "จัดการ" opens a drawer (?user=<id>, Back closes it);
// "สร้างบัญชี" is a dialog. Filters run on the server before pagination; default = ACTIVE accounts.
const auth = useSessionStore()
const { roles, permissions, session, transport } = storeToRefs(auth)
const repository = inject(userDirectoryRepositoryKey)
const organizationRepository = inject(organizationAdministrationRepositoryKey, null)
const directory = useUserDirectory({ repository, permissions })
const administration = useUserAdministration({ repository, reload: directory.load })
const users = computed(() => directory.result.value?.users || [])
const administrationBusy = computed(() => administration.phase.value === 'submitting')
const errorCopy = computed(() => directory.phase.value === 'recoverable-error'
  ? 'ยังโหลดรายชื่อไม่ได้ ไม่มีข้อมูลผู้ใช้ถูกเปลี่ยนแปลง ลองอีกครั้งได้'
  : 'ระบบไม่สามารถอ่านรายชื่อผู้ใช้ได้ กรุณาแจ้งเจ้าหน้าที่สนับสนุน')

const FILTER_DEFAULTS = Object.freeze({ status: 'ACTIVE', role: '', q: '' })
const filterFields = [
  { key: 'status', label: 'สถานะ', options: [{ value: 'ACTIVE', label: 'ใช้งาน' }, { value: 'SUSPENDED', label: 'ระงับการใช้งาน' }, { value: '', label: 'ทั้งหมด' }] },
  { key: 'role', label: 'บทบาท', options: [{ value: '', label: 'ทุกบทบาท' }, ...USER_ROLES.map((r) => ({ value: r, label: roleLabels[r] || r }))] },
]

// organizations for the select (no free-text organization id)
const organizations = ref([])
async function loadOrganizations() {
  if (!organizationRepository) return
  try { organizations.value = (await organizationRepository.list({ page: 1, pageSize: 100, filters: { status: 'ACTIVE' } })).organizations } catch { organizations.value = [] }
}

const route = useRoute()
const router = useRouter()
const openId = computed(() => (typeof route.query.user === 'string' ? route.query.user : ''))
const openUser = computed(() => users.value.find((u) => u.userId === openId.value) || null)
let pushedHere = false
function openManage(user) { administration.success.value = ''; administration.failure.value = null; pushedHere = true; router.push({ query: { ...route.query, user: user.userId } }) }
function closeManage() {
  if (pushedHere) { pushedHere = false; router.back(); return }
  const { user, ...rest } = route.query
  router.replace({ query: rest })
}

const createOpen = ref(false)
async function create(payload) { if (await administration.createUser(payload)) createOpen.value = false }

onMounted(() => { directory.load(); loadOrganizations() })

async function runConfirmed(action) {
  if (action.kind === 'suspend') await administration.suspendUser(action.userId)
  else if (action.kind === 'reactivate') await administration.reactivateUser(action.userId)
  else if (action.kind === 'resetPassword') await administration.resetPassword(action.userId, action.temporaryPassword)
  else if (action.kind === 'assignRoles') await administration.assignRoles(action.userId, action.roles)
}
</script>

<template>
  <PageTemplateComponent eyebrow="การดูแลระบบ" title="ผู้ใช้และสิทธิ์" description="ค้นหาบัญชี กดจัดการเพื่อแก้ไขข้อมูล บทบาท รหัสผ่าน หรือสถานะบัญชี">
    <template #breadcrumbs><span class="text-base-content"><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span aria-hidden="true"> / </span><span aria-current="page">ผู้ใช้และสิทธิ์</span></span></template>
    <template #actions><button class="btn btn-primary btn-sm" type="button" :disabled="!directory.canReadUsers.value" @click="administration.failure.value = null; createOpen = true">สร้างบัญชี</button></template>
    <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>

    <div v-if="administration.success.value && !openUser" class="alert alert-success mb-4" role="status">{{ administration.success.value }}</div>
    <div v-if="administration.failure.value && !openUser && !createOpen" class="alert alert-error mb-4 items-start" role="alert"><div><strong>ดำเนินการไม่สำเร็จ</strong><p class="mt-1">{{ administration.failure.value.code }}</p><small v-if="administration.failure.value.requestId" class="font-mono">{{ administration.failure.value.requestId }}</small></div></div>

    <ListFilterBar v-if="directory.phase.value !== 'forbidden' && directory.phase.value !== 'unauthenticated'" class="mb-4" :model-value="directory.filters.value" :defaults="FILTER_DEFAULTS" :fields="filterFields" search-label="ค้นหาชื่อ ชื่อผู้ใช้ หรือหน่วยงาน" :busy="directory.phase.value === 'loading'" @apply="directory.applyFilters" />

    <section aria-live="polite" aria-atomic="false">
      <div v-if="directory.phase.value === 'idle' || directory.phase.value === 'loading'" class="space-y-3" role="status"><span class="sr-only">กำลังโหลดรายชื่อผู้ใช้</span><div class="skeleton h-12 w-full"></div><div class="skeleton h-12 w-full"></div><div class="skeleton h-12 w-full"></div></div>
      <div v-else-if="directory.phase.value === 'empty'" class="alert alert-info items-start shadow-none"><div><h2 class="font-medium">ไม่พบบัญชีตามตัวกรอง</h2><p class="mt-1">ลองเปลี่ยนสถานะเป็น “ทั้งหมด” หรือล้างคำค้นหา</p></div></div>
      <div v-else-if="directory.phase.value === 'forbidden'" class="alert alert-warning items-start shadow-none"><div><h2 class="font-medium">ไม่สามารถอ่านรายชื่อได้</h2><p class="mt-1">เซสชันนี้ไม่มีสิทธิ์จัดการผู้ใช้ ไม่มีข้อมูลบัญชีถูกเปิดเผย</p></div></div>
      <div v-else-if="directory.phase.value === 'unauthenticated'" class="alert alert-warning items-start shadow-none"><div><h2 class="font-medium">เซสชันสิ้นสุดแล้ว</h2><p class="mt-1">เข้าสู่ระบบใหม่ก่อนอ่านรายชื่อ</p><RouterLink class="btn btn-sm mt-3" :to="{ name: 'sign-in' }">เข้าสู่ระบบ</RouterLink></div></div>
      <div v-else-if="directory.phase.value === 'recoverable-error' || directory.phase.value === 'error'" class="alert alert-error items-start shadow-none"><div class="w-full"><h2 class="font-medium">โหลดรายชื่อไม่สำเร็จ</h2><p class="mt-1">{{ errorCopy }}</p><button v-if="directory.phase.value === 'recoverable-error'" class="btn btn-sm mt-3" type="button" @click="directory.load">ลองอีกครั้ง</button><details v-if="directory.failure.value?.requestId" class="collapse collapse-arrow mt-3 bg-base-100 text-base-content"><summary class="collapse-title font-medium">รายละเอียดสำหรับเจ้าหน้าที่สนับสนุน</summary><div class="collapse-content break-all font-mono text-sm">{{ directory.failure.value.requestId }}</div></details></div></div>
      <template v-else-if="directory.phase.value === 'success'">
        <UserDirectoryList :users="directory.result.value.users" :total="directory.result.value.pagination.total" @manage="openManage" />
        <PaginationControl class="mt-4" :page="directory.page.value" :page-size="directory.pageSize.value" :total-items="directory.result.value.pagination.total" :disabled="directory.phase.value === 'loading'" label="แบ่งหน้ารายชื่อผู้ใช้" @update:page="directory.changePage" @update:page-size="directory.changePageSize" />
      </template>
    </section>
  </PageTemplateComponent>

  <EntityDrawer :open="Boolean(openUser)" :title="openUser ? `จัดการบัญชี ${openUser.displayName || openUser.username}` : 'จัดการบัญชี'" close-label="กลับไปรายชื่อ" @close="closeManage">
    <div v-if="administration.success.value" class="alert alert-success mb-4" role="status">{{ administration.success.value }}</div>
    <div v-if="administration.failure.value" class="alert alert-error mb-4 items-start" role="alert"><div><strong>ดำเนินการไม่สำเร็จ</strong><p class="mt-1">{{ administration.failure.value.code }}</p><small v-if="administration.failure.value.requestId" class="font-mono">{{ administration.failure.value.requestId }}</small></div></div>
    <UserAdministrationPanel
      v-if="openUser"
      :user="openUser"
      :organizations="organizations"
      :current-user-id="session?.userId || ''"
      :busy="administrationBusy"
      @update="administration.updateUser"
      @confirmed="runConfirmed"
    />
  </EntityDrawer>

  <UserCreateDialog :open="createOpen" :busy="administrationBusy" :organizations="organizations" :error="createOpen ? administration.failure.value?.code || '' : ''" @close="createOpen = false" @create="create" />
</template>
