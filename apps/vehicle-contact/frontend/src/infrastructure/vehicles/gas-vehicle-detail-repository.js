import { mapVehicleResponse, mapVehicleHistory } from './gas-vehicle-search-repository.js'

export function createGasVehicleDetailRepository({ callOperation }) {
  if (typeof callOperation !== 'function') throw new TypeError('callOperation is required')
  return Object.freeze({
    async detail(vehicleId, { permissions = [], signal } = {}) {
      const response = await callOperation('vehicles.detail', { vehicleId: String(vehicleId || '').trim() }, { signal })
      const vehicle = mapVehicleResponse(response.data, new Set(permissions))
      if (!vehicle) return { vehicle: null, version: 0, requestId: response.requestId }
      const version = Number.isSafeInteger(response.data?.version) ? response.data.version : 0
      // Backend ≥0.9.14 embeds history (registration events included); null = not embedded.
      const history = Array.isArray(response.data?.history) ? mapVehicleHistory(response.data.history) : null
      return { vehicle, version, history, requestId: response.requestId }
    },
    async history(vehicleId, { signal } = {}) {
      const response = await callOperation('vehicles.history', { vehicleId: String(vehicleId || '').trim() }, { signal })
      return { history: mapVehicleHistory(response.data), requestId: response.requestId }
    },
  })
}