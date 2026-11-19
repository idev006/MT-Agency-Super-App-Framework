function mapJob(value) {
  if (!value || typeof value.jobId !== 'string') throw Object.assign(new Error('Invalid retention response'), { code: 'INVALID_ENVELOPE' })
  return { jobId: value.jobId, vehicleId: value.vehicleId || '', dueAt: value.dueAt || '', status: value.status || '', attempts: Number(value.attempts || 0), lastError: value.lastError || '' }
}
export function createGasRetentionRepository({ callOperation }) {
  return Object.freeze({
    async listDue(limit = 50) { const response = await callOperation('retention.listDue', { limit }); if (!Array.isArray(response.data)) throw Object.assign(new Error('Invalid retention response'), { code: 'INVALID_ENVELOPE' }); return { jobs: response.data.map(mapJob), requestId: response.requestId } },
    async approve(jobId) { const response = await callOperation('retention.approve', { jobId }); return { ...response.data, requestId: response.requestId } },
    async status(jobId) { const response = await callOperation('retention.jobStatus', { jobId }); return { job: response.data ? mapJob(response.data) : null, requestId: response.requestId } },
  })
}
