import { callPaginatedOperation, mapPaginatedData } from '../api/pagination-contract.js'

export class MyVehiclesContractError extends Error {
  constructor() {
    super('My vehicles response does not match the contract')
    this.name = 'MyVehiclesContractError'
    this.code = 'INVALID_ENVELOPE'
    this.requestId = ''
  }
}

const DELTA_FIELDS = ['contactName', 'contactPhone', 'brand', 'model', 'color']

function requiredText(value) {
  if (typeof value !== 'string' || !value.trim()) throw new MyVehiclesContractError()
  return value.trim()
}

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function mapDelta(value) {
  const delta = {}
  if (value && typeof value === 'object') {
    for (const field of DELTA_FIELDS) {
      if (typeof value[field] === 'string' && value[field]) delta[field] = value[field]
    }
  }
  return Object.freeze(delta)
}

function mapVehicle(value) {
  if (!value || typeof value !== 'object') throw new MyVehiclesContractError()
  return Object.freeze({
    vehicleId: requiredText(value.vehicleId),
    plate: requiredText(value.plate),
    province: requiredText(value.province),
    status: requiredText(value.status),
    vehicleType: optionalText(value.vehicleType),
    brand: optionalText(value.brand),
    model: optionalText(value.model),
    color: optionalText(value.color),
    version: Number.isSafeInteger(value.version) ? value.version : 0,
  })
}

function mapChange(value) {
  if (!value || typeof value !== 'object') throw new MyVehiclesContractError()
  return Object.freeze({
    requestId: requiredText(value.requestId),
    vehicleId: requiredText(value.vehicleId),
    status: requiredText(value.status),
    submittedAt: optionalText(value.submittedAt),
    reviewedAt: optionalText(value.reviewedAt),
    proposedDelta: mapDelta(value.proposedDelta),
  })
}

export function createGasMyVehiclesRepository({ callOperation }) {
  if (typeof callOperation !== 'function') throw new TypeError('callOperation is required')
  return Object.freeze({
    async listMine({ page = 1, pageSize = 10 } = {}) {
      const response = await callPaginatedOperation({ callOperation, operation: 'vehicles.listMine', page, pageSize })
      const result = mapPaginatedData(response.data, mapVehicle)
      return { vehicles: result.items, pagination: result.pagination, requestId: response.requestId }
    },
    async submitChange({ vehicleId, delta }) {
      const payload = { vehicleId: String(vehicleId || '').trim() }
      for (const field of DELTA_FIELDS) {
        if (typeof delta?.[field] === 'string' && delta[field].trim()) payload[field] = delta[field].trim()
      }
      const response = await callOperation('changes.submit', payload)
      if (!response.data || typeof response.data.requestId !== 'string' || !response.data.requestId || response.data.status !== 'PENDING') {
        throw new MyVehiclesContractError()
      }
      return { requestId: response.data.requestId, status: response.data.status, responseRequestId: response.requestId }
    },
    async listMyChanges({ page = 1, pageSize = 50 } = {}) {
      const response = await callPaginatedOperation({ callOperation, operation: 'changes.listMine', page, pageSize })
      const result = mapPaginatedData(response.data, mapChange)
      return { changes: result.items, pagination: result.pagination, requestId: response.requestId }
    },
  })
}