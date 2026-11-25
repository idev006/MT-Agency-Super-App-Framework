<script setup>
import DataTable from '../../../components/common/DataTable.vue'
import StatusBadge from '../../../components/common/StatusBadge.vue'

// D2: organizations as one DataTable; "จัดการ" opens the drawer (edit / disable / enable live there).
defineProps({ organizations: { type: Array, required: true }, total: { type: Number, default: 0 }, canManage: Boolean })
const emit = defineEmits(['manage'])
const columns = [
  { key: 'name', label: 'ชื่อหน่วยงาน' },
  { key: 'type', label: 'ประเภท' },
  { key: 'parentName', label: 'หน่วยงานแม่' },
  { key: 'status', label: 'สถานะ' },
  { key: 'actions', label: 'การจัดการ', srOnly: true, class: 'text-right' },
]
const typeLabel = (type) => type === 'POLICE' ? 'หน่วยงานตำรวจ' : 'หน่วยงานภายนอก'
</script>

<template>
  <section aria-labelledby="organization-list-title">
    <div class="mb-3 flex items-center justify-between gap-3"><h2 id="organization-list-title" class="text-lg font-semibold">รายการหน่วยงาน</h2><span class="badge badge-neutral">{{ total }} หน่วยงาน</span></div>
    <DataTable :columns="columns" :rows="organizations" row-key="organizationId" label="รายการหน่วยงาน">
      <template #cell-type="{ row }">{{ typeLabel(row.type) }}</template>
      <template #cell-parentName="{ row }">{{ row.parentName || (row.parentId ? 'หน่วยงานที่ไม่พบ' : '—') }}</template>
      <template #cell-status="{ row }"><StatusBadge :status="row.status" /></template>
      <template #cell-actions="{ row }"><button class="btn btn-sm" type="button" :data-manage-org="row.organizationId" @click="emit('manage', row)">{{ canManage ? 'จัดการ' : 'ดู' }}</button></template>
    </DataTable>
  </section>
</template>
