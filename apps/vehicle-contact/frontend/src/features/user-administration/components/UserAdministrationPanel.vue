<script setup>
import { computed, reactive, ref, watch } from 'vue'
import ConfirmDialog from '../../../components/common/ConfirmDialog.vue'
import { USER_ROLES } from '../useUserAdministration.js'

const props = defineProps({ users: { type: Array, required: true }, currentUserId: { type: String, default: '' }, busy: { type: Boolean, default: false } })
const emit = defineEmits(['create', 'update', 'confirmed'])
const createForm = reactive({ username: '', displayName: '', organizationId: '', temporaryPassword: '' })
const selectedUserId = ref('')
const editForm = reactive({ displayName: '', organizationId: '' })
const temporaryPassword = ref('')
const selectedRoles = ref(['STAFF'])
const pending = ref(null)
const selected = computed(() => props.users.find((item) => item.userId === selectedUserId.value) || null)
const selectedSelf = computed(() => selectedUserId.value === props.currentUserId)

watch(selected, (user) => {
  editForm.displayName = user?.displayName || ''
  editForm.organizationId = user?.organizationId || ''
  temporaryPassword.value = ''
  selectedRoles.value = user?.roles?.length ? [...user.roles] : (selectedSelf.value ? ['SYSTEM_ADMIN'] : ['STAFF'])
})

function submitCreate() {
  const payload = { username: createForm.username, displayName: createForm.displayName, temporaryPassword: createForm.temporaryPassword }
  if (createForm.organizationId.trim()) payload.organizationId = createForm.organizationId.trim()
  emit('create', payload)
  createForm.username = ''; createForm.displayName = ''; createForm.organizationId = ''; createForm.temporaryPassword = ''
}
function submitUpdate() {
  const payload = { userId: selectedUserId.value }
  if (editForm.displayName.trim()) payload.displayName = editForm.displayName.trim()
  if (editForm.organizationId.trim()) payload.organizationId = editForm.organizationId.trim()
  emit('update', payload)
}
function requestAction(kind) {
  if (!selected.value) return
  pending.value = { kind, userId: selected.value.userId, label: selected.value.displayName || selected.value.username }
}
function confirmAction() {
  if (!pending.value) return
  const payload = { ...pending.value }
  if (payload.kind === 'resetPassword') { payload.temporaryPassword = temporaryPassword.value; temporaryPassword.value = '' }
  if (payload.kind === 'assignRoles') payload.roles = [...selectedRoles.value]
  pending.value = null
  emit('confirmed', payload)
}
const confirmCopy = computed(() => pending.value?.kind === 'suspend'
  ? { title: 'ระงับบัญชีหรือไม่', message: `บัญชี ${pending.value.label} จะเข้าสู่ระบบไม่ได้และทุกเซสชันจะถูกเพิกถอน`, label: 'ระงับบัญชี' }
  : pending.value?.kind === 'resetPassword'
    ? { title: 'รีเซ็ตรหัสผ่านหรือไม่', message: `ทุกเซสชันของ ${pending.value.label} จะถูกเพิกถอน และผู้ใช้ต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบ`, label: 'รีเซ็ตรหัสผ่าน' }
    : { title: 'เปลี่ยนบทบาทหรือไม่', message: `บทบาทเดิมของ ${pending.value?.label || ''} จะถูกแทนที่ทั้งหมด และทุกเซสชันจะถูกเพิกถอน`, label: 'เปลี่ยนบทบาท' })
</script>

<template>
  <div class="grid gap-5 xl:grid-cols-2">
    <form class="card card-border bg-base-100" @submit.prevent="submitCreate"><div class="card-body gap-4"><h2 class="card-title">สร้างบัญชีผู้ใช้</h2>
      <label class="field-stack"><span class="label-text font-medium">ชื่อผู้ใช้</span><input v-model="createForm.username" class="input input-bordered w-full" required maxlength="100" autocomplete="off" /></label>
      <label class="field-stack"><span class="label-text font-medium">ชื่อที่แสดง</span><input v-model="createForm.displayName" class="input input-bordered w-full" required maxlength="256" /></label>
      <label class="field-stack"><span class="label-text font-medium">รหัสหน่วยงาน (ถ้ามี)</span><input v-model="createForm.organizationId" class="input input-bordered w-full" maxlength="256" /></label>
      <label class="field-stack"><span class="label-text font-medium">รหัสผ่านชั่วคราว</span><input v-model="createForm.temporaryPassword" class="input input-bordered w-full" type="password" minlength="12" maxlength="128" required autocomplete="new-password" /></label>
      <div class="card-actions justify-end"><button class="btn btn-primary" type="submit" :disabled="busy">สร้างบัญชี</button></div>
    </div></form>

    <section class="card card-border bg-base-100"><div class="card-body gap-4"><h2 class="card-title">จัดการบัญชี</h2>
      <label class="field-stack"><span class="label-text font-medium">เลือกบัญชี</span><select v-model="selectedUserId" class="select select-bordered w-full"><option value="">เลือกบัญชี</option><option v-for="user in users" :key="user.userId" :value="user.userId">{{ user.displayName || user.username }} — {{ user.username }}</option></select></label>
      <template v-if="selected">
        <div class="divider">ข้อมูลบัญชี</div>
        <label class="field-stack"><span class="label-text font-medium">ชื่อที่แสดง</span><input v-model="editForm.displayName" class="input input-bordered w-full" /></label>
        <label class="field-stack"><span class="label-text font-medium">รหัสหน่วยงาน</span><input v-model="editForm.organizationId" class="input input-bordered w-full" /></label>
        <button class="btn" type="button" :disabled="busy || (!editForm.displayName.trim() && !editForm.organizationId.trim())" @click="submitUpdate">บันทึกข้อมูลบัญชี</button>
        <div class="divider">บทบาทและความปลอดภัย</div>
        <fieldset><legend class="mb-2 font-medium">บทบาทใหม่ (แทนที่รายการเดิมทั้งหมด)</legend><div class="grid gap-2 sm:grid-cols-2"><label v-for="role in USER_ROLES" :key="role" class="flex min-h-11 items-center gap-2"><input v-model="selectedRoles" class="checkbox" type="checkbox" :value="role" :disabled="selectedSelf && role === 'SYSTEM_ADMIN'" /><span>{{ role }}</span></label></div></fieldset>
        <button class="btn" type="button" :disabled="busy || !selectedRoles.length" @click="requestAction('assignRoles')">เปลี่ยนบทบาท</button>
        <label class="field-stack"><span class="label-text font-medium">รหัสผ่านชั่วคราวใหม่</span><input v-model="temporaryPassword" class="input input-bordered w-full" type="password" minlength="12" maxlength="128" autocomplete="new-password" /></label>
        <button class="btn" type="button" :disabled="busy || temporaryPassword.length < 12" @click="requestAction('resetPassword')">รีเซ็ตรหัสผ่าน</button>
        <button class="btn btn-error" type="button" :disabled="busy || selectedSelf" @click="requestAction('suspend')">ระงับบัญชี</button>
        <p v-if="selectedSelf" class="text-sm text-warning">ระบบไม่อนุญาตให้ระงับหรือลบบทบาท SYSTEM_ADMIN ของบัญชีตนเอง</p>
      </template>
    </div></section>
  </div>
  <ConfirmDialog :open="Boolean(pending)" :title="confirmCopy.title" :message="confirmCopy.message" :confirm-label="confirmCopy.label" :busy="busy" @cancel="pending = null" @confirm="confirmAction" />
</template>
