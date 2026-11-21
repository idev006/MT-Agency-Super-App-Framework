import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createGasVehicleMaintenanceRepository, VehicleMaintenanceContractError } from '../src/infrastructure/vehicles/gas-vehicle-maintenance-repository.js'
import { useVehicleMaintenance } from '../src/features/vehicle-maintenance/useVehicleMaintenance.js'

const page = readFileSync(new URL('../src/pages/VehicleMaintenancePage.vue', import.meta.url), 'utf8')
const detailPage = readFileSync(new URL('../src/pages/VehicleDetailPage.vue', import.meta.url), 'utf8')
const router = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8')
const vehicle = { vehicleId: 'v-1', plate: 'กข1234', province: '65', status: 'ACTIVE', brand: 'Toyota', model: 'Test', color: 'ขาว', contacts: [{ name: 'เดิม', phone: '+668', isPrimary: true }], photos: [] }

describe('vehicle maintenance repository contract', () => {
  it('sends expectedVersion plus only filled vehicle fields and returns the new version', async () => {
    const callOperation = vi.fn().mockResolvedValue({ data: { vehicleId: 'v-1', version: 4 }, requestId: 'u' })
    const repository = createGasVehicleMaintenanceRepository({ callOperation })
    const result = await repository.updateVehicle({ vehicleId: 'v-1', expectedVersion: 3, fields: { brand: 'Honda', color: '  ', plate: 'กข9999' } })
    expect(callOperation).toHaveBeenCalledWith('vehicles.update', { vehicleId: 'v-1', expectedVersion: 3, plate: 'กข9999', brand: 'Honda' })
    expect(result.version).toBe(4)
  })

  it('sends the exact contact, photo and cancel DTOs and validates receipts', async () => {
    const callOperation = vi.fn()
      .mockResolvedValueOnce({ data: { vehicleId: 'v-1', updated: true }, requestId: 'c' })
      .mockResolvedValueOnce({ data: { vehicleId: 'v-1', slot: 'FRONT', replaced: true }, requestId: 'p' })
      .mockResolvedValueOnce({ data: { vehicleId: 'v-1', status: 'INACTIVE' }, requestId: 'x' })
    const repository = createGasVehicleMaintenanceRepository({ callOperation })
    await repository.updateContact({ vehicleId: 'v-1', contactName: 'ใหม่', contactPhone: '' })
    await repository.replacePhoto({ vehicleId: 'v-1', slot: 'FRONT', base64Image: 'QUJD', mimeType: 'image/png' })
    await repository.cancelVehicle({ vehicleId: 'v-1' })
    expect(callOperation.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ['contacts.update', { vehicleId: 'v-1', contactName: 'ใหม่' }],
      ['photos.replace', { vehicleId: 'v-1', slot: 'FRONT', base64Image: 'QUJD', mimeType: 'image/png' }],
      ['vehicles.cancel', { vehicleId: 'v-1' }],
    ])
  })

  it('fails closed for invalid photo input and broken receipts', async () => {
    const repository = createGasVehicleMaintenanceRepository({ callOperation: vi.fn() })
    await expect(repository.replacePhoto({ vehicleId: 'v-1', slot: 'BAD', base64Image: 'QUJD', mimeType: 'image/png' })).rejects.toBeInstanceOf(VehicleMaintenanceContractError)
    await expect(repository.replacePhoto({ vehicleId: 'v-1', slot: 'FRONT', base64Image: '', mimeType: 'image/png' })).rejects.toBeInstanceOf(VehicleMaintenanceContractError)
    const bad = createGasVehicleMaintenanceRepository({ callOperation: vi.fn().mockResolvedValue({ data: { vehicleId: 'v-1', version: 'four' }, requestId: 'r' }) })
    await expect(bad.updateVehicle({ vehicleId: 'v-1', expectedVersion: 3, fields: { brand: 'Honda' } })).rejects.toBeInstanceOf(VehicleMaintenanceContractError)
    const badCancel = createGasVehicleMaintenanceRepository({ callOperation: vi.fn().mockResolvedValue({ data: { vehicleId: 'v-1', status: 'ACTIVE' }, requestId: 'r' }) })
    await expect(badCancel.cancelVehicle({ vehicleId: 'v-1' })).rejects.toBeInstanceOf(VehicleMaintenanceContractError)
  })
})

describe('vehicle maintenance state and conflict UX', () => {
  it('does not load or write without update permission', async () => {
    const repository = { updateVehicle: vi.fn(), updateContact: vi.fn(), replacePhoto: vi.fn(), cancelVehicle: vi.fn() }
    const detailRepository = { detail: vi.fn() }
    const work = useVehicleMaintenance({ repository, detailRepository, permissions: ['vehicle.lookup'] })
    await work.load('v-1')
    expect(work.phase.value).toBe('forbidden')
    expect(detailRepository.detail).not.toHaveBeenCalled()
    await work.updateVehicle({ brand: 'Honda' })
    expect(repository.updateVehicle).not.toHaveBeenCalled()
  })

  it('loads the current version and bumps it after a successful update', async () => {
    const repository = { updateVehicle: vi.fn().mockResolvedValue({ vehicleId: 'v-1', version: 4 }), updateContact: vi.fn(), replacePhoto: vi.fn(), cancelVehicle: vi.fn() }
    const detailRepository = { detail: vi.fn().mockResolvedValueOnce({ vehicle, version: 3, requestId: 'd' }).mockResolvedValue({ vehicle, version: 4, requestId: 'd2' }) }
    const work = useVehicleMaintenance({ repository, detailRepository, permissions: ['vehicle.update'] })
    await work.load('v-1')
    expect(work.version.value).toBe(3)
    await work.updateVehicle({ brand: 'Honda' })
    expect(repository.updateVehicle).toHaveBeenCalledWith({ vehicleId: 'v-1', expectedVersion: 3, fields: { brand: 'Honda' } })
    expect(work.actionPhase.value).toBe('success')
    expect(work.version.value).toBe(4)
  })

  it('on VERSION_CONFLICT reloads the fresh version and never blind-retries the write', async () => {
    const conflict = Object.assign(new Error('conflict'), { code: 'VERSION_CONFLICT', requestId: 'support' })
    const repository = { updateVehicle: vi.fn().mockRejectedValue(conflict), updateContact: vi.fn(), replacePhoto: vi.fn(), cancelVehicle: vi.fn() }
    const detailRepository = { detail: vi.fn().mockResolvedValueOnce({ vehicle, version: 3, requestId: 'd' }).mockResolvedValueOnce({ vehicle, version: 9, requestId: 'd2' }) }
    const work = useVehicleMaintenance({ repository, detailRepository, permissions: ['vehicle.update'] })
    await work.load('v-1')
    await work.updateVehicle({ brand: 'Honda' })
    expect(work.actionPhase.value).toBe('conflict')
    expect(work.conflict.value).toBe(true)
    expect(work.version.value).toBe(9)
    expect(repository.updateVehicle).toHaveBeenCalledTimes(1)
    expect(detailRepository.detail).toHaveBeenCalledTimes(2)
  })

  it('marks uncertain writes without retry and flags a completed cancel', async () => {
    const timeout = Object.assign(new Error('timeout'), { code: 'TIMEOUT', requestId: 'support' })
    const repository = { updateVehicle: vi.fn(), updateContact: vi.fn(), replacePhoto: vi.fn(), cancelVehicle: vi.fn().mockRejectedValueOnce(timeout).mockResolvedValue({ vehicleId: 'v-1', status: 'INACTIVE' }) }
    const detailRepository = { detail: vi.fn().mockResolvedValue({ vehicle, version: 3, requestId: 'd' }) }
    const work = useVehicleMaintenance({ repository, detailRepository, permissions: ['vehicle.update'] })
    await work.load('v-1')
    await work.cancelVehicle()
    expect(work.actionPhase.value).toBe('uncertain')
    expect(work.cancelled.value).toBe(false)
    await work.cancelVehicle()
    expect(work.cancelled.value).toBe(true)
    expect(repository.cancelVehicle).toHaveBeenCalledTimes(2)
  })

  it('replaces a photo from a validated file and reloads current values', async () => {
    const file = { type: 'image/png', size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }
    const repository = { updateVehicle: vi.fn(), updateContact: vi.fn(), replacePhoto: vi.fn().mockResolvedValue({ vehicleId: 'v-1', slot: 'FRONT', replaced: true }), cancelVehicle: vi.fn() }
    const detailRepository = { detail: vi.fn().mockResolvedValue({ vehicle, version: 3, requestId: 'd' }) }
    const work = useVehicleMaintenance({ repository, detailRepository, permissions: ['vehicle.update'] })
    await work.load('v-1')
    await work.replacePhoto({ slot: 'FRONT', file })
    expect(repository.replacePhoto).toHaveBeenCalledWith({ vehicleId: 'v-1', slot: 'FRONT', base64Image: 'AQID', mimeType: 'image/png' })
    expect(work.actionPhase.value).toBe('success')
  })
})

describe('vehicle maintenance page and route contracts', () => {
  it('wires the protected route, gated edit entry and shared page contracts', () => {
    expect(router).toContain("name: 'vehicle-maintenance'")
    expect(router).toContain("path: 'vehicles/maintenance/:vehicleId'")
    expect(router).toContain("requiredPermissions: ['vehicle.update']")
    expect(page).toContain('<PageTemplateComponent')
    expect(page).toContain('<OperationalContextStrip')
    expect(page).toContain('<ConfirmDialog')
    expect(page).toContain("work.actionPhase.value === 'conflict'")
    expect(page).toContain('file-input')
    expect(page).toContain('work.version.value')
    expect(page).not.toContain('fetch(')
    expect(page).not.toContain('localStorage')
    expect(detailPage).toContain("name: 'vehicle-maintenance'")
    expect(detailPage).toContain("permissionSet.has('vehicle.update')")
  })
})