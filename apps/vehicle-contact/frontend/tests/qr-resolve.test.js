import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createGasQrResolveRepository } from '../src/infrastructure/vehicles/gas-qr-resolve-repository.js'
import { useQrResolve } from '../src/features/vehicle-search/useQrResolve.js'

const token = 'a'.repeat(64)
const vehicle = { vehicleId: 'v-1', plate: 'กข1234', province: 'TH-10', status: 'ACTIVE', contacts: [], photos: [] }

describe('QR resolve vertical slice', () => {
  it('uses qr.resolve and reads history only when authorized', async () => {
    const callOperation = vi.fn()
      .mockResolvedValueOnce({ data: vehicle, requestId: 'qr-id' })
      .mockResolvedValueOnce({ data: [], requestId: 'history-id' })
    const repository = createGasQrResolveRepository({ callOperation })
    await expect(repository.resolve(token, { permissions: ['vehicle.lookup', 'vehicle.history.read'] })).resolves.toMatchObject({
      vehicle: { vehicleId: 'v-1' }, requestIds: { lookup: 'qr-id', history: 'history-id' },
    })
    expect(callOperation).toHaveBeenNthCalledWith(1, 'qr.resolve', { token }, { signal: undefined })
    expect(callOperation).toHaveBeenNthCalledWith(2, 'vehicles.history', { vehicleId: 'v-1' }, { signal: undefined })
  })

  it('fails closed before the repository for malformed token or missing permission', async () => {
    const resolve = vi.fn()
    const malformed = useQrResolve({ repository: { resolve }, permissions: ['vehicle.lookup'] })
    await malformed.resolve('not-a-token')
    expect(malformed.phase.value).toBe('invalid')
    expect(resolve).not.toHaveBeenCalled()

    const forbidden = useQrResolve({ repository: { resolve }, permissions: [] })
    await forbidden.resolve(token)
    expect(forbidden.phase.value).toBe('forbidden')
    expect(resolve).not.toHaveBeenCalled()
  })

  it('maps active, missing and recoverable results without exposing raw errors', async () => {
    const success = useQrResolve({ repository: { resolve: vi.fn().mockResolvedValue({ vehicle, history: [], requestIds: { lookup: 'qr-id' } }) }, permissions: ['vehicle.lookup'] })
    await success.resolve(token)
    expect(success.phase.value).toBe('success')

    const empty = useQrResolve({ repository: { resolve: vi.fn().mockResolvedValue({ vehicle: null, history: [], requestIds: { lookup: 'empty' } }) }, permissions: ['vehicle.lookup'] })
    await empty.resolve(token)
    expect(empty.phase.value).toBe('empty')

    const error = Object.assign(new Error('private token detail'), { code: 'NETWORK_ERROR', requestId: 'support-id' })
    const recoverable = useQrResolve({ repository: { resolve: vi.fn().mockRejectedValue(error) }, permissions: ['vehicle.lookup'] })
    await recoverable.resolve(token)
    expect(recoverable.phase.value).toBe('recoverable-error')
    expect(recoverable.failure.value).toEqual({ code: 'NETWORK_ERROR', requestId: 'support-id' })
    expect(JSON.stringify(recoverable.failure.value)).not.toContain('private token detail')
  })

  it('keeps the token out of storage and visible markup; a sticker link (#/q/<code>, hash only) is read once and removed from the URL', () => {
    const page = readFileSync(new URL('../src/pages/QrResolvePage.vue', import.meta.url), 'utf8')
    const router = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8')
    expect(router).toMatch(/name: 'qr-resolve'.*requiredPermissions: \['vehicle\.lookup'\]/)
    expect(page).not.toContain('localStorage')
    expect(page).not.toContain('sessionStorage')
    // VC-ADR-032 (A): the only URL use is the sticker link: read ?t once, replace the URL, then resolve.
    expect(page).toContain("await router.replace({ query: {} }); await resolveAndShow(code)")
    expect(router).toContain("{ path: '/q/:code', name: 'qr-link'")
    expect(page).toContain('type="password"')
    expect(page).toContain('VehicleSearchResult')
  })
})
