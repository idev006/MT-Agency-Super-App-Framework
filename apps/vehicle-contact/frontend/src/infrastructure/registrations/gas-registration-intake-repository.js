import { toPhotoPolicy } from '../../domain/media/photo-policy.js'

export class RegistrationIntakeContractError extends Error {
  constructor() {
    super('Registration intake response does not match the contract')
    this.name = 'RegistrationIntakeContractError'
    this.code = 'INVALID_ENVELOPE'
    this.requestId = ''
  }
}

function text(value) {
  if (typeof value !== 'string' || !value) throw new RegistrationIntakeContractError()
  return value
}

export function createGasRegistrationIntakeRepository({ callPublicOperation }) {
  if (typeof callPublicOperation !== 'function') throw new TypeError('callPublicOperation is required')
  return Object.freeze({
    async validateCampaign(campaignToken) {
      const response = await callPublicOperation('campaigns.validate', { campaignToken })
      if (response.data?.valid !== true) throw new RegistrationIntakeContractError()
      // VC-ADR-038: the person types the registrant can choose from (ACTIVE only; [] from an older backend)
      const stickerCategories = (Array.isArray(response.data.stickerCategories) ? response.data.stickerCategories : [])
        .filter((c) => typeof c?.code === 'string' && typeof c?.label === 'string').map((c) => Object.freeze({ code: c.code, label: c.label }))
      // VC-ADR-055: the photo rules the device applies (null from an older backend → the defaults)
      return { campaignId: text(response.data.campaignId), valid: true, stickerCategories, photoPolicy: toPhotoPolicy(response.data.photoPolicy), requestId: response.requestId }
    },
    async uploadPhoto({ campaignToken, slot, base64Image, mimeType }) {
      const response = await callPublicOperation('photos.upload', { campaignToken, slot, base64Image, mimeType })
      if (response.data?.slot !== slot) throw new RegistrationIntakeContractError()
      return { photoId: text(response.data.photoId), slot, requestId: response.requestId }
    },
    async submit(payload) {
      const response = await callPublicOperation('registrations.submit', payload)
      if (!response.data || response.data.status !== 'PENDING_APPROVAL') throw new RegistrationIntakeContractError()
      return {
        requestId: text(response.data.requestId),
        vehicleId: text(response.data.vehicleId),
        status: response.data.status,
        responseRequestId: response.requestId,
      }
    },
  })
}
