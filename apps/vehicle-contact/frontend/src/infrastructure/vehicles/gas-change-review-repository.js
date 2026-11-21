import { callPaginatedOperation, mapPaginatedData } from '../api/pagination-contract.js'

export class ChangeReviewContractError extends Error {
  constructor() {
    super('Change review response does not match the contract')
    this.name = 'ChangeReviewContractError'
    this.code = 'INVALID_ENVELOPE'
    this.requestId = ''
  }
}

const DELTA_FIELDS = ['contactName', 'contactPhone', 'brand', 'model', 'color']

function requiredString(value) {
  if (typeof value !== 'string' || !value) throw new ChangeReviewContractError()
  return value
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

function mapPending(value) {
  if (!value || typeof value !== 'object') throw new ChangeReviewContractError()
  return Object.freeze({
    requestId: requiredString(value.requestId),
    vehicleId: requiredString(value.vehicleId),
    submittedAt: typeof value.submittedAt === 'string' ? value.submittedAt : '',
    proposedDelta: mapDelta(value.proposedDelta),
  })
}

export function createGasChangeReviewRepository({ callOperation }) {
  if (typeof callOperation !== 'function') throw new TypeError('callOperation is required')
  return Object.freeze({
    async listPending({ page = 1, pageSize = 10 } = {}) {
      const response = await callPaginatedOperation({ callOperation, operation: 'changes.listPending', page, pageSize })
      const result = mapPaginatedData(response.data, mapPending)
      return { changes: result.items, pagination: result.pagination, requestId: response.requestId }
    },
    async review({ requestId, decision }) {
      const response = await callOperation('changes.review', { requestId, decision })
      if (!response.data || response.data.requestId !== requestId || !['APPROVE', 'REJECT'].includes(response.data.status)) {
        throw new ChangeReviewContractError()
      }
      return { requestId, status: response.data.status, responseRequestId: response.requestId }
    },
  })
}