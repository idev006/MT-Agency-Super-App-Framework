<script setup>
import { computed, reactive, ref, watch } from 'vue'
import ConfirmDialog from '../../../components/common/ConfirmDialog.vue'
import StatusBadge from '../../../components/common/StatusBadge.vue'
import { roleLabels } from '../../../domain/identity/role-presentation.js'
import { FULL_HUMAN_ADMIN_ROLES, USER_ROLES } from '../useUserAdministration.js'

// D2: management of ONE account, shown inside the EntityDrawer opened from the users table.
const props = defineProps({
  user: { type: Object, required: true },
  currentUserId: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  organizations: { type: Array, default: () => [] },
})
const emit = defineEmits(['update', 'confirmed'])
const editForm = reactive({ displayName: '', organizationId: '' })
const temporaryPassword = ref('')
const selectedRoles = ref(['STAFF'])
const pending = ref(null)
const selectedSelf = computed(() => props.user.userId === props.currentUserId)
const selectedSuspended = computed(() => props.user.status === 'SUSPENDED')
const selectedRoleLabels = computed(() => selectedRoles.value.map((role) => roleLabels[role] || role).join(', '))
// keep the current organization selectable even when it is not in the ACTIVE list
const organizationOptions = computed(() => {
  const list = [...props.organizations]
  if (props.user.organizationId && !list.some((o) => o.organizationId === props.user.organizationId)) list.unshift({ organizationId: props.user.organizationId, name: props.user.organizationName || 'หน่วยงานปัจจุบัน' })
  return list
})

watch(() => props.user, (user) => {
  editForm.displayName = user?.displayName || ''
  editForm.organizationId = user?.organizationId || ''
  temporaryPassword.value = ''
  selectedRoles.value = user?.roles?.length ? [...user.roles] : (selectedSelf.value ? ['SYSTEM_ADMIN'] : ['STAFF'])
}, { immediate: true })

const changed = computed(() => editForm.displayName.trim() !== (props.user.displayName || '') || editForm.organizationId !== (props.user.organizationId || ''))
function submitUpdate() {
  const payload = { userId: props.user.userId }
  if (editForm.displayName.trim()) payload.displayName = editForm.displayName.trim()
  if (editForm.organizationId) payload.organizationId = editForm.organizationId
  emit('update', payload)
}
function applyFullAccessProfile() { selectedRoles.value = [...FULL_HUMAN_ADMIN_ROLES] }
function roleDisabled(role) {
  if (selectedSelf.value) return true
  if (role === 'RETENTION_WORKER') return selectedRoles.value.some((item) => item !== 'RETENTION_WORKER')
  return selectedRoles.value.includes('RETENTION_WORKER')
}
function requestAction(kind) { pending.value = { kind, userId: props.user.userId, label: props.user.displayName || props.user.username } }
function confirmAction() {
  if (!pending.value) return
  const payload = { ...pending.value }
  if (payload.kind === 'resetPassword') { payload.temporaryPassword = temporaryPassword.value; temporaryPassword.value = '' }
  if (payload.kind === 'assignRoles') payload.roles = [...selectedRoles.value]
  pending.value = null
  emit('confirmed', payload)
}
const confirmCopy = computed(() => pending.value?.kind === 'reactivate'
  ? { title: 'เปิดใช้งานบัญชีอีกครั้งหรือไม่', message: `บัญชี ${pending.value.label} จะกลับมาเข้าสู่ระบบได้ด้วยรหัสผ่านเดิม และบันทึกประวัติการเปิดใช้งาน`, label: 'เปิดใช้งานอีกครั้ง' }
  : pending.value?.kind === 'suspend'
  ? { title: 'ระงับบัญชีหรือไม่', message: `บัญชี ${pending.value.label} จะเข้าสู่ระบบไม่ได้และทุกเซสชันจะถูกเพิกถอน`, label: 'ระงับบัญชี' }
  : pending.value?.kind === 'resetPassword'
    ? { title: 'รีเซ็ตรหัสผ่านหรือไม่', message: `ทุกเซสชันของ ${pending.value.label} จะถูกเพิกถอน และผู้ใช้ต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบ`, label: 'รีเซ็ตรหัสผ่าน' }
    : { title: 'เปลี่ยนบทบาทหรือไม่', message: `บทบาทเดิมของ ${pending.value?.label || ''} จะถูกแทนที่ด้วย ${selectedRoleLabels.value} และทุกเซสชันจะถูกเพิกถอน`, label: 'เปลี่ยนบทบาท' })
</script>

<template>
  <div class="grid gap-4">
    <section class="card card-border bg-base-100 shadow-none"><div class="card-body gap-3 p-5">
      <div class="flex flex-wrap items-center justify-between gap-2"><h3 class="font-semibold">{{ user.displayName || user.username }}</h3><StatusBadge :status="user.status" /></div>
      <p class="text-sm text-base-content/80">ชื่อผู้ใช้ {{ user.username }} · {{ user.organizationName || 'ยังไม่ผูกหน่วยงาน' }}</p>
      <p v-if="selectedSelf" class="text-sm text-warning">นี่คือบัญชีของคุณ ระบบไม่อนุญาตให้เปลี่ยนบทบาทหรือระงับบัญชีของตนเอง ให้ผู้ดูแลระบบอีกบัญชีดำเนินการแทน</p>
    </div></section>

    <section class="card card-border bg-base-100 shadow-none"><form class="card-body gap-3 p-5" @submit.prevent="submitUpdate">
      <h3 class="font-semibold">ข้อมูลบัญชี</h3>
      <label class="field-stack"><span class="label-text font-medium">ชื่อที่แสดง</span><input v-model="editForm.displayName" class="input input-bordered w-full" maxlength="256" /></label>
      <label class="field-stack"><span class="label-text font-medium">หน่วยงาน</span><select v-model="editForm.organizationId" class="select select-bordered w-full"><option value="" disabled>เลือกหน่วยงาน</option><option v-for="o in organizationOptions" :key="o.organizationId" :value="o.organizationId">{{ o.name }}</option></select></label>
      <div class="flex justify-end"><button class="btn" type="submit" :disabled="busy || !changed || !editForm.displayName.trim()">บันทึกข้อมูลบัญชี</button></div>
    </form></section>

    <section class="card card-border bg-base-100 shadow-none"><div class="card-body gap-3 p-5">
      <h3 class="font-semibold">บทบาท</h3>
      <fieldset><legend class="mb-2 text-sm text-base-content/80">บทบาทใหม่ (แทนที่รายการเดิมทั้งหมด)</legend><div class="grid gap-2 sm:grid-cols-2"><label v-for="role in USER_ROLES" :key="role" class="flex min-h-11 items-center gap-2"><input v-model="selectedRoles" class="checkbox" type="checkbox" :value="role" :disabled="roleDisabled(role)" /><span>{{ roleLabels[role] || role }}</span></label></div></fieldset>
      <div class="flex flex-wrap justify-end gap-2"><button class="btn btn-sm" type="button" :disabled="busy || selectedSelf" title="รวมงานบริหารระบบและงานตรวจสอบการลงทะเบียน ไม่รวมผู้ปฏิบัติงานลบข้อมูล" @click="applyFullAccessProfile">เลือกโปรไฟล์ผู้ดูแลระบบสิทธิ์เต็ม</button><button class="btn" type="button" :disabled="busy || selectedSelf || !selectedRoles.length" @click="requestAction('assignRoles')">เปลี่ยนบทบาท</button></div>
    </div></section>

    <section class="card card-border bg-base-100 shadow-none"><div class="card-body gap-3 p-5">
      <h3 class="font-semibold">ความปลอดภัย</h3>
      <label class="field-stack"><span class="label-text font-medium">รหัสผ่านชั่วคราวใหม่ (อย่างน้อย 12 ตัว)</span><input v-model="temporaryPassword" class="input input-bordered w-full" type="password" minlength="12" maxlength="128" autocomplete="new-password" /></label>
      <div class="flex flex-wrap justify-end gap-2">
        <button class="btn" type="button" :disabled="busy || temporaryPassword.length < 12" @click="requestAction('resetPassword')">รีเซ็ตรหัสผ่าน</button>
        <button v-if="selectedSuspended" class="btn btn-primary" type="button" :disabled="busy" @click="requestAction('reactivate')">เปิดใช้งานอีกครั้ง</button>
        <button v-else class="btn btn-error" type="button" :disabled="busy || selectedSelf" @click="requestAction('suspend')">ระงับบัญชี</button>
      </div>
    </div></section>
  </div>
  <ConfirmDialog :open="Boolean(pending)" :title="confirmCopy.title" :message="confirmCopy.message" :confirm-label="confirmCopy.label" :busy="busy" @cancel="pending = null" @confirm="confirmAction" />
</template>
