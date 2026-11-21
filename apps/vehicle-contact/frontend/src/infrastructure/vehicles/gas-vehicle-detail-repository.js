import { mapVehicleResponse } from './gas-vehicle-search-repository.js'

export function createGasVehicleDetailRepository({ callOperation }) {
  if (typeof callOperation !== 'function') throw new TypeError('callOperation is required')
  return Object.freeze({
    async detail(vehicleId, { permissions = [], signal } = {}) {
      const response = await callOperation('vehicles.detail', { vehicleId: String(vehicleId || '').trim() }, { signal })
      const vehicle = mapVehicleResponse(response.data, new Set(permissions))
      if (!vehicle) return { vehicle: null, version: 0, requestId: response.requestId }
      const version = Number.isSafeInteger(response.data?.version) ? response.data.version : 0
      return { vehicle, version, requestId: response.requestId }
    },
  })
}