import { callPaginatedOperation, filterPayload, mapPaginatedData } from '../api/pagination-contract.js'

export class CampaignContractError extends Error {
  constructor() {
    super('Campaign response does not match the contract')
    this.name = 'CampaignContractError'
    this.code = 'INVALID_CAMPAIGN_RESPONSE'
    this.requestId = ''
  }
}

const requiredText = (value) => {
  if (typeof value !== 'string' || !value.trim()) throw new CampaignContractError()
  return value.trim()
}
const count = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new CampaignContractError()
  return value
}
const optionalText = (value) => (typeof value === 'string' ? value.trim() : '')
const positiveCount = (value) => {
  if (!Number.isSafeInteger(value) || value < 1) throw new CampaignContractError()
  return value
}

function mapCampaign(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CampaignContractError()
  return Object.freeze({
    campaignId: requiredText(value.campaignId),
    startsAt: requiredText(value.startsAt),
    endsAt: requiredText(value.endsAt),
    maxSubmissions: positiveCount(value.maxSubmissions),
    submittedCount: count(value.submittedCount),
    status: requiredText(value.status),
    // VC-ADR-031: present for campaigns created from 0.9.20; empty for older ones (code unrecoverable).
    name: optionalText(value.name),
    campaignToken: optionalText(value.campaignToken),
    state: optionalText(value.state), // D2: server-clock OPEN | UPCOMING | ENDED | REVOKED
  })
}

export function createGasCampaignAdministrationRepository({ callOperation }) {
  if (typeof callOperation !== 'function') throw new TypeError('callOperation is required')
  return Object.freeze({
    async list({ page = 1, pageSize = 10, filters = {}, signal } = {}) {
      const response = await callPaginatedOperation({ callOperation, operation: 'campaigns.list', payload: filterPayload(filters), page, pageSize, options: { signal } })
      const result = mapPaginatedData(response.data, mapCampaign)
      return { campaigns: result.items, pagination: result.pagination, requestId: response.requestId }
    },
    async create({ name, startsAt, endsAt, maxSubmissions, signal }) {
      const payload = { startsAt, endsAt, maxSubmissions, ...(name?.trim() ? { name: name.trim() } : {}) }
      const response = await callOperation('campaigns.create', payload, { signal })
      return {
        campaignId: requiredText(response.data?.campaignId),
        campaignToken: requiredText(response.data?.campaignToken),
        requestId: response.requestId,
      }
    },
    async revoke({ campaignId, signal }) {
      const response = await callOperation('campaigns.revoke', { campaignId }, { signal })
      if (response.data?.revoked !== true) throw new CampaignContractError()
      return { campaignId: requiredText(response.data.campaignId), revoked: true, requestId: response.requestId }
    },
  })
}
