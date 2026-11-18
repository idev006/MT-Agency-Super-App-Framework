import { describe, expect, it, vi } from 'vitest'
import { GasApiClient, GasApiError, isValidGasEndpoint, isValidWorkerEndpoint } from '../src/infrastructure/api/gas-api-client.js'

const endpoint = 'https://script.google.com/macros/s/test-deployment_123/exec'

describe('GasApiClient', () => {
  it('builds the canonical GAS envelope without leaking an absent session token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, requestId: 'server-id', data: { status: 'bootstrap' }, error: null }),
    })
    const client = new GasApiClient({ endpoint, fetchImpl })

    const result = await client.call('system.health')

    expect(result).toEqual({ data: { status: 'bootstrap' }, requestId: 'server-id' })
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(request).toMatchObject({ apiVersion: 'v1', group: 'system', action: 'health', payload: {} })
    expect(request).not.toHaveProperty('sessionToken')
    expect(fetchImpl.mock.calls[0][1].headers['content-type']).toBe('text/plain;charset=UTF-8')
  })

  it('maps a logical GAS error and preserves the support request ID', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: false,
        requestId: 'request-denied',
        data: null,
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      }),
    })
    const client = new GasApiClient({ endpoint, fetchImpl })

    await expect(client.call('auth.session')).rejects.toMatchObject({
      name: 'GasApiError',
      code: 'UNAUTHENTICATED',
      requestId: 'request-denied',
    })
  })

  it('rejects invalid endpoints before making a network request', async () => {
    const fetchImpl = vi.fn()
    const client = new GasApiClient({ endpoint: 'https://example.com/api', fetchImpl })

    await expect(client.call('system.health')).rejects.toEqual(expect.any(GasApiError))
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('validates only published GAS exec URLs', () => {
    expect(isValidGasEndpoint(endpoint)).toBe(true)
    expect(isValidGasEndpoint('http://script.google.com/macros/s/test/exec')).toBe(false)
    expect(isValidGasEndpoint('https://script.google.com/macros/s/test/dev')).toBe(false)
  })

  it('uses JSON transport for the Cloudflare frontend gateway', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, requestId: 'worker-id', data: { status: 'bootstrap' }, error: null }),
    })
    const workerEndpoint = 'https://p6vc-api-test-console.example.workers.dev/api/frontend'
    const client = new GasApiClient({ endpoint: workerEndpoint, transport: 'worker', fetchImpl })
    await client.call('system.health')
    expect(fetchImpl.mock.calls[0][1].headers['content-type']).toBe('application/json')
    expect(isValidWorkerEndpoint(workerEndpoint)).toBe(true)
    expect(isValidWorkerEndpoint('https://p6vc-api-test-console.example.workers.dev/api/probe')).toBe(false)
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
    const client = new GasApiClient({ endpoint, fetchImpl })

    await client.call('system.health')

    expect(receiver).toBe(globalThis)
  })
})
