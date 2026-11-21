import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createGasMyVehiclesRepository, MyVehiclesContractError } from '../src/infrastructure/vehicles/gas-my-vehicles-repository.js'
import { useMyVehicles } from '../src/features/vehicle-changes/useMyVehicles.js'
import { menuCatalog } from '../src/domain/navigation/menu-catalog.js'

const page = readFileSync(new URL('../src/pages/MyVehiclesPage.vue', import.meta.url), 'utf8')
const router = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8')
const pagination = { total: 1, page: 1, pageSize: 10, totalPages: 1 }

describe('my vehicles repository contract', () => {
  it('maps owned vehicles through an allowlist and sends the exact paginated DTO', async () => {
    const callOperation = vi.fn().mockResolvedValue({
      data: { items: [{ vehicleId: 'v-1', plate: 'กข1234', province: '65', status: 'ACTIVE', vehicleType: 'CAR', brand: 'Toyota', model: 'Test', color: 'ขาว', version: 2, owner_user_id: 'secret' }], total: 1, page: 1, pageSize: 10, totalPages: 1 },
      requestId: 'list',
    })
    const repository = createGasMyVehiclesRepository({ callOperation })
    const result = await repository.listMine({ page: 1, pageSize: 10 })
    expect(callOperation).toHaveBeenCalledWith('vehicles.listMine', { page: 1, pageSize: 10 }, undefined)
    expect(result.vehicles[0]).toEqual({ vehicleId: 'v-1', plate: 'กข1234', province: '65', status: 'ACTIVE', vehicleType: 'CAR', brand: 'Toyota', model: 'Test', color: 'ขาว', version: 2 })
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('submits only filled allowlisted delta fields and accepts the PENDING receipt', async () => {
    const callOperation = vi.fn().mockResolvedValue({ data: { requestId: 'c-1', status: 'PENDING' }, requestId: 'sub' })
    const repository = createGasMyVehiclesRepository({ callOperation })
    const result = await repository.submitChange({ vehicleId: 'v-1', delta: { brand: 'Honda', color: '  ', model: '' } })
    expect(callOperation).toHaveBeenCalledWith('changes.submit', { vehicleId: 'v-1', brand: 'Honda' })
    expect(result).toEqual({ requestId: 'c-1', status: 'PENDING', responseRequestId: 'sub' })
  })

  it('fails closed for a submit receipt that breaks the contract', async () => {
    for (const data of [{ requestId: 'c-1', status: 'APPROVED' }, { requestId: '', status: 'PENDING' }, null]) {
      const repository = createGasMyVehiclesRepository({ callOperation: vi.fn().mockResolvedValue({ data, requestId: 'r' }) })
      await expect(repository.submitChange({ vehicleId: 'v-1', delta: { brand: 'Honda' } })).rejects.toBeInstanceOf(MyVehiclesContractError)
    }
  })

  it('maps the owner change track with a delta allowlist and the exact paginated DTO', async () => {
    const callOperation = vi.fn().mockResolvedValue({
      data: { items: [{ requestId: 'c-1', vehicleId: 'v-1', status: 'PENDING', submittedAt: '2026-11-20T00:00:00.000Z', reviewedAt: '', proposedDelta: { brand: 'Honda', internal: 'drop' } }], total: 1, page: 1, pageSize: 50, totalPages: 1 },
      requestId: 'track',
    })
    const repository = createGasMyVehiclesRepository({ callOperation })
    const result = await repository.listMyChanges({ page: 1, pageSize: 50 })
    expect(callOperation).toHaveBeenCalledWith('changes.listMine', { page: 1, pageSize: 50 }, undefined)
    expect(result.changes[0].proposedDelta).toEqual({ brand: 'Honda' })
    expect(JSON.stringify(result)).not.toContain('drop')
  })
})

describe('my vehicles state and page contracts', () => {
  it('does not call the backend without own-read permission', async () => {
    const repository = { listMine: vi.fn(), submitChange: vi.fn(), listMyChanges: vi.fn() }
    const work = useMyVehicles({ repository, permissions: ['vehicle.change.submit'] })
    await work.load()
    expect(work.phase.value).toBe('forbidden')
    expect(repository.listMine).not.toHaveBeenCalled()
  })

  it('loads, filters the track by selected vehicle and refreshes after a submit', async () => {
    const vehicle = { vehicleId: 'v-1', plate: 'กข1234', province: '65', status: 'ACTIVE', brand: 'Toyota', model: 'Test', color: 'ขาว', version: 1 }
    const repository = {
      listMine: vi.fn().mockResolvedValue({ vehicles: [vehicle], pagination }),
      listMyChanges: vi.fn().mockResolvedValue({ changes: [{ requestId: 'c-1', vehicleId: 'v-1', status: 'PENDING', proposedDelta: { brand: 'Honda' } }, { requestId: 'c-9', vehicleId: 'v-other', status: 'APPROVED', proposedDelta: {} }], pagination }),
      submitChange: vi.fn().mockResolvedValue({ requestId: 'c-2', status: 'PENDING' }),
    }
    const work = useMyVehicles({ repository, permissions: ['vehicle.own.read', 'vehicle.change.submit'] })
    await work.load()
    work.selectVehicle(vehicle)
    expect(work.selectedChanges.value.map((item) => item.requestId)).toEqual(['c-1'])
    await work.submitChange({ brand: 'Honda' })
    expect(repository.submitChange).toHaveBeenCalledWith({ vehicleId: 'v-1', delta: { brand: 'Honda' } })
    expect(work.actionPhase.value).toBe('success')
    expect(work.lastSubmitted.value.requestId).toBe('c-2')
    expect(repository.listMine).toHaveBeenCalledTimes(2)
    expect(work.selectedVehicle.value.vehicleId).toBe('v-1')
  })

  it('blocks submit without the submit permission and never retries an uncertain write', async () => {
    const timeout = Object.assign(new Error('timeout'), { code: 'TIMEOUT', requestId: 'support' })
    const repository = {
      listMine: vi.fn().mockResolvedValue({ vehicles: [], pagination: { total: 0, page: 1, pageSize: 10, totalPages: 0 } }),
      listMyChanges: vi.fn().mockResolvedValue({ changes: [], pagination: { total: 0, page: 1, pageSize: 50, totalPages: 0 } }),
      submitChange: vi.fn().mockRejectedValue(timeout),
    }
    const readOnly = useMyVehicles({ repository, permissions: ['vehicle.own.read'] })
    readOnly.selectVehicle({ vehicleId: 'v-1' })
    await readOnly.submitChange({ brand: 'Honda' })
    expect(readOnly.actionPhase.value).toBe('forbidden')
    expect(repository.submitChange).not.toHaveBeenCalled()

    const work = useMyVehicles({ repository, permissions: ['vehicle.own.read', 'vehicle.change.submit'] })
    work.selectVehicle({ vehicleId: 'v-1' })
    await work.submitChange({ brand: 'Honda' })
    expect(work.actionPhase.value).toBe('uncertain')
    expect(repository.submitChange).toHaveBeenCalledTimes(1)
    expect(work.failure.value.requestId).toBe('support')
  })

  it('wires the protected route, routed menu item and shared page contracts', () => {
    expect(router).toContain("name: 'my-vehicles'")
    expect(router).toContain("requiredPermissions: ['vehicle.change.submit']")
    expect(menuCatalog.find((item) => item.id === 'my-vehicles')?.route).toBe('my-vehicles')
    expect(page).toContain('<PageTemplateComponent')
    expect(page).toContain('<OperationalContextStrip')
    expect(page).toContain('<PaginationControl')
    expect(page).toContain('<ConfirmDialog')
    expect(page).toContain('field-stack')
    expect(page).toContain('work.selectedChanges.value')
    expect(page).not.toContain('fetch(')
    expect(page).not.toContain('localStorage')
    expect(page).not.toContain('sessionStorage')
  })
})