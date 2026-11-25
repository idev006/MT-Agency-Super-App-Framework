<script setup>
import { computed, reactive, watch } from 'vue'

const props = defineProps({ organizations: { type: Array, required: true }, canManage: Boolean, busy: Boolean })
const emit = defineEmits(['create', 'update', 'disable', 'enable'])
const form = reactive({ organizationId: '', name: '', type: 'POLICE', parentId: '' })
const editing = computed(() => Boolean(form.organizationId))
const activePoliceOrganizations = computed(() => props.organizations.filter((item) => item.type === 'POLICE' && item.status === 'ACTIVE' && item.organizationId !== form.organizationId))

watch(() => form.type, (type) => { if (type === 'EXTERNAL') form.parentId = '' })
function reset() { Object.assign(form, { organizationId: '', name: '', type: 'POLICE', parentId: '' }) }
function edit(item) { Object.assign(form, { organizationId: item.organizationId, name: item.name, type: item.type, parentId: item.parentId }) }
function submit() {
  const payload = { name: form.name.trim(), parentId: form.parentId }
  if (editing.value) emit('update', { organizationId: form.organizationId, ...payload })
  else emit('create', { ...payload, type: form.type })
}
const typeLabel = (type) => type === 'POLICE' ? 'หน่วยงานตำรวจ' : 'หน่วยงานภายนอก'
</script>

<template>
  <div class="grid gap-6 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
    <form class="card card-border bg-base-100 shadow-none" @submit.prevent="submit">
      <div class="card-body gap-4 p-5 sm:p-6">
        <div><h2 class="card-title text-xl">{{ editing ? 'แก้ไขหน่วยงาน' : 'เพิ่มหน่วยงาน' }}</h2><p class="mt-1 text-sm text-base-content/65">บันทึกเฉพาะข้อมูลโครงสร้างที่ระบบส่วนกลางอนุญาต</p></div>
        <label class="field-stack"><span class="label-text font-semibold">ชื่อหน่วยงาน</span><input v-model="form.name" class="input input-bordered w-full" maxlength="200" required :disabled="!canManage || busy" /></label>
        <label class="field-stack"><span class="label-text font-semibold">ประเภท</span><select v-model="form.type" class="select select-bordered w-full" :disabled="editing || !canManage || busy"><option value="POLICE">หน่วยงานตำรวจ</option><option value="EXTERNAL">หน่วยงานภายนอก</option></select></label>
        <label v-if="form.type === 'POLICE'" class="field-stack"><span class="label-text font-semibold">หน่วยงานแม่</span><select v-model="form.parentId" class="select select-bordered w-full" :disabled="!canManage || busy"><option value="">ไม่มีหน่วยงานแม่</option><option v-for="item in activePoliceOrganizations" :key="item.organizationId" :value="item.organizationId">{{ item.name }}</option></select></label>
        <div class="card-actions justify-end"><button v-if="editing" class="btn" type="button" :disabled="busy" @click="reset">ยกเลิก</button><button class="btn btn-primary" type="submit" :disabled="!canManage || busy || !form.name.trim()"><span v-if="busy" class="loading loading-spinner loading-sm"></span>{{ editing ? 'บันทึกการแก้ไข' : 'เพิ่มหน่วยงาน' }}</button></div>
      </div>
    </form>

    <section class="card card-border bg-base-100 shadow-none" aria-labelledby="organization-list-title">
      <div class="card-body gap-4 p-5 sm:p-6"><div class="flex flex-wrap items-start justify-between gap-3"><div><h2 id="organization-list-title" class="card-title text-xl">รายการหน่วยงาน</h2><p class="mt-1 text-sm text-base-content/65">{{ organizations.length }} หน่วยงาน</p></div></div>
        <ul class="list rounded-box border border-base-300">
          <li v-for="item in organizations" :key="item.organizationId" class="list-row grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div class="min-w-0"><strong class="font-medium">{{ item.name }}</strong><p class="mt-1 text-sm text-base-content/65">{{ typeLabel(item.type) }}<span v-if="item.parentId"> · มีหน่วยงานแม่</span></p><span class="badge badge-sm mt-2" :class="item.status === 'ACTIVE' ? 'badge-success' : 'badge-ghost'">{{ item.status === 'ACTIVE' ? 'ใช้งาน' : 'ปิดใช้งาน' }}</span></div>
            <div v-if="canManage && item.status === 'ACTIVE'" class="flex flex-wrap gap-2 sm:justify-end"><button class="btn btn-sm" type="button" :disabled="busy" @click="edit(item)">แก้ไข</button><button class="btn btn-sm btn-error" type="button" :disabled="busy" @click="emit('disable', item)">ปิดใช้งาน</button></div>
            <div v-else-if="canManage && item.status === 'DISABLED'" class="flex flex-wrap gap-2 sm:justify-end"><button class="btn btn-sm btn-primary" type="button" :disabled="busy" @click="emit('enable', item)">เปิดใช้งานอีกครั้ง</button></div>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
