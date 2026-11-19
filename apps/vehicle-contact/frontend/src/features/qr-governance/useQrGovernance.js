import { ref } from 'vue'
import { assertQrGovernanceRepository } from '../../application/qr/qr-governance-port.js'

export function useQrGovernance({ repository }) {
  const source = assertQrGovernanceRepository(repository)
  const phase = ref('idle')
  const failure = ref(null)
  const result = ref(null)
  async function execute(action, vehicleId) {
    phase.value = 'submitting'; failure.value = null; result.value = null
    try {
      result.value = await source[action](vehicleId.trim())
      phase.value = 'success'; return true
    } catch (error) {
      failure.value = { code: error?.code || 'UNEXPECTED_ERROR', requestId: error?.requestId || '' }
      phase.value = ['TIMEOUT', 'NETWORK_ERROR'].includes(failure.value.code) ? 'uncertain' : 'error'
      return false
    }
  }
  function clearSensitiveResult() { result.value = null; if (phase.value === 'success') phase.value = 'idle' }
  return { phase, failure, result, execute, clearSensitiveResult }
}
