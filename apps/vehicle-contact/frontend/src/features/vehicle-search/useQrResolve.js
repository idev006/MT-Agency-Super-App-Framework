import { computed, ref, unref } from 'vue'
import { assertQrResolveRepository } from '../../application/vehicles/qr-resolve-port.js'

const AUTH_FAILURES = new Set(['UNAUTHENTICATED', 'SESSION_EXPIRED', 'SESSION_IDLE_EXPIRED'])
const RETRYABLE_FAILURES = new Set(['TIMEOUT', 'NETWORK_ERROR', 'HTTP_429', 'BUSY'])
const QR_TOKEN = /^[a-f0-9]{64}$/i

export function useQrResolve({ repository, permissions }) {
  const source = assertQrResolveRepository(repository)
  const phase = ref('idle')
  const result = ref(null)
  const failure = ref(null)
  let retryToken = ''
  const permissionList = computed(() => Array.isArray(unref(permissions)) ? unref(permissions) : [])
  const canResolve = computed(() => permissionList.value.includes('vehicle.lookup'))

  function capture(error) {
    const code = typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR'
    failure.value = { code, requestId: typeof error?.requestId === 'string' ? error.requestId : '' }
    if (code === 'FORBIDDEN') phase.value = 'forbidden'
    else if (AUTH_FAILURES.has(code)) phase.value = 'unauthenticated'
    else phase.value = RETRYABLE_FAILURES.has(code) ? 'recoverable-error' : 'error'
    if (phase.value !== 'recoverable-error') retryToken = ''
  }

  async function resolve(token) {
    const candidate = String(token || '').trim().toLowerCase()
    result.value = null
    failure.value = null
    if (!canResolve.value) {
      phase.value = 'forbidden'
      failure.value = { code: 'FORBIDDEN', requestId: '' }
      return false
    }
    if (!QR_TOKEN.test(candidate)) {
      phase.value = 'invalid'
      retryToken = ''
      return false
    }

    retryToken = candidate
    phase.value = 'loading'
    try {
      result.value = await source.resolve(candidate, { permissions: permissionList.value })
      phase.value = result.value.vehicle ? 'success' : 'empty'
      retryToken = ''
      return true
    } catch (error) {
      if (error?.code === 'INVALID_QR') {
        phase.value = 'empty'
        retryToken = ''
        return true
      }
      // Backend ≥0.9.31 tells a signed-in officer why a sticker opens no vehicle (no vehicle data either way).
      if (error?.code === 'QR_REVOKED' || error?.code === 'VEHICLE_NOT_ACTIVE') {
        phase.value = error.code === 'QR_REVOKED' ? 'revoked' : 'inactive'
        failure.value = { code: error.code, requestId: typeof error?.requestId === 'string' ? error.requestId : '' }
        retryToken = ''
        return true
      }
      capture(error)
      return false
    }
  }

  function retry() {
    return retryToken ? resolve(retryToken) : Promise.resolve(false)
  }

  function clearSensitive() {
    retryToken = ''
  }

  // Back to step 1 (scan): forget the previous vehicle on screen.
  function reset() {
    retryToken = ''; result.value = null; failure.value = null; phase.value = 'idle'
  }

  return { phase, result, failure, canResolve, resolve, retry, clearSensitive, reset }
}
