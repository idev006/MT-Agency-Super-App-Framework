import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { CoreApiClient, CoreApiError, isValidApiEndpoint } from '../infrastructure/api/core-api-client.js'
import { menuForPermissions } from '../domain/navigation/menu-catalog.js'
import { clearSessionSummary, loadSessionSummary, saveSessionSummary } from '../application/auth/session-summary-cache.js'

const SESSION_KEY = 'p6vc-session-token'
const TRANSPORT_KEY = 'p6vc-api-transport'
const DIRECT_ENDPOINT_KEY = 'p6vc-gas-endpoint'
const WORKER_ENDPOINT_KEY = 'p6vc-worker-endpoint'
const SESSION_REJECTION_CODES = new Set(['UNAUTHENTICATED', 'SESSION_EXPIRED', 'SESSION_IDLE_EXPIRED'])
// Read when a store is created (not at import), so the build/test environment is the only source.
const buildCoreEndpoint = () => import.meta.env.VITE_CORE_API_URL || ''
const previewEnabled = import.meta.env.DEV && import.meta.env.VITE_UI_PREVIEW === 'true'
const previewSession = Object.freeze({
  userId: 'preview-user', displayName: 'ผู้ใช้งานทดสอบ', organizationId: 'preview-unit',
  roles: ['SYSTEM_ADMIN', 'STAFF'],
  permissions: [
    'session.authenticated', 'system.settings.read', 'system.settings.manage', 'users.manage',
    'organizations.read', 'organizations.manage', 'campaigns.manage', 'qr.manage',
    'retention.read', 'retention.delete.approve', 'audit.read', 'vehicle.lookup', 'vehicle.contact.read',
    'vehicle.photos.read', 'vehicle.history.read', 'vehicle.list', 'vehicle.registration.approve', 'vehicle.change.approve',
  ],
  expiresAt: '2026-11-18T18:30:00.000Z', mustChangePassword: false,
})

// The build supplies one core endpoint. Saved channel/URL overrides from older versions are removed.

function browserSessionStorage() {
  return globalThis.sessionStorage
}


export const useSessionStore = defineStore('session', () => {
  for (const key of [TRANSPORT_KEY, DIRECT_ENDPOINT_KEY, WORKER_ENDPOINT_KEY]) globalThis.localStorage?.removeItem(key)
  const transport = ref('core')
  const endpoint = ref(buildCoreEndpoint())
  const phase = ref('idle')
  const sessionToken = ref(previewEnabled ? 'development-preview-only' : browserSessionStorage()?.getItem(SESSION_KEY) || '')
  const session = ref(previewEnabled ? previewSession : (sessionToken.value ? loadSessionSummary(browserSessionStorage()) : null))
  const sessionVerified = ref(previewEnabled)
  const lastResult = ref(null)
  const error = ref(null)
  const backendRelease = ref(null)

  const endpointValid = computed(() => isValidApiEndpoint(endpoint.value))
  const authenticated = computed(() => Boolean(sessionToken.value))
  const busy = computed(() => ['checking', 'restoring', 'signing-in', 'signing-out'].includes(phase.value))
  const roles = computed(() => Array.isArray(session.value?.roles) ? session.value.roles : [])
  const permissions = computed(() => Array.isArray(session.value?.permissions) ? session.value.permissions : [])
  const menuItems = computed(() => {
    const items = menuForPermissions(permissions.value)
    return session.value?.mustChangePassword ? items.filter((item) => item.id === 'account-security') : items
  })

  function captureBackendRelease(data) {
    if (!data || typeof data !== 'object') return
    const persistence = data.persistence && typeof data.persistence === 'object'
      ? Object.freeze({
          engine: typeof data.persistence.engine === 'string' ? data.persistence.engine : 'unknown',
          dualWrite: data.persistence.dualWrite === true,
        })
      : null
    backendRelease.value = Object.freeze({
      status: typeof data.status === 'string' ? data.status : 'unknown',
      apiVersion: typeof data.apiVersion === 'string' ? data.apiVersion : 'unknown',
      backendVersion: typeof data.backendVersion === 'string' ? data.backendVersion : 'unknown',
      releaseChannel: typeof data.releaseChannel === 'string' ? data.releaseChannel : 'unknown',
      persistence,
    })
  }

  function client() {
    return new CoreApiClient({ endpoint: endpoint.value })
  }

  function captureError(caught) {
    error.value = caught instanceof CoreApiError
      ? { code: caught.code, message: caught.message, requestId: caught.requestId }
      : { code: 'UNEXPECTED_ERROR', message: 'เกิดข้อผิดพลาดที่ไม่คาดคิด', requestId: '' }
  }

  function captureSessionSummary(data, requestId) {
    const summary = saveSessionSummary(data, browserSessionStorage())
    if (!summary) {
      throw new CoreApiError('ข้อมูลเซสชันไม่ตรงตามสัญญา', { code: 'INVALID_ENVELOPE', requestId })
    }
    session.value = summary
    sessionVerified.value = true
  }

  function clearSession() {
    sessionToken.value = ''
    session.value = null
    sessionVerified.value = false
    browserSessionStorage()?.removeItem(SESSION_KEY)
    clearSessionSummary(browserSessionStorage())
  }

  async function checkConnection() {
    phase.value = 'checking'
    error.value = null
    lastResult.value = null
    try {
      const result = await client().call('system.health')
      captureBackendRelease(result.data)
      lastResult.value = { kind: 'health', requestId: result.requestId, status: result.data?.status || 'ready' }
      return true
    } catch (caught) {
      captureError(caught)
      return false
    } finally {
      phase.value = 'idle'
    }
  }

  async function loadReleaseInfo() {
    try {
      const result = await client().call('system.health')
      captureBackendRelease(result.data)
      return true
    } catch {
      return false
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
      captureSessionSummary(current.data, current.requestId)
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
    if (sessionVerified.value) return true
    phase.value = 'restoring'
    try {
      const current = await client().call('auth.session', {}, { sessionToken: sessionToken.value })
      captureSessionSummary(current.data, current.requestId)
      return true
    } catch (caught) {
      captureError(caught)
      if (caught instanceof CoreApiError && SESSION_REJECTION_CODES.has(caught.code)) {
        clearSession()
        return false
      }
      return true
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

  async function callProtected(operation, payload = {}, options = {}) {
    if (!sessionToken.value) {
      throw new CoreApiError('เซสชันหมดอายุ', { code: 'UNAUTHENTICATED' })
    }
    return client().call(operation, payload, {
      ...options,
      sessionToken: sessionToken.value,
    })
  }

  function callPublic(operation, payload = {}, options = {}) {
    return client().call(operation, payload, options)
  }

  return {
    transport, endpoint, endpointValid,
    phase, session, sessionVerified, lastResult, error, backendRelease, authenticated, busy, roles, permissions, menuItems,
    checkConnection, loadReleaseInfo, signIn, restoreSession, signOut, callProtected, callPublic,
  }
})
