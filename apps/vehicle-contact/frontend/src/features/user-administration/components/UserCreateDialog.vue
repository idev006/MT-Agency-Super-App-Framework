<script setup>
import { reactive, watch } from 'vue'
import FormDialog from '../../../components/common/FormDialog.vue'

// D2: create account in a dialog; organization is chosen from the list (no free-text id).
const props = defineProps({ open: Boolean, busy: Boolean, organizations: { type: Array, default: () => [] }, error: { type: String, default: '' } })
const emit = defineEmits(['close', 'create'])
const form = reactive({ username: '', displayName: '', organizationId: '', temporaryPassword: '' })
watch(() => props.open, (open) => { if (open) Object.assign(form, { username: '', displayName: '', organizationId: '', temporaryPassword: '' }) })
function submit() {
  const payload = { username: form.username.trim(), displayName: form.displayName.trim(), temporaryPassword: form.temporaryPassword }
  if (form.organizationId) payload.organizationId = form.organizationId
  form.temporaryPassword = ''
  emit('create', payload)
}
</script>

<template>
  <FormDialog :open="open" title="สร้างบัญชีผู้ใช้" @close="emit('close')">
    <form class="grid gap-4" @submit.prevent="submit">
      <label class="field-stack"><span class="label-text font-medium">ชื่อผู้ใช้</span><input v-model="form.username" class="input input-bordered w-full" required maxlength="100" autocomplete="off" /></label>
      <label class="field-stack"><span class="label-text font-medium">ชื่อที่แสดง</span><input v-model="form.displayName" class="input input-bordered w-full" required maxlength="256" /></label>
      <label class="field-stack"><span class="label-text font-medium">หน่วยงาน (ถ้ามี)</span><select v-model="form.organizationId" class="select select-bordered w-full"><option value="">ไม่ผูกหน่วยงาน</option><option v-for="o in organizations" :key="o.organizationId" :value="o.organizationId">{{ o.name }}</option></select></label>
      <label class="field-stack"><span class="label-text font-medium">รหัสผ่านชั่วคราว (อย่างน้อย 12 ตัว)</span><input v-model="form.temporaryPassword" class="input input-bordered w-full" type="password" minlength="12" maxlength="128" required autocomplete="new-password" /></label>
      <div v-if="error" class="alert alert-error" role="alert">สร้างบัญชีไม่สำเร็จ ({{ error }}) ตรวจว่าชื่อผู้ใช้ยังไม่ถูกใช้ และรหัสผ่านยาวอย่างน้อย 12 ตัว</div>
      <p class="text-sm text-base-content/80">ผู้ใช้ต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก ส่งรหัสชั่วคราวให้ผู้ใช้ด้วยช่องทางที่ปลอดภัย</p>
      <div class="modal-action mt-0"><button class="btn" type="button" @click="emit('close')">ยกเลิก</button><button class="btn btn-primary" type="submit" :disabled="busy"><span v-if="busy" class="loading loading-spinner loading-sm"></span>สร้างบัญชี</button></div>
    </form>
  </FormDialog>
</template>
