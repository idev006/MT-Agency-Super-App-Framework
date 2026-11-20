import { mapVehicleHistory, mapVehicleResponse } from './gas-vehicle-search-repository.js'

const READ_HISTORY = 'vehicle.history.read'

export function createGasQrResolveRepository({ callOperation }) {
  if (typeof callOperation !== 'function') throw new TypeError('callOperation is required')

  return Object.freeze({
    async resolve(token, { permissions = [], signal } = {}) {
      const permissionSet = new Set(permissions)
      const response = await callOperation('qr.resolve', { token }, { signal })
      const vehicle = mapVehicleResponse(response.data, permissionSet)
      if (!vehicle) return { vehicle: null, history: [], requestIds: { lookup: response.requestId } }

      let history = []
      let historyRequestId = ''
      if (permissionSet.has(READ_HISTORY)) {
        const historyResponse = await callOperation('vehicles.history', { vehicleId: vehicle.vehicleId }, { signal })
        history = mapVehicleHistory(historyResponse.data)
        historyRequestId = historyResponse.requestId
      }
      return {
        vehicle,
        history,
        requestIds: { lookup: response.requestId, history: historyRequestId },
      }
    },
  })
}
