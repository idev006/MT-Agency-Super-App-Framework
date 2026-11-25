import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createGasVehicleDetailRepository } from '../src/infrastructure/vehicles/gas-vehicle-detail-repository.js'
import { useVehicleDetail } from '../src/features/vehicle-search/useVehicleDetail.js'

const page = readFileSync(new URL('../src/pages/VehicleDetailPage.vue', import.meta.url), 'utf8')
const resultComponent = readFileSync(new URL('../src/features/vehicle-search/components/VehicleSearchResult.vue', import.meta.url), 'utf8')
const router = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8')
const vehicle = { vehicleId: 'v-1', plate: 'กข1234', province: '65', status: 'ACTIVE', contacts: [], photos: [] }

describe('vehicle detail history repository', () => {
  it('reads history through the exact DTO and maps the audit allowlist', async () => {
    const callOperation = vi.fn().mockResolvedValue({ data: [{ audit_id: 'a1', action: 'VEHICLE_UPDATED', redacted_summary: 'summary', created_at: '2026-11-20T00:00:00.000Z', actor_id: 'secret' }], requestId: 'h' })
    const repository = createGasVehicleDetailRepository({ callOperation })
    const result = await repository.history('v-1')
    expect(callOperation).toHaveBeenCalledWith('vehicles.history', { vehicleId: 'v-1' }, { signal: undefined })
    expect(result.history).toEqual([{ id: 'a1', action: 'VEHICLE_UPDATED', summary: 'summary', occurredAt: '2026-11-20T00:00:00.000Z' }])
    expect(result.requestId).toBe('h')
    expect(JSON.stringify(result)).not.toContain('secret')
  })
})

describe('unified vehicle detail state', () => {
  it('does not call the backend without lookup permission', async () => {
    const repository = { detail: vi.fn(), history: vi.fn() }
    const work = useVehicleDetail({ repository, permissions: [] })
    await work.load('v-1')
    expect(work.phase.value).toBe('forbidden')
    expect(repository.detail).not.toHaveBeenCalled()
  })

  it('assembles a search-result-shaped payload with history when permitted', async () => {
    const repository = {
      detail: vi.fn().mockResolvedValue({ vehicle, version: 1, requestId: 'd' }),
      history: vi.fn().mockResolvedValue({ history: [{ id: 'a1', action: 'VEHICLE_UPDATED', summary: '', occurredAt: '2026-11-20T00:00:00.000Z' }], requestId: 'h' }),
    }
    const work = useVehicleDetail({ repository, permissions: ['vehicle.lookup', 'vehicle.history.read'] })
    await work.load('v-1')
    expect(work.phase.value).toBe('success')
    expect(work.result.value.requestIds).toEqual({ lookup: 'd', history: 'h' })
    expect(work.result.value.history).toHaveLength(1)
    expect(repository.detail).toHaveBeenCalledWith('v-1', { permissions: ['vehicle.lookup', 'vehicle.history.read'] })
  })

  it('skips history without the history permission and maps inactive vehicles to empty', async () => {
    const repository = { detail: vi.fn().mockResolvedValue({ vehicle, version: 1, requestId: 'd' }), history: vi.fn() }
    const work = useVehicleDetail({ repository, permissions: ['vehicle.lookup'] })
    await work.load('v-1')
    expect(repository.history).not.toHaveBeenCalled()
    expect(work.result.value.history).toEqual([])
    expect(work.result.value.requestIds.history).toBe('')

    const inactive = { detail: vi.fn().mockRejectedValue(Object.assign(new Error('inactive'), { code: 'VEHICLE_NOT_ACTIVE' })), history: vi.fn() }
    const work2 = useVehicleDetail({ repository: inactive, permissions: ['vehicle.lookup'] })
    await work2.load('v-1')
    expect(work2.phase.value).toBe('empty')
  })

  it('treats transient failures as recoverable and retries the same id', async () => {
    const repository = {
      detail: vi.fn().mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'TIMEOUT', requestId: 'support' })).mockResolvedValue({ vehicle, version: 1, requestId: 'd' }),
      history: vi.fn(),
    }
    const work = useVehicleDetail({ repository, permissions: ['vehicle.lookup'] })
    await work.load('v-1')
    expect(work.phase.value).toBe('recoverable-error')
    expect(work.failure.value.requestId).toBe('support')
    await work.retry()
    expect(work.phase.value).toBe('success')
    expect(repository.detail).toHaveBeenCalledTimes(2)
  })
})

describe('vehicle detail page and route contracts', () => {
  it('wires the protected deep-link route and reuses the shared result view', () => {
    expect(router).toContain("name: 'vehicle-detail'")
    expect(router).toContain("path: 'vehicles/detail/:vehicleId'")
    expect(router).toContain("requiredPermissions: ['vehicle.lookup']")
    expect(page).toContain('<VehicleDetailPanel') // VC-ADR-037: page and registry drawer share the panel
    expect(readFileSync(new URL('../src/features/vehicle-search/components/VehicleDetailPanel.vue', import.meta.url), 'utf8')).toContain('<VehicleDetailTabs')
    expect(page).toContain('<PageTemplateComponent')
    expect(page).toContain('<OperationalContextStrip')
    expect(page).toContain('route.params.vehicleId')
    expect(page).not.toContain('fetch(')
    expect(page).not.toContain('localStorage')
    expect(resultComponent).toContain("name: 'vehicle-detail'")
    expect(resultComponent).toContain('ดูรายละเอียด')
  })
})