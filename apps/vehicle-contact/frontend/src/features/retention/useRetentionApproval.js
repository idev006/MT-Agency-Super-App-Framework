import { ref } from 'vue'
import { assertRetentionRepository } from '../../application/retention/retention-port.js'
export function useRetentionApproval({ repository }) {
  const source = assertRetentionRepository(repository); const phase = ref('idle'); const jobs = ref([]); const inspected = ref(null); const failure = ref(null)
  async function run(kind, callback) { phase.value = kind; failure.value = null; try { await callback(); phase.value = 'success'; return true } catch (error) { failure.value = { code: error?.code || 'UNEXPECTED_ERROR', requestId: error?.requestId || '' }; phase.value = ['TIMEOUT', 'NETWORK_ERROR'].includes(failure.value.code) ? 'uncertain' : 'error'; return false } }
  const load = () => run('loading', async () => { jobs.value = (await source.listDue()).jobs })
  const approve = (jobId) => run('submitting', async () => { await source.approve(jobId); await load() })
  const inspect = (jobId) => run('loading', async () => { inspected.value = (await source.status(jobId)).job })
  return { phase, jobs, inspected, failure, load, approve, inspect }
}
