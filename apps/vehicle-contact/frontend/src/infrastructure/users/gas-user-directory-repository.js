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
  const roles = value.roles === undefined ? [] : value.roles
  if (!Array.isArray(roles) || roles.some((role) => typeof role !== 'string' || !role)) throw new UserDirectoryContractError()
  return Object.freeze({
    userId: requiredText(value.userId),
    username: requiredText(value.username),
    displayName: optionalText(value.displayName),
    organizationId: optionalText(value.organizationId),
    status: requiredText(value.status),
    roles: Object.freeze([...roles]),
  })
}

function mutationResult(response, expected = {}) {
  if (!response?.data || typeof response.data !== 'object' || Array.isArray(response.data)) throw new UserDirectoryContractError()
  for (const [key, kind] of Object.entries(expected)) {
    if (kind === 'string' && (typeof response.data[key] !== 'string' || !response.data[key])) throw new UserDirectoryContractError()
    if (kind === 'boolean' && typeof response.data[key] !== 'boolean') throw new UserDirectoryContractError()
    if (kind === 'array' && !Array.isArray(response.data[key])) throw new UserDirectoryContractError()
  }
  return { ...response.data, requestId: response.requestId || '' }
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
    async create(payload, { signal } = {}) {
      return mutationResult(await callOperation('users.create', payload, { signal }), { userId: 'string' })
    },
    async update(payload, { signal } = {}) {
      return mutationResult(await callOperation('users.update', payload, { signal }), { userId: 'string', updated: 'boolean' })
    },
    async suspend(userId, { signal } = {}) {
      return mutationResult(await callOperation('users.suspend', { userId }, { signal }), { userId: 'string', suspended: 'boolean' })
    },
    async resetPassword(userId, temporaryPassword, { signal } = {}) {
      return mutationResult(await callOperation('users.resetPassword', { userId, temporaryPassword }, { signal }), { userId: 'string', reset: 'boolean' })
    },
    async assignRoles(userId, roles, { signal } = {}) {
      return mutationResult(await callOperation('users.assignRoles', { userId, roles }, { signal }), { userId: 'string', roles: 'array' })
    },
  })
}
