<script setup>
import { computed, reactive, watch } from 'vue'

// D2: one form for create (in a dialog) and edit (in the drawer). Parent = an ACTIVE police organization.
const props = defineProps({ organization: { type: Object, default: null }, parents: { type: Array, default: () => [] }, busy: Boolean, canManage: Boolean })
const emit = defineEmits(['create', 'update', 'cancel'])
const form = reactive({ name: '', type: 'POLICE', parentId: '' })
const editing = computed(() => Boolean(props.organization))
watch(() => props.organization, (o) => Object.assign(form, { name: o?.name || '', type: o?.type || 'POLICE', parentId: o?.parentId || '' }), { immediate: true })
watch(() => form.type, (type) => { if (type === 'EXTERNAL') form.parentId = '' })
const parentOptions = computed(() => {
  const list = props.parents.filter((p) => p.organizationId !== props.organization?.organizationId)
  if (form.parentId && !list.some((p) => p.organizationId === form.parentId)) list.unshift({ organizationId: form.parentId, name: props.organization?.parentName || 'หน่วยงานแม่ปัจจุบัน' })
  return list
})
const changed = computed(() => !editing.value || form.name.trim() !== props.organization.name || form.parentId !== (props.organization.parentId || ''))
function submit() {
  const payload = { name: form.name.trim(), parentId: form.parentId }
  if (editing.value) emit('update', { organizationId: props.organization.organizationId, ...payload })
  else emit('create', { ...payload, type: form.type })
}
</script>

<template>
  <form class="grid gap-4" @submit.prevent="submit">
    <label class="field-stack"><span class="label-text font-semibold">ชื่อหน่วยงาน</span><input v-model="form.name" class="input input-bordered w-full" maxlength="200" required :disabled="!canManage || busy" /></label>
    <label class="field-stack"><span class="label-text font-semibold">ประเภท</span><select v-model="form.type" class="select select-bordered w-full" :disabled="editing || !canManage || busy"><option value="POLICE">หน่วยงานตำรวจ</option><option value="EXTERNAL">หน่วยงานภายนอก</option></select></label>
    <label v-if="form.type === 'POLICE'" class="field-stack"><span class="label-text font-semibold">หน่วยงานแม่</span><select v-model="form.parentId" class="select select-bordered w-full" :disabled="!canManage || busy"><option value="">ไม่มีหน่วยงานแม่</option><option v-for="item in parentOptions" :key="item.organizationId" :value="item.organizationId">{{ item.name }}</option></select></label>
    <div class="flex justify-end gap-2"><button v-if="!editing" class="btn" type="button" @click="emit('cancel')">ยกเลิก</button><button class="btn btn-primary" type="submit" :disabled="!canManage || busy || !form.name.trim() || !changed"><span v-if="busy" class="loading loading-spinner loading-sm"></span>{{ editing ? 'บันทึกการแก้ไข' : 'เพิ่มหน่วยงาน' }}</button></div>
  </form>
</template>
