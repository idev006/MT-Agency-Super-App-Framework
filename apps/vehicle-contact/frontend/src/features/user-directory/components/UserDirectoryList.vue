<script setup>
import DataTable from '../../../components/common/DataTable.vue'
import StatusBadge from '../../../components/common/StatusBadge.vue'
import { roleLabels } from '../../../domain/identity/role-presentation.js'

// D2: users as one DataTable (desktop and phone, sideways scroll); "จัดการ" opens the drawer.
defineProps({ users: { type: Array, required: true }, total: { type: Number, default: 0 } })
const emit = defineEmits(['manage'])
const columns = [
  { key: 'displayName', label: 'ชื่อที่แสดง' },
  { key: 'username', label: 'ชื่อผู้ใช้' },
  { key: 'organizationName', label: 'หน่วยงาน' },
  { key: 'roles', label: 'บทบาท' },
  { key: 'status', label: 'สถานะ' },
  { key: 'actions', label: 'การจัดการ', srOnly: true, class: 'text-right' },
]
</script>

<template>
  <section aria-labelledby="user-directory-title">
    <div class="mb-3 flex items-center justify-between gap-3"><h2 id="user-directory-title" class="text-lg font-semibold">บัญชีผู้ใช้</h2><span class="badge badge-neutral">{{ total }} บัญชี</span></div>
    <DataTable :columns="columns" :rows="users" row-key="userId" label="รายชื่อบัญชีผู้ใช้">
      <template #cell-displayName="{ row }">{{ row.displayName || 'ยังไม่กำหนด' }}</template>
      <template #cell-organizationName="{ row }">{{ row.organizationName || (row.organizationId ? 'หน่วยงานที่ไม่พบ' : 'ยังไม่ผูกหน่วยงาน') }}</template>
      <template #cell-roles="{ row }"><span class="text-sm">{{ row.roles.map((r) => roleLabels[r] || r).join(', ') || '—' }}</span></template>
      <template #cell-status="{ row }"><StatusBadge :status="row.status" /></template>
      <template #cell-actions="{ row }"><button class="btn btn-sm" type="button" :data-manage-user="row.userId" @click="emit('manage', row)">จัดการ</button></template>
    </DataTable>
  </section>
</template>
