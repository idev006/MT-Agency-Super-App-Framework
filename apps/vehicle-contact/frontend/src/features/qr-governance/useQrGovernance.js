import { ref } from 'vue'
import { assertQrGovernanceRepository } from '../../application/qr/qr-governance-port.js'

export function useQrGovernance({ repository }) {
  const source = assertQrGovernanceRepository(repository)
  const phase = ref('idle')
  const failure = ref(null)
  const result = ref(null)
  const history = ref([])
  const historyPhase = ref('idle')
  async function loadHistory(vehicleId) {
    historyPhase.value = 'loading'
    try { history.value = await source.history(vehicleId); historyPhase.value = 'ready' } catch { history.value = []; historyPhase.value = 'error' }
  }
  // VC-ADR-036 S3: reason = { reason, note } (required by the backend)
  async function execute(action, vehicleId, reason) {
    phase.value = 'submitting'; failure.value = null; result.value = null
    try {
      result.value = await source[action](vehicleId.trim(), reason)
      phase.value = 'success'
      await loadHistory(vehicleId.trim())
      return true
    } catch (error) {
      failure.value = { code: error?.code || 'UNEXPECTED_ERROR', requestId: error?.requestId || '' }
      phase.value = ['TIMEOUT', 'NETWORK_ERROR'].includes(failure.value.code) ? 'uncertain' : 'error'
      return false
    }
  }
  function clearSensitiveResult() { result.value = null; if (phase.value === 'success') phase.value = 'idle' }
  return { phase, failure, result, history, historyPhase, execute, loadHistory, clearSensitiveResult }
}
