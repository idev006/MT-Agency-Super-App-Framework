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
    // R7: approved-vehicle evidence photo (bytes stay in memory; every view is audited server-side).
    async photo({ vehicleId, photoId }, { signal } = {}) {
      const response = await callOperation('vehicles.photo', { vehicleId: String(vehicleId || '').trim(), photoId: String(photoId || '').trim() }, { signal })
      const data = response.data || {}
      if (typeof data.base64Image !== 'string' || !/^image\/(jpeg|png|webp)$/.test(data.mimeType || '')) throw Object.assign(new Error('invalid photo'), { code: 'INVALID_ENVELOPE' })
      return { photoId: data.photoId, slot: data.slot, dataUrl: `data:${data.mimeType};base64,${data.base64Image}` }
    },
    async history(vehicleId, { signal } = {}) {
      const response = await callOperation('vehicles.history', { vehicleId: String(vehicleId || '').trim() }, { signal })
      return { history: mapVehicleHistory(response.data), requestId: response.requestId }
    },
  })
}