import { callPaginatedOperation, mapPaginatedData } from '../api/pagination-contract.js'

export class OrganizationContractError extends Error {
  constructor() {
    super('Organization response does not match the contract')
    this.name = 'OrganizationContractError'
    this.code = 'INVALID_ORGANIZATION_RESPONSE'
    this.requestId = ''
  }
}

const text = (value, required = false) => {
  if (typeof value !== 'string' || (required && !value.trim())) throw new OrganizationContractError()
  return value.trim()
}

function mapOrganization(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OrganizationContractError()
  const type = text(value.org_type, true)
  if (!['POLICE', 'EXTERNAL'].includes(type)) throw new OrganizationContractError()
  return Object.freeze({
    organizationId: text(value.organization_id, true),
    name: text(value.name, true),
    type,
    parentId: text(value.parent_id || ''),
    status: text(value.status, true),
  })
}

export function createGasOrganizationAdministrationRepository({ callOperation }) {
  if (typeof callOperation !== 'function') throw new TypeError('callOperation is required')
  return Object.freeze({
    async list({ page = 1, pageSize = 10, signal } = {}) {
      const response = await callPaginatedOperation({ callOperation, operation: 'organizations.list', page, pageSize, options: { signal } })
      const result = mapPaginatedData(response.data, mapOrganization)
      return { organizations: result.items, pagination: result.pagination, requestId: response.requestId }
    },
    async create({ name, type, parentId = '', signal }) {
      const payload = { name, type, ...(parentId ? { parentId } : {}) }
      const response = await callOperation('organizations.create', payload, { signal })
      return { organizationId: text(response.data?.organizationId, true), requestId: response.requestId }
    },
    async update({ organizationId, name, parentId, signal }) {
      const payload = { organizationId, ...(name ? { name } : {}), ...(parentId !== undefined ? { parentId } : {}) }
      const response = await callOperation('organizations.update', payload, { signal })
      if (response.data?.updated !== true) throw new OrganizationContractError()
      return { organizationId: text(response.data.organizationId, true), updated: true, requestId: response.requestId }
    },
    async disable({ organizationId, signal }) {
      const response = await callOperation('organizations.disable', { organizationId }, { signal })
      if (response.data?.disabled !== true) throw new OrganizationContractError()
      return { organizationId: text(response.data.organizationId, true), disabled: true, requestId: response.requestId }
    },
    // VC-ADR-036: DISABLED -> ACTIVE
    async enable({ organizationId, signal }) {
      const response = await callOperation('organizations.enable', { organizationId }, { signal })
      if (response.data?.enabled !== true) throw new OrganizationContractError()
      return { organizationId: text(response.data.organizationId, true), enabled: true, requestId: response.requestId }
    },
  })
}
