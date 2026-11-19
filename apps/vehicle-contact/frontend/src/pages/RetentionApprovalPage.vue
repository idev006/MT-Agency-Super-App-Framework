<script setup>
import { computed, inject, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { retentionRepositoryKey } from '../application/retention/retention-port.js'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import OperationalContextStrip from '../components/page/OperationalContextStrip.vue'
import PageTemplateComponent from '../components/page/PageTemplateComponent.vue'
import { useRetentionApproval } from '../features/retention/useRetentionApproval.js'
import { useSessionStore } from '../stores/session.js'
const auth = useSessionStore(); const { roles, permissions, session, transport } = storeToRefs(auth)
const work = useRetentionApproval({ repository: inject(retentionRepositoryKey) }); const pendingJob = ref(''); const inspectId = ref('')
const canApprove = computed(() => permissions.value.includes('retention.delete.approve'))
onMounted(work.load)
async function approve() { const id = pendingJob.value; pendingJob.value = ''; await work.approve(id) }
</script>
<template><PageTemplateComponent eyebrow="ธรรมาภิบาลข้อมูล" title="อนุมัติการเก็บรักษาข้อมูล" description="ตรวจสอบงานที่ถึงกำหนด อนุมัติ และติดตามสถานะ โดยผู้ปฏิบัติงานลบเป็นคนละสิทธิ์">
  <template #breadcrumbs><RouterLink class="link" :to="{ name: 'dashboard' }">ภาพรวม</RouterLink><span> / การเก็บรักษาข้อมูล</span></template>
  <template #context><OperationalContextStrip :roles="roles" :transport="transport" :expires-at="session?.expiresAt" /></template>
  <form class="mb-5 flex flex-col gap-3 sm:flex-row" @submit.prevent="work.inspect(inspectId)"><label class="field-stack flex-1"><span class="label-text font-semibold">ตรวจสถานะ Job ID</span><input v-model.trim="inspectId" class="input input-bordered w-full" required /></label><button class="btn self-end" :disabled="!inspectId">ตรวจสถานะ</button></form>
  <div v-if="work.inspected.value" class="alert alert-info mb-5"><span>สถานะ {{ work.inspected.value.jobId }}: <strong>{{ work.inspected.value.status }}</strong></span></div>
  <div v-if="work.phase.value === 'loading'" class="loading loading-spinner" role="status"><span class="sr-only">กำลังโหลด</span></div>
  <div v-else-if="!work.jobs.value.length" class="alert alert-info">ไม่มีงานที่ถึงกำหนดอนุมัติ</div>
  <ul v-else class="list rounded-box border border-base-300 bg-base-100"><li v-for="job in work.jobs.value" :key="job.jobId" class="list-row grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><div><strong>{{ job.jobId }}</strong><p class="text-sm text-base-content/65">ยานพาหนะ {{ job.vehicleId }} · กำหนด {{ job.dueAt || '-' }} · {{ job.status }}</p></div><button v-if="canApprove" class="btn btn-warning btn-sm" type="button" @click="pendingJob = job.jobId">อนุมัติการลบ</button></li></ul>
  <div v-if="work.phase.value === 'uncertain'" class="alert alert-warning mt-5">ไม่ทราบผลแน่ชัด กรุณาตรวจสถานะ Job ก่อนอนุมัติซ้ำ</div><div v-else-if="work.phase.value === 'error'" class="alert alert-error mt-5">ดำเนินการไม่สำเร็จ ({{ work.failure.value?.code }})</div>
  <template #footer><p class="text-sm text-base-content/70">SYSTEM_ADMIN อนุมัติได้ แต่ไม่มีสิทธิ์ execute การลบ</p></template>
</PageTemplateComponent><ConfirmDialog :open="Boolean(pendingJob)" title="อนุมัติงานลบหรือไม่" message="หลังอนุมัติ RETENTION_WORKER อาจดำเนินการลบตามขอบเขตของงานนี้" confirm-label="อนุมัติการลบ" :busy="work.phase.value === 'submitting'" @cancel="pendingJob = ''" @confirm="approve" /></template>
