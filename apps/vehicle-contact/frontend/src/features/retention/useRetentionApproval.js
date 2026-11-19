import { ref } from 'vue'
import { assertRetentionRepository } from '../../application/retention/retention-port.js'
export function useRetentionApproval({ repository }) {
  const source = assertRetentionRepository(repository); const phase = ref('idle'); const jobs = ref([]); const inspected = ref(null); const failure = ref(null); const page = ref(1); const pageSize = ref(10); const pagination = ref({ total: 0, page: 1, pageSize: 10, totalPages: 0 })
  async function run(kind, callback) { phase.value = kind; failure.value = null; try { await callback(); phase.value = 'success'; return true } catch (error) { failure.value = { code: error?.code || 'UNEXPECTED_ERROR', requestId: error?.requestId || '' }; phase.value = ['TIMEOUT', 'NETWORK_ERROR'].includes(failure.value.code) ? 'uncertain' : 'error'; return false } }
  const load = () => run('loading', async () => { const result = await source.listDue({ page: page.value, pageSize: pageSize.value }); if (result.pagination.totalPages > 0 && page.value > result.pagination.totalPages) { page.value = result.pagination.totalPages; return load() }; jobs.value = result.jobs; pagination.value = result.pagination })
  const approve = (jobId) => run('submitting', async () => { await source.approve(jobId); await load() })
  const inspect = (jobId) => run('loading', async () => { inspected.value = (await source.status(jobId)).job })
  return { phase, jobs, inspected, failure, page, pageSize, pagination, load,
    changePage: (value) => { page.value = value; return load() },
    changePageSize: (value) => { pageSize.value = value; page.value = 1; return load() }, approve, inspect }
}
