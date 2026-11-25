export const PAGE_SIZE_OPTIONS = Object.freeze([1, 5, 10, 15, 25, 50, 100])

export class PaginationContractError extends Error {
  constructor() {
    super('Paginated response does not match the contract')
    this.name = 'PaginationContractError'
    this.code = 'INVALID_PAGINATION_RESPONSE'
    this.requestId = ''
  }
}

export function assertPaginationInput(page, pageSize) {
  if (!Number.isSafeInteger(page) || page < 1 || !PAGE_SIZE_OPTIONS.includes(pageSize)) throw new RangeError('invalid pagination')
}

export function mapPaginatedData(value, mapItem) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.items)) throw new PaginationContractError()
  const { total, page, pageSize, totalPages } = value
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(page) || page < 1
    || !PAGE_SIZE_OPTIONS.includes(pageSize) || !Number.isSafeInteger(totalPages) || totalPages !== Math.ceil(total / pageSize)) {
    throw new PaginationContractError()
  }
  return Object.freeze({
    items: Object.freeze(value.items.map(mapItem)),
    pagination: Object.freeze({ total, page, pageSize, totalPages }),
  })
}

// D2: drop empty filter values so the server sees only real filters (and an empty filter = no filter).
export function filterPayload(filters = {}) {
  return Object.fromEntries(Object.entries(filters || {}).filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => [k, v.trim()]))
}

const LEGACY_PAGINATION_ERRORS = new Set(['HTTP_403', 'INVALID_REQUEST'])

export async function callPaginatedOperation({ callOperation, operation, payload = {}, page, pageSize, options }) {
  assertPaginationInput(page, pageSize)
  try {
    return await callOperation(operation, { ...payload, page, pageSize }, options)
  } catch (error) {
    if (!LEGACY_PAGINATION_ERRORS.has(error?.code)) throw error
  }

  const response = await callOperation(operation, { ...payload, limit: 100 }, options)
  if (!Array.isArray(response.data)) throw new PaginationContractError()
  const total = response.data.length
  return {
    ...response,
    data: {
      items: response.data.slice((page - 1) * pageSize, page * pageSize),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}
