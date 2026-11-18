export class UserDirectoryContractError extends Error {
  constructor(message = 'User directory response does not match the contract') {
    super(message)
    this.name = 'UserDirectoryContractError'
    this.code = 'INVALID_USER_DIRECTORY_RESPONSE'
    this.requestId = ''
  }
}

function requiredText(value) {
  if (typeof value !== 'string' || !value.trim()) throw new UserDirectoryContractError()
  return value.trim()
}

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function mapUser(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new UserDirectoryContractError()
  return Object.freeze({
    userId: requiredText(value.userId),
    username: requiredText(value.username),
    displayName: optionalText(value.displayName),
    organizationId: optionalText(value.organizationId),
    status: requiredText(value.status),
  })
}

export function createGasUserDirectoryRepository({ callOperation }) {
  if (typeof callOperation !== 'function') throw new TypeError('callOperation is required')
  return Object.freeze({
    async list({ limit = 50, signal } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError('limit must be between 1 and 100')
      const response = await callOperation('users.list', { limit }, { signal })
      if (!Array.isArray(response.data)) throw new UserDirectoryContractError()
      return {
        users: response.data.map(mapUser),
        requestId: response.requestId,
        limit,
      }
    },
  })
}
