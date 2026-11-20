export const registrationReferenceRepositoryKey = Symbol('registrationReferenceRepository')

export class RegistrationReferenceContractError extends Error {
  constructor() {
    super('Registration reference response does not match the contract')
    this.name = 'RegistrationReferenceContractError'
    this.code = 'INVALID_ENVELOPE'
    this.requestId = ''
  }
}

const MODES = new Set(['LEGACY', 'ADVISORY', 'ENFORCED'])
const LIST_KEYS = Object.freeze(['provinces', 'plateTypes', 'vehicleTypes', 'relationships', 'brands', 'models', 'colors'])
const CODE = /^[A-Z0-9][A-Z0-9._-]{0,63}$/
const ORGANIZATION_CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/
const VERSION = /^[a-f0-9]{64}$/i

function parseOptions(value, { models = false, codePattern = CODE } = {}) {
  if (!Array.isArray(value) || value.length > 5000) throw new RegistrationReferenceContractError()
  const seen = new Set()
  return Object.freeze(value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new RegistrationReferenceContractError()
    const code = typeof item.code === 'string' ? item.code : ''
    const label = typeof item.label === 'string' ? item.label.trim() : ''
    const parentCode = typeof item.parentCode === 'string' ? item.parentCode : ''
    if (!codePattern.test(code) || !label || label.length > 120 || seen.has(code)) throw new RegistrationReferenceContractError()
    if ((models && !CODE.test(parentCode)) || (!models && parentCode)) throw new RegistrationReferenceContractError()
    seen.add(code)
    return Object.freeze({ code, label, ...(models ? { parentCode } : {}) })
  }))
}

export function mapRegistrationReferences(data, requestId = '') {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !MODES.has(data.mode) || !VERSION.test(data.version || '')) {
    throw new RegistrationReferenceContractError()
  }
  if (!data.lists || typeof data.lists !== 'object' || Array.isArray(data.lists)) throw new RegistrationReferenceContractError()
  const lists = Object.fromEntries(LIST_KEYS.map((key) => [key, parseOptions(data.lists[key], { models: key === 'models' })]))
  const brandCodes = new Set(lists.brands.map(({ code }) => code))
  if (lists.models.some(({ parentCode }) => !brandCodes.has(parentCode))) throw new RegistrationReferenceContractError()
  const organizations = parseOptions(data.organizations, { codePattern: ORGANIZATION_CODE })
  const policies = data.policies && typeof data.policies === 'object' && !Array.isArray(data.policies) ? { ...data.policies } : null
  if (!policies || (data.mode !== 'LEGACY' && [...LIST_KEYS, 'organizations'].some((key) => !['ADVISORY', 'ENFORCED'].includes(policies[key])))) {
    throw new RegistrationReferenceContractError()
  }
  return Object.freeze({
    mode: data.mode,
    version: data.version.toLowerCase(),
    lists: Object.freeze(lists),
    organizations,
    policies: Object.freeze(policies),
    requestId,
  })
}

export function assertRegistrationReferenceRepository(repository) {
  if (!repository || typeof repository.load !== 'function') throw new TypeError('invalid registration reference repository')
  return repository
}
