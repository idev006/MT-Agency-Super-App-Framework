export class VehicleMaintenanceContractError extends Error {
  constructor() {
    super('Vehicle maintenance response does not match the contract')
    this.name = 'VehicleMaintenanceContractError'
    this.code = 'INVALID_ENVELOPE'
    this.requestId = ''
  }
}

const VEHICLE_FIELDS = ['plate', 'province', 'plateType', 'vehicleType', 'brand', 'model', 'color', 'ownerUserId', 'stickerCategory']
const PHOTO_SLOTS = ['FRONT', 'REAR', 'LEFT', 'RIGHT', 'FRONT_ANGLE']

function id(value) {
  return String(value || '').trim()
}

function filled(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function createGasVehicleMaintenanceRepository({ callOperation }) {
  if (typeof callOperation !== 'function') throw new TypeError('callOperation is required')
  return Object.freeze({
    async updateVehicle({ vehicleId, expectedVersion, fields }) {
      const payload = { vehicleId: id(vehicleId), expectedVersion }
      for (const field of VEHICLE_FIELDS) {
        const value = filled(fields?.[field])
        if (value !== undefined) payload[field] = value
      }
      const response = await callOperation('vehicles.update', payload)
      if (!response.data || response.data.vehicleId !== payload.vehicleId || !Number.isSafeInteger(response.data.version)) {
        throw new VehicleMaintenanceContractError()
      }
      return { vehicleId: response.data.vehicleId, version: response.data.version, responseRequestId: response.requestId }
    },
    async updateContact({ vehicleId, contactName, contactPhone }) {
      const payload = { vehicleId: id(vehicleId) }
      const name = filled(contactName)
      const phone = filled(contactPhone)
      if (name !== undefined) payload.contactName = name
      if (phone !== undefined) payload.contactPhone = phone
      const response = await callOperation('contacts.update', payload)
      if (!response.data || response.data.vehicleId !== payload.vehicleId || response.data.updated !== true) {
        throw new VehicleMaintenanceContractError()
      }
      return { vehicleId: response.data.vehicleId, updated: true, responseRequestId: response.requestId }
    },
    async replacePhoto({ vehicleId, slot, base64Image, mimeType }) {
      const vehicle = id(vehicleId)
      if (!PHOTO_SLOTS.includes(slot) || typeof base64Image !== 'string' || !base64Image || typeof mimeType !== 'string' || !mimeType) {
        throw new VehicleMaintenanceContractError()
      }
      const response = await callOperation('photos.replace', { vehicleId: vehicle, slot, base64Image, mimeType })
      if (!response.data || response.data.vehicleId !== vehicle || response.data.slot !== slot || response.data.replaced !== true) {
        throw new VehicleMaintenanceContractError()
      }
      return { vehicleId: response.data.vehicleId, slot: response.data.slot, replaced: true, responseRequestId: response.requestId }
    },
    async cancelVehicle({ vehicleId }) {
      const vehicle = id(vehicleId)
      const response = await callOperation('vehicles.cancel', { vehicleId: vehicle })
      if (!response.data || response.data.vehicleId !== vehicle || response.data.status !== 'INACTIVE') {
        throw new VehicleMaintenanceContractError()
      }
      return { vehicleId: response.data.vehicleId, status: response.data.status, responseRequestId: response.requestId }
    },
  })
}