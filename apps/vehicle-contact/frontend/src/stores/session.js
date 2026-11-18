import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { GasApiClient, GasApiError, isValidApiEndpoint } from '../infrastructure/api/gas-api-client.js'
import { menuForRoles } from '../domain/navigation/menu-catalog.js'

const SESSION_KEY = 'p6vc-session-token'
const TRANSPORT_KEY = 'p6vc-api-transport'
const defaultDirectEndpoint = import.meta.env.VITE_GAS_API_URL || ''
const defaultWorkerEndpoint = import.meta.env.VITE_WORKER_API_URL || ''

function browserSessionStorage() {
  return globalThis.sessionStorage
}

export const useSessionStore = defineStore('session', () => {
  const savedTransport = globalThis.localStorage?.getItem(TRANSPORT_KEY)
  const transport = ref(['direct', 'worker'].includes(savedTransport) ? savedTransport : 'direct')
  const directEndpoint = ref(defaultDirectEndpoint)
  const workerEndpoint = ref(defaultWorkerEndpoint)
  const phase = ref('idle')
  const sessionToken = ref(browserSessionStorage()?.getItem(SESSION_KEY) || '')
  const session = ref(null)
  const lastResult = ref(null)
  const error = ref(null)

  const endpoint = computed(() => transport.value === 'worker' ? workerEndpoint.value : directEndpoint.value)
  const endpointValid = computed(() => isValidApiEndpoint(endpoint.value, transport.value))
  const authenticated = computed(() => Boolean(sessionToken.value))
  const busy = computed(() => ['checking', 'restoring', 'signing-in', 'signing-out'].includes(phase.value))
  const roles = computed(() => Array.isArray(session.value?.roles) ? session.value.roles : [])
  const menuItems = computed(() => menuForRoles(roles.value))

  function client() {
    return new GasApiClient({ endpoint: endpoint.value, transport: transport.value })
  }

  function setTransport(value) {
    if (!['direct', 'worker'].includes(value)) return
    transport.value = value
    globalThis.localStorage?.setItem(TRANSPORT_KEY, value)
    error.value = null
    lastResult.value = null
  }

  function updateEndpoint(value) {
    if (transport.value === 'worker') workerEndpoint.value = String(value || '').trim()
    else directEndpoint.value = String(value || '').trim()
    error.value = null
    lastResult.value = null
  }

  function captureError(caught) {
    error.value = caught instanceof GasApiError
      ? { code: caught.code, message: caught.message, requestId: caught.requestId }
      : { code: 'UNEXPECTED_ERROR', message: 'เกิดข้อผิดพลาดที่ไม่คาดคิด', requestId: '' }
  }

  function clearSession() {
    sessionToken.value = ''
    session.value = null
    browserSessionStorage()?.removeItem(SESSION_KEY)
  }

  async function checkConnection() {
    phase.value = 'checking'
    error.value = null
    lastResult.value = null
    try {
      const result = await client().call('system.health')
      lastResult.value = { kind: 'health', requestId: result.requestId, status: result.data?.status || 'ready' }
      return true
    } catch (caught) {
      captureError(caught)
      return false
    } finally {
      phase.value = 'idle'
    }
  }

  async function signIn(username, password) {
    phase.value = 'signing-in'
    error.value = null
    lastResult.value = null
    try {
      const api = client()
      const login = await api.call('auth.login', { username, password })
      sessionToken.value = login.data.sessionToken
      browserSessionStorage()?.setItem(SESSION_KEY, sessionToken.value)
      const current = await api.call('auth.session', {}, { sessionToken: sessionToken.value })
      session.value = current.data
      lastResult.value = { kind: 'login', requestId: current.requestId, status: 'authenticated' }
      return true
    } catch (caught) {
      clearSession()
      captureError(caught)
      return false
    } finally {
      phase.value = 'idle'
    }
  }

  async function restoreSession() {
    if (!sessionToken.value) return false
    if (session.value) return true
    phase.value = 'restoring'
    try {
      const current = await client().call('auth.session', {}, { sessionToken: sessionToken.value })
      session.value = current.data
      return true
    } catch (caught) {
      clearSession()
      captureError(caught)
      return false
    } finally {
      phase.value = 'idle'
    }
  }

  async function signOut() {
    phase.value = 'signing-out'
    error.value = null
    try {
      if (sessionToken.value) await client().call('auth.logout', {}, { sessionToken: sessionToken.value })
    } catch (caught) {
      captureError(caught)
    } finally {
      clearSession()
      lastResult.value = null
      phase.value = 'idle'
    }
  }

  return {
    transport, directEndpoint, workerEndpoint, endpoint, endpointValid,
    phase, session, lastResult, error, authenticated, busy, roles, menuItems,
    setTransport, updateEndpoint, checkConnection, signIn, restoreSession, signOut,
  }
})
