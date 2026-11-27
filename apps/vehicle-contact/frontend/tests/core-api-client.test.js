import { describe, expect, it, vi } from 'vitest'
import { CoreApiClient, CoreApiError, isValidApiEndpoint } from '../src/infrastructure/api/core-api-client.js'
import trustedEndpoints from '../../contracts/trusted-endpoints.v1.json'

const endpoint = `${trustedEndpoints.endpoints.find((item) => item.id === 'cloud-run-core').url}/api/frontend`

describe('CoreApiClient', () => {
  it('builds the canonical core envelope without leaking an absent session token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, requestId: 'server-id', data: { status: 'bootstrap' }, error: null }),
    })
    const client = new CoreApiClient({ endpoint, fetchImpl })

    const result = await client.call('system.health')

    expect(result).toEqual({ data: { status: 'bootstrap' }, requestId: 'server-id' })
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(request).toMatchObject({ apiVersion: 'v1', group: 'system', action: 'health', payload: {} })
    expect(request).not.toHaveProperty('sessionToken')
    expect(fetchImpl.mock.calls[0][1].headers['content-type']).toBe('application/json')
  })

  it('maps a logical core error and preserves the support request ID', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: false,
        requestId: 'request-denied',
        data: null,
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      }),
    })
    const client = new CoreApiClient({ endpoint, fetchImpl })

    await expect(client.call('auth.session')).rejects.toMatchObject({
      name: 'CoreApiError',
      code: 'UNAUTHENTICATED',
      requestId: 'request-denied',
    })
  })

  it('rejects invalid endpoints before making a network request', async () => {
    const fetchImpl = vi.fn()
    const client = new CoreApiClient({ endpoint: 'https://example.com/api', fetchImpl })

    await expect(client.call('system.health')).rejects.toEqual(expect.any(CoreApiError))
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('allows only the configured core gateway, never the legacy GAS or Worker route', () => {
    expect(isValidApiEndpoint(endpoint)).toBe(true)
    expect(isValidApiEndpoint(`${endpoint}/probe`)).toBe(false)
    expect(isValidApiEndpoint('https://script.google.com/macros/s/example/exec')).toBe(false)
    expect(isValidApiEndpoint('https://p6vc-api-test-console.example.workers.dev/api/frontend')).toBe(false)
  })

  it('binds fetch to the global receiver required by native browser fetch', async () => {
    let receiver
    async function fetchImpl() {
      receiver = this
      return {
        ok: true,
        json: async () => ({ ok: true, requestId: 'receiver-id', data: {}, error: null }),
      }
    }
    const client = new CoreApiClient({ endpoint, fetchImpl })

    await client.call('system.health')

    expect(receiver).toBe(globalThis)
  })
})
