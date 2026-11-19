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
  })
}

export function createGasCampaignAdministrationRepository({ callOperation }) {
  if (typeof callOperation !== 'function') throw new TypeError('callOperation is required')
  return Object.freeze({
    async list({ limit = 50, signal } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError('limit must be between 1 and 100')
      const response = await callOperation('campaigns.list', { limit }, { signal })
      if (!Array.isArray(response.data)) throw new CampaignContractError()
      return { campaigns: response.data.map(mapCampaign), requestId: response.requestId }
    },
    async create({ startsAt, endsAt, maxSubmissions, signal }) {
      const response = await callOperation('campaigns.create', { startsAt, endsAt, maxSubmissions }, { signal })
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
