import { stickerOf, toSticker } from '../../domain/reference/sticker-categories.js'
import { callPaginatedOperation, filterPayload, mapPaginatedData } from '../api/pagination-contract.js'

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
    stickerCategory: optionalText(value.stickerCategory),
    sticker: toSticker(value.sticker) || stickerOf(optionalText(value.stickerCategory)),
    colorLabel: optionalText(value.colorLabel),
    vehicleTypeLabel: optionalText(value.vehicleTypeLabel),
    createdAt: optionalText(value.createdAt),
    version: Number.isSafeInteger(value.version) ? value.version : 0,
    // VC-ADR-042: print page — unit and print state (backend ≥0.9.37; empty / NOT_PRINTED before)
    organizationId: optionalText(value.organizationId),
    organizationName: optionalText(value.organizationName),
    qrPrintState: value.qrPrintState === 'PRINTED' ? 'PRINTED' : 'NOT_PRINTED',
    qrPrintedAt: optionalText(value.qrPrintedAt),
  })
}

function mapFilterOptions(value) {
  if (!value || typeof value !== 'object') return null
  const list = (v) => (Array.isArray(v) ? v : [])
  return Object.freeze({
    organizations: list(value.organizations).filter((o) => o && typeof o.id === 'string' && o.id).map((o) => Object.freeze({ id: o.id, name: optionalText(o.name) || o.id })),
    stickerCategories: list(value.stickerCategories).map(toSticker).filter(Boolean),
  })
}

export function createGasVehicleRegistryRepository({ callOperation }) {
  if (typeof callOperation !== 'function') throw new TypeError('callOperation is required')
  return Object.freeze({
    // filters (VC-ADR-042): organizationId, stickerCategory, printState (NOT_PRINTED | PRINTED), plate — empty = not sent
    async list({ page = 1, pageSize = 10, filters = {}, withFilterOptions = false } = {}) {
      const payload = { ...filterPayload(filters), ...(withFilterOptions ? { withFilterOptions: true } : {}) }
      const response = await callPaginatedOperation({ callOperation, operation: 'vehicles.list', payload, page, pageSize })
      const result = mapPaginatedData(response.data, mapVehicle)
      return { vehicles: result.items, pagination: result.pagination, filterOptions: mapFilterOptions(response.data?.filterOptions), requestId: response.requestId }
    },
  })
}