import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '../src/stores/session.js'

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  }
}

const gasEndpoint = 'https://script.google.com/macros/s/persisted-test/exec'
const workerEndpoint = 'https://p6vc.example.workers.dev/api/frontend'
const sessionData = {
  userId: 'staff-1', displayName: 'เจ้าหน้าที่ทดสอบ', organizationId: 'org-1', roles: ['STAFF'],
  permissions: ['session.authenticated', 'vehicle.lookup'], expiresAt: '2026-11-20T02:00:00.000Z', mustChangePassword: false,
}

describe('session and endpoint refresh persistence', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    globalThis.localStorage = memoryStorage()
    globalThis.sessionStorage = memoryStorage()
  })

  it('restores the last valid GAS and Worker URLs independently', () => {
    const first = useSessionStore(createPinia())
    first.setTransport('direct')
    first.updateEndpoint(gasEndpoint)
    first.setTransport('worker')
    first.updateEndpoint(workerEndpoint)

    const refreshed = useSessionStore(createPinia())
    expect(refreshed.transport).toBe('worker')
    expect(refreshed.directEndpoint).toBe(gasEndpoint)
    expect(refreshed.workerEndpoint).toBe(workerEndpoint)
  })

  it('does not replace the last valid persisted URL with an unfinished edit', () => {
    const first = useSessionStore(createPinia())
    first.setTransport('direct')
    first.updateEndpoint(gasEndpoint)
    first.updateEndpoint('https://script.google.com/macros/s/')

    const refreshed = useSessionStore(createPinia())
    expect(refreshed.directEndpoint).toBe(gasEndpoint)
  })

  it('keeps a previously authenticated session during a transient refresh failure', async () => {
    globalThis.localStorage.setItem('p6vc-gas-endpoint', gasEndpoint)
    globalThis.sessionStorage.setItem('p6vc-session-token', 'synthetic-session-token')
    globalThis.sessionStorage.setItem('p6vc-session-summary', JSON.stringify(sessionData))
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('offline'))

    const refreshed = useSessionStore(createPinia())
    expect(refreshed.authenticated).toBe(true)
    expect(refreshed.permissions).toContain('vehicle.lookup')
    await expect(refreshed.restoreSession()).resolves.toBe(true)
    expect(refreshed.authenticated).toBe(true)
    expect(globalThis.sessionStorage.getItem('p6vc-session-token')).toBe('synthetic-session-token')
    expect(refreshed.error.code).toBe('NETWORK_ERROR')
  })

  it('clears cached state when GAS definitively rejects the session', async () => {
    globalThis.localStorage.setItem('p6vc-gas-endpoint', gasEndpoint)
    globalThis.sessionStorage.setItem('p6vc-session-token', 'expired-session-token')
    globalThis.sessionStorage.setItem('p6vc-session-summary', JSON.stringify(sessionData))
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, requestId: 'expired-request', data: null, error: { code: 'SESSION_EXPIRED', message: 'expired' } }),
    })

    const refreshed = useSessionStore(createPinia())
    await expect(refreshed.restoreSession()).resolves.toBe(false)
    expect(refreshed.authenticated).toBe(false)
    expect(refreshed.session).toBeNull()
    expect(globalThis.sessionStorage.getItem('p6vc-session-summary')).toBeNull()
  })
})
