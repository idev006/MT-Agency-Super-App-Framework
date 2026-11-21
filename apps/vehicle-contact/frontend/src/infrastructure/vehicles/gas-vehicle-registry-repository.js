import { callPaginatedOperation, mapPaginatedData } from '../api/pagination-contract.js'

export class VehicleRegistryContractError extends Error {
  constructor() {
    super('Vehicle registry response does not match the contract')
    this.name = 'VehicleRegistryContractError'
    this.code = 'INVALID_ENVELOPE'
    this.requestId = ''
  }
}

function requiredText(value) {
  if (typeof value !== 'string' || !value.trim()) throw new VehicleRegistryContractError()
  return value.trim()
}

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function mapVehicle(value) {
  if (!value || typeof value !== 'object') throw new VehicleRegistryContractError()
  return Object.freeze({
    vehicleId: requiredText(value.vehicleId),
    plate: requiredText(value.plate),
    province: requiredText(value.province),
    status: requiredText(value.status),
    vehicleType: optionalText(value.vehicleType),
    brand: optionalText(value.brand),
    model: optionalText(value.model),
    color: optionalText(value.color),
    createdAt: optionalText(value.createdAt),
    version: Number.isSafeInteger(value.version) ? value.version : 0,
  })
}

export function createGasVehicleRegistryRepository({ callOperation }) {
  if (typeof callOperation !== 'function') throw new TypeError('callOperation is required')
  return Object.freeze({
    async list({ page = 1, pageSize = 10 } = {}) {
      const response = await callPaginatedOperation({ callOperation, operation: 'vehicles.list', page, pageSize })
      const result = mapPaginatedData(response.data, mapVehicle)
      return { vehicles: result.items, pagination: result.pagination, requestId: response.requestId }
    },
  })
}