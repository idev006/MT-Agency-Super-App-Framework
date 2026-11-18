import { describe, expect, it, vi } from 'vitest'
import { createGasVehicleSearchRepository, VehicleSearchContractError } from '../src/infrastructure/vehicles/gas-vehicle-search-repository.js'

const vehicleData = {
  vehicleId: 'vehicle-1', plate: 'กข1234', province: 'TH-10', status: 'ACTIVE',
  vehicleType: 'รถยนต์', brand: 'Test', model: 'One', color: 'ขาว',
  contacts: [{ name: 'ผู้ประสานงาน', phone: '+66810000001', relationship: 'เจ้าของ', isPrimary: true }],
  photos: [{ photoId: 'photo-1', slot: 'FRONT', storageRef: 'must-not-leak', mimeType: 'image/jpeg' }],
}

describe('GAS vehicle search repository contract', () => {
  it('uses canonical operations and strips infrastructure-only photo fields', async () => {
    const callOperation = vi.fn()
      .mockResolvedValueOnce({ data: vehicleData, requestId: 'lookup-id' })
      .mockResolvedValueOnce({ data: [{ audit_id: 'audit-1', action: 'VEHICLE_UPDATED', redacted_summary: 'VEHICLE_UPDATED', created_at: '2026-11-19T02:00:00.000Z', actor_id: 'private' }], requestId: 'history-id' })
    const repository = createGasVehicleSearchRepository({ callOperation })

    const result = await repository.lookup({ plate: ' กข 1234 ', province: ' TH-10 ' }, {
      permissions: ['vehicle.lookup', 'vehicle.contact.read', 'vehicle.photos.read', 'vehicle.history.read'],
    })

    expect(callOperation).toHaveBeenNthCalledWith(1, 'vehicles.lookup', { plate: 'กข 1234', province: 'TH-10' }, { signal: undefined })
    expect(callOperation).toHaveBeenNthCalledWith(2, 'vehicles.history', { vehicleId: 'vehicle-1' }, { signal: undefined })
    expect(result.requestIds).toEqual({ lookup: 'lookup-id', history: 'history-id' })
    expect(result.vehicle.contacts).toHaveLength(1)
    expect(result.vehicle.photos).toEqual([{ photoId: 'photo-1', slot: 'FRONT', mimeType: 'image/jpeg' }])
    expect(JSON.stringify(result)).not.toContain('must-not-leak')
    expect(JSON.stringify(result)).not.toContain('actor_id')
  })

  it('fails closed for contact, photo and history data without permissions', async () => {
    const callOperation = vi.fn().mockResolvedValue({ data: vehicleData, requestId: 'lookup-id' })
    const repository = createGasVehicleSearchRepository({ callOperation })

    const result = await repository.lookup({ plate: 'กข1234', province: 'TH-10' }, { permissions: ['vehicle.lookup'] })

    expect(result.vehicle.contacts).toEqual([])
    expect(result.vehicle.photos).toEqual([])
    expect(result.history).toEqual([])
    expect(callOperation).toHaveBeenCalledTimes(1)
  })

  it('maps a null lookup to the explicit empty contract without follow-up reads', async () => {
    const callOperation = vi.fn().mockResolvedValue({ data: null, requestId: 'empty-id' })
    const repository = createGasVehicleSearchRepository({ callOperation })

    await expect(repository.lookup({ plate: 'กข1234', province: 'TH-10' }, { permissions: ['vehicle.lookup', 'vehicle.history.read'] }))
      .resolves.toEqual({ vehicle: null, history: [], requestIds: { lookup: 'empty-id' } })
    expect(callOperation).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed successful responses instead of rendering guessed fields', async () => {
    const repository = createGasVehicleSearchRepository({ callOperation: vi.fn().mockResolvedValue({ data: { vehicleId: 'only-an-id' }, requestId: 'bad-id' }) })
    await expect(repository.lookup({ plate: 'กข1234', province: 'TH-10' }, { permissions: ['vehicle.lookup'] }))
      .rejects.toEqual(expect.any(VehicleSearchContractError))
  })
})
