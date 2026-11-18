import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useVehicleSearch } from '../src/features/vehicle-search/useVehicleSearch.js'

describe('useVehicleSearch state machine', () => {
  it('moves through loading to success and forwards the permission union', async () => {
    let release
    const lookup = vi.fn().mockReturnValue(new Promise((resolve) => { release = resolve }))
    const permissions = ref(['vehicle.lookup', 'vehicle.contact.read'])
    const search = useVehicleSearch({ repository: { lookup }, permissions })

    const pending = search.search({ plate: ' กข 1234 ', province: ' th-10 ' })
    expect(search.phase.value).toBe('loading')
    release({ vehicle: { vehicleId: 'v1' }, history: [], requestIds: { lookup: 'id' } })
    await pending

    expect(search.phase.value).toBe('success')
    expect(lookup).toHaveBeenCalledWith({ plate: 'กข 1234', province: 'TH-10' }, { permissions: permissions.value })
  })

  it('shows empty when the authoritative lookup returns no active vehicle', async () => {
    const search = useVehicleSearch({
      repository: { lookup: vi.fn().mockResolvedValue({ vehicle: null, history: [], requestIds: { lookup: 'empty' } }) },
      permissions: ['vehicle.lookup'],
    })
    await search.search({ plate: 'กข1234', province: 'TH-10' })
    expect(search.phase.value).toBe('empty')
  })

  it('does not call the repository when vehicle.lookup is absent', async () => {
    const lookup = vi.fn()
    const search = useVehicleSearch({ repository: { lookup }, permissions: ['vehicle.contact.read'] })
    await search.search({ plate: 'กข1234', province: 'TH-10' })
    expect(search.phase.value).toBe('forbidden')
    expect(lookup).not.toHaveBeenCalled()
  })

  it.each([
    ['FORBIDDEN', 'forbidden'],
    ['SESSION_EXPIRED', 'unauthenticated'],
    ['TIMEOUT', 'recoverable-error'],
    ['INVALID_VEHICLE_RESPONSE', 'error'],
  ])('maps %s to %s without exposing the raw message', async (code, phase) => {
    const error = Object.assign(new Error('private backend detail'), { code, requestId: 'support-id' })
    const search = useVehicleSearch({ repository: { lookup: vi.fn().mockRejectedValue(error) }, permissions: ['vehicle.lookup'] })
    await search.search({ plate: 'กข1234', province: 'TH-10' })
    expect(search.phase.value).toBe(phase)
    expect(search.failure.value).toEqual({ code, requestId: 'support-id' })
    expect(JSON.stringify(search.failure.value)).not.toContain('private backend detail')
  })
})
