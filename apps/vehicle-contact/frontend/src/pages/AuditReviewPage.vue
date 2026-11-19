<script setup>
import { inject, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { auditRepositoryKey } from '../application/audit/audit-port.js'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import PaginationControl from '../components/common/PaginationControl.vue'
import { useAuditReview } from '../features/audit/useAuditReview.js'
import { formatBangkokDateTime } from '../domain/time/bangkok-date-time.js'
import { useSessionStore } from '../stores/session.js'
const auth = useSessionStore(); const { roles, session, transport } = storeToRefs(auth); const work = useAuditReview({ repository: inject(auditRepositoryKey) }); const vehicleId = ref('')
const filters = () => ({ ...(vehicleId.value ? { vehicleId: vehicleId.value } : {}) })
async function search() { work.page.value = 1; await work.query(filters()) }
async function download() { const rows = await work.exportRows({ ...filters(), limit: 100 }); if (!rows) return; const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'p6vc-audit.json'; link.click(); URL.revokeObjectURL(url) }
</script>
<template><PageTemplateComponent eyebrow="การตรวจสอบ" title="ตรวจสอบ Audit" description="ค้นหาเหตุการณ์ที่ได้รับอนุญาตและส่งออก JSON โดยไม่เก็บผลใน browser storage">
  <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span> / ตรวจสอบ Audit</span></template><template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>
  <form class="card card-border bg-base-100" @submit.prevent="search"><div class="card-body grid gap-4 sm:grid-cols-[1fr_auto]"><label class="field-stack"><span class="label-text font-semibold">รหัสยานพาหนะ (ไม่บังคับ)</span><input v-model.trim="vehicleId" class="input input-bordered w-full" /></label><button class="btn btn-primary self-end">ค้นหา</button></div></form>
  <div class="mt-5 flex flex-wrap items-center justify-end gap-3"><span class="text-sm text-base-content/65">ส่งออกตามตัวกรอง สูงสุด 100 รายการ</span><button class="btn" type="button" :disabled="work.phase.value !== 'success'" @click="download">ส่งออก JSON</button></div>
  <div v-if="work.phase.value === 'empty'" class="alert alert-info mt-5">ไม่พบเหตุการณ์ตามเงื่อนไข</div><div v-else-if="work.phase.value === 'error'" class="alert alert-error mt-5">อ่าน Audit ไม่สำเร็จ ({{ work.failure.value?.code }})</div>
  <template v-else-if="work.phase.value === 'success'"><div class="mt-5 overflow-x-auto"><table class="table bg-base-100"><thead><tr><th>เวลา</th><th>การกระทำ</th><th>ผู้ดำเนินการ</th><th>รายการ</th></tr></thead><tbody><tr v-for="row in work.rows.value" :key="row.eventId"><td class="whitespace-nowrap">{{ formatBangkokDateTime(row.at) }}</td><td>{{ row.action }}</td><td>{{ row.actorId }}</td><td>{{ row.entityId }}</td></tr></tbody></table></div><PaginationControl class="mt-4" :page="work.page.value" :page-size="work.pageSize.value" :total-items="work.pagination.value.total" :disabled="work.phase.value === 'loading'" label="แบ่งหน้ารายการ Audit" @update:page="work.changePage" @update:page-size="work.changePageSize" /></template>
</PageTemplateComponent></template>
