import { computed, ref, unref } from 'vue'
import { assertVehicleSearchRepository } from '../../application/vehicles/vehicle-search-port.js'

const AUTH_FAILURES = new Set(['UNAUTHENTICATED', 'SESSION_EXPIRED', 'SESSION_IDLE_EXPIRED'])
const RETRYABLE_FAILURES = new Set(['TIMEOUT', 'NETWORK_ERROR', 'HTTP_429', 'BUSY'])

export function useVehicleSearch({ repository, permissions }) {
  const source = assertVehicleSearchRepository(repository)
  const phase = ref('idle')
  const result = ref(null)
  const failure = ref(null)
  const lastCriteria = ref(null)

  const permissionList = computed(() => Array.isArray(unref(permissions)) ? unref(permissions) : [])
  const canSearch = computed(() => permissionList.value.includes('vehicle.lookup'))

  function captureFailure(error) {
    const code = typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR'
    failure.value = { code, requestId: typeof error?.requestId === 'string' ? error.requestId : '' }
    if (code === 'FORBIDDEN') phase.value = 'forbidden'
    else if (AUTH_FAILURES.has(code)) phase.value = 'unauthenticated'
    else phase.value = RETRYABLE_FAILURES.has(code) ? 'recoverable-error' : 'error'
  }

  async function search(criteria) {
    lastCriteria.value = {
      plate: String(criteria?.plate || '').trim(),
      province: String(criteria?.province || '').trim().toUpperCase(),
    }
    result.value = null
    failure.value = null

    if (!canSearch.value) {
      phase.value = 'forbidden'
      failure.value = { code: 'FORBIDDEN', requestId: '' }
      return false
    }

    phase.value = 'loading'
    try {
      result.value = await source.lookup(lastCriteria.value, { permissions: permissionList.value })
      phase.value = result.value.vehicle ? 'success' : 'empty'
      return true
    } catch (error) {
      captureFailure(error)
      return false
    }
  }

  function retry() {
    return lastCriteria.value ? search(lastCriteria.value) : Promise.resolve(false)
  }

  return { phase, result, failure, canSearch, search, retry }
}
