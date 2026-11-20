const READ_CONTACT = 'vehicle.contact.read'
const READ_PHOTOS = 'vehicle.photos.read'
const READ_HISTORY = 'vehicle.history.read'

export class VehicleSearchContractError extends Error {
  constructor(message = 'Vehicle search response does not match the contract') {
    super(message)
    this.name = 'VehicleSearchContractError'
    this.code = 'INVALID_VEHICLE_RESPONSE'
    this.requestId = ''
  }
}

function requiredText(value) {
  if (typeof value !== 'string' || !value.trim()) throw new VehicleSearchContractError()
  return value.trim()
}

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function mapContacts(value, allowed) {
  if (!allowed || !Array.isArray(value)) return []
  return value.map((item) => ({
    name: requiredText(item?.name),
    phone: optionalText(item?.phone),
    relationship: optionalText(item?.relationship),
    isPrimary: item?.isPrimary === true,
  }))
}

function mapPhotos(value, allowed) {
  if (!allowed || !Array.isArray(value)) return []
  return value.map((item) => ({
    photoId: requiredText(item?.photoId),
    slot: requiredText(item?.slot),
    mimeType: optionalText(item?.mimeType),
  }))
}

export function mapVehicleResponse(value, permissions) {
  if (value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new VehicleSearchContractError()
  return {
    vehicleId: requiredText(value.vehicleId),
    plate: requiredText(value.plate),
    province: requiredText(value.province),
    status: requiredText(value.status),
    vehicleType: optionalText(value.vehicleType),
    brand: optionalText(value.brand),
    model: optionalText(value.model),
    color: optionalText(value.color),
    contacts: mapContacts(value.contacts, permissions.has(READ_CONTACT)),
    photos: mapPhotos(value.photos, permissions.has(READ_PHOTOS)),
  }
}

export function mapVehicleHistory(value) {
  if (!Array.isArray(value)) throw new VehicleSearchContractError()
  return value.map((item) => ({
    id: requiredText(item?.audit_id),
    action: requiredText(item?.action),
    summary: optionalText(item?.redacted_summary),
    occurredAt: requiredText(item?.created_at),
  }))
}

export function createGasVehicleSearchRepository({ callOperation }) {
  if (typeof callOperation !== 'function') throw new TypeError('callOperation is required')

  return Object.freeze({
    async lookup(criteria, { permissions = [], signal } = {}) {
      const permissionSet = new Set(permissions)
      const lookup = await callOperation('vehicles.lookup', {
        plate: String(criteria?.plate || '').trim(),
        province: String(criteria?.province || '').trim(),
      }, { signal })
      const vehicle = mapVehicleResponse(lookup.data, permissionSet)
      if (!vehicle) {
        return { vehicle: null, history: [], requestIds: { lookup: lookup.requestId } }
      }

      let history = []
      let historyRequestId = ''
      if (permissionSet.has(READ_HISTORY)) {
        const response = await callOperation('vehicles.history', { vehicleId: vehicle.vehicleId }, { signal })
        history = mapVehicleHistory(response.data)
        historyRequestId = response.requestId
      }

      return {
        vehicle,
        history,
        requestIds: { lookup: lookup.requestId, history: historyRequestId },
      }
    },
  })
}
