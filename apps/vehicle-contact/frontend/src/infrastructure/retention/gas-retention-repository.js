import { callPaginatedOperation, mapPaginatedData } from '../api/pagination-contract.js'

function mapJob(value) {
  if (!value || typeof value.jobId !== 'string') throw Object.assign(new Error('Invalid retention response'), { code: 'INVALID_ENVELOPE' })
  return { jobId: value.jobId, vehicleId: value.vehicleId || '', dueAt: value.dueAt || '', status: value.status || '', attempts: Number(value.attempts || 0), lastError: value.lastError || '' }
}
export function createGasRetentionRepository({ callOperation }) {
  return Object.freeze({
    async listDue({ page = 1, pageSize = 10 } = {}) { const response = await callPaginatedOperation({ callOperation, operation: 'retention.listDue', page, pageSize }); const result = mapPaginatedData(response.data, mapJob); return { jobs: result.items, pagination: result.pagination, requestId: response.requestId } },
    async approve(jobId) { const response = await callOperation('retention.approve', { jobId }); return { ...response.data, requestId: response.requestId } },
    async status(jobId) { const response = await callOperation('retention.jobStatus', { jobId }); return { job: response.data ? mapJob(response.data) : null, requestId: response.requestId } },
  })
}
