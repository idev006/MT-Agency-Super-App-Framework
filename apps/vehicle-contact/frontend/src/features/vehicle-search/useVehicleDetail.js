import { computed, ref, unref } from 'vue'
import { assertVehicleDetailRepository } from '../../application/vehicles/vehicle-detail-port.js'

const AUTH_FAILURES = new Set(['UNAUTHENTICATED', 'SESSION_EXPIRED', 'SESSION_IDLE_EXPIRED'])
const RETRYABLE_FAILURES = new Set(['TIMEOUT', 'NETWORK_ERROR', 'HTTP_429', 'BUSY'])

export function useVehicleDetail({ repository, permissions }) {
  const source = assertVehicleDetailRepository(repository)
  const phase = ref('idle')
  const result = ref(null)
  const failure = ref(null)
  const vehicleId = ref('')
  const permissionList = computed(() => Array.isArray(unref(permissions)) ? unref(permissions) : [])
  const canRead = computed(() => permissionList.value.includes('vehicle.lookup'))

  function captureFailure(error) {
    const code = typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR'
    failure.value = { code, requestId: typeof error?.requestId === 'string' ? error.requestId : '' }
    if (code === 'FORBIDDEN') phase.value = 'forbidden'
    else if (AUTH_FAILURES.has(code)) phase.value = 'unauthenticated'
    else if (code === 'VEHICLE_NOT_ACTIVE') phase.value = 'empty'
    else phase.value = RETRYABLE_FAILURES.has(code) ? 'recoverable-error' : 'error'
  }

  async function load(id) {
    vehicleId.value = String(id || '').trim()
    result.value = null; failure.value = null
    if (!canRead.value) { phase.value = 'forbidden'; failure.value = { code: 'FORBIDDEN', requestId: '' }; return false }
    if (!vehicleId.value) { phase.value = 'empty'; return false }
    phase.value = 'loading'
    try {
      const detail = await source.detail(vehicleId.value, { permissions: permissionList.value })
      if (!detail.vehicle) { phase.value = 'empty'; return false }
      let history = []
      let historyRequestId = ''
      if (Array.isArray(detail.history)) {
        history = detail.history
        historyRequestId = detail.requestId
      } else if (permissionList.value.includes('vehicle.history.read') && typeof source.history === 'function') {
        const response = await source.history(vehicleId.value)
        history = response.history
        historyRequestId = response.requestId
      }
      result.value = { vehicle: detail.vehicle, version: detail.version, history, requestIds: { lookup: detail.requestId, history: historyRequestId } }
      phase.value = 'success'
      return true
    } catch (error) { captureFailure(error); return false }
  }

  function retry() { return vehicleId.value ? load(vehicleId.value) : Promise.resolve(false) }

  return { phase, result, failure, canRead, vehicleId, load, retry }
}