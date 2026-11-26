import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createGasVehicleRegistryRepository, VehicleRegistryContractError } from '../src/infrastructure/vehicles/gas-vehicle-registry-repository.js'
import { useVehicleRegistry } from '../src/features/vehicle-registry/useVehicleRegistry.js'
import { menuCatalog } from '../src/domain/navigation/menu-catalog.js'

const page = readFileSync(new URL('../src/pages/VehicleRegistryPage.vue', import.meta.url), 'utf8')
const router = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8')
const pagination = { total: 1, page: 1, pageSize: 10, totalPages: 1 }

describe('vehicle registry repository contract', () => {
  it('maps approved vehicles through a non-PII allowlist and sends the exact paginated DTO', async () => {
    const callOperation = vi.fn().mockResolvedValue({
      data: { items: [{ vehicleId: 'v-1', plate: 'กข1234', province: '65', status: 'ACTIVE', vehicleType: 'CAR', brand: 'Toyota', model: 'Test', color: 'ขาว', version: 2, createdAt: '2026-11-20T00:00:00.000Z', owner_user_id: 'secret', contactPhone: '0800000000' }], total: 1, page: 1, pageSize: 10, totalPages: 1 },
      requestId: 'list',
    })
    const repository = createGasVehicleRegistryRepository({ callOperation })
    const result = await repository.list({ page: 1, pageSize: 10 })
    expect(callOperation).toHaveBeenCalledWith('vehicles.list', { page: 1, pageSize: 10 }, undefined)
    expect(result.vehicles[0]).toEqual({ vehicleId: 'v-1', plate: 'กข1234', province: '65', status: 'ACTIVE', vehicleType: 'CAR', brand: 'Toyota', model: 'Test', color: 'ขาว', stickerCategory: '', sticker: null, colorLabel: '', vehicleTypeLabel: '', createdAt: '2026-11-20T00:00:00.000Z', version: 2, organizationId: '', organizationName: '', qrPrintState: 'NOT_PRINTED', qrPrintedAt: '' })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(JSON.stringify(result)).not.toContain('0800000000')
  })

  it('fails closed when a required field or the page envelope breaks the contract', async () => {
    const brokenItems = [{ vehicleId: 'v-1', plate: '', province: '65', status: 'ACTIVE' }, null]
    for (const item of brokenItems) {
      const callOperation = vi.fn().mockResolvedValue({ data: { items: [item], total: 1, page: 1, pageSize: 10, totalPages: 1 }, requestId: 'r' })
      const repository = createGasVehicleRegistryRepository({ callOperation })
      await expect(repository.list({ page: 1, pageSize: 10 })).rejects.toBeInstanceOf(VehicleRegistryContractError)
    }
    const badEnvelope = vi.fn().mockResolvedValue({ data: { items: [], total: 25, page: 1, pageSize: 10, totalPages: 1 }, requestId: 'r' })
    await expect(createGasVehicleRegistryRepository({ callOperation: badEnvelope }).list({ page: 1, pageSize: 10 })).rejects.toThrow()
  })
})

describe('vehicle registry state and page contracts', () => {
  it('does not call the backend without the admin list permission', async () => {
    const repository = { list: vi.fn() }
    const work = useVehicleRegistry({ repository, permissions: ['vehicle.lookup'] })
    await work.load()
    expect(work.phase.value).toBe('forbidden')
    expect(repository.list).not.toHaveBeenCalled()
  })

  it('loads the registry, reports empty, and clamps an out-of-range page', async () => {
    const vehicle = { vehicleId: 'v-1', plate: 'กข1234', province: '65', status: 'ACTIVE', brand: 'Toyota', model: 'Test', color: 'ขาว', version: 1, createdAt: '2026-11-20T00:00:00.000Z' }
    const repository = { list: vi.fn().mockResolvedValue({ vehicles: [vehicle], pagination }) }
    const work = useVehicleRegistry({ repository, permissions: ['vehicle.list'] })
    await work.load()
    expect(work.phase.value).toBe('success')
    expect(work.vehicles.value[0].vehicleId).toBe('v-1')
    expect(repository.list).toHaveBeenCalledWith({ page: 1, pageSize: 10, filters: {}, withFilterOptions: false })

    const empty = useVehicleRegistry({ repository: { list: vi.fn().mockResolvedValue({ vehicles: [], pagination: { total: 0, page: 1, pageSize: 10, totalPages: 0 } }) }, permissions: ['vehicle.list'] })
    await empty.load()
    expect(empty.phase.value).toBe('empty')

    const clamp = useVehicleRegistry({ repository: { list: vi.fn().mockResolvedValue({ vehicles: [vehicle], pagination: { total: 1, page: 1, pageSize: 10, totalPages: 1 } }) }, permissions: ['vehicle.list'] })
    clamp.page.value = 9
    await clamp.load()
    expect(clamp.page.value).toBe(1)
    expect(clamp.phase.value).toBe('success')
  })

  it('captures forbidden and unauthenticated failures without retrying', async () => {
    for (const [code, expected] of [['FORBIDDEN', 'forbidden'], ['UNAUTHENTICATED', 'unauthenticated'], ['UNEXPECTED_ERROR', 'error']]) {
      const repository = { list: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { code, requestId: 'support' })) }
      const work = useVehicleRegistry({ repository, permissions: ['vehicle.list'] })
      await work.load()
      expect(work.phase.value).toBe(expected)
      expect(work.failure.value.requestId).toBe('support')
      expect(repository.list).toHaveBeenCalledTimes(1)
    }
  })

  it('wires the protected read-only route, routed menu item and shared page contracts', () => {
    expect(router).toContain("name: 'vehicle-registry'")
    expect(router).toContain("requiredPermissions: ['vehicle.list']")
    expect(menuCatalog.find((item) => item.id === 'vehicle-registry')?.route).toBe('vehicle-registry')
    expect(page).toContain('<PageTemplateComponent')
    expect(page).toContain('<OperationalContextStrip')
    expect(page).toContain('<PaginationControl')
    expect(page).toContain('work.vehicles.value')
    expect(page).not.toContain('<ConfirmDialog')
    expect(page).not.toContain('submitChange')
    expect(page).not.toContain('fetch(')
    expect(page).not.toContain('localStorage')
    expect(page).not.toContain('sessionStorage')
  })
})