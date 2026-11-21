import { callPaginatedOperation, mapPaginatedData } from '../api/pagination-contract.js'

export class RegistrationReviewContractError extends Error {
  constructor() {
    super('Registration review response does not match the contract')
    this.name = 'RegistrationReviewContractError'
    this.code = 'INVALID_ENVELOPE'
    this.requestId = ''
  }
}

function requiredString(value) {
  if (typeof value !== 'string' || !value) throw new RegistrationReviewContractError()
  return value
}

function mapPending(value) {
  if (!value || typeof value !== 'object') throw new RegistrationReviewContractError()
  return Object.freeze({
    requestId: requiredString(value.requestId),
    vehicleId: requiredString(value.vehicleId),
    submittedAt: typeof value.submittedAt === 'string' ? value.submittedAt : '',
    status: requiredString(value.status),
  })
}

function mapDetail(value) {
  if (!value || typeof value !== 'object' || !value.application || typeof value.application !== 'object') {
    throw new RegistrationReviewContractError()
  }
  const application = value.application
  const photos = Array.isArray(application.photos)
    ? application.photos.map((photo) => Object.freeze({
      photoId: requiredString(photo?.photoId),
      slot: requiredString(photo?.slot),
      mimeType: typeof photo?.mimeType === 'string' ? photo.mimeType : '',
    }))
    : []
  return Object.freeze({
    requestId: requiredString(value.requestId),
    status: requiredString(value.status),
    submittedAt: typeof value.submittedAt === 'string' ? value.submittedAt : '',
    application: Object.freeze({
      plate: requiredString(application.plate_normalized),
      province: requiredString(application.province_code),
      plateType: typeof application.plate_type === 'string' ? application.plate_type : '',
      vehicleType: typeof application.vehicle_type === 'string' ? application.vehicle_type : '',
      brand: typeof application.make === 'string' ? application.make : '',
      model: typeof application.model === 'string' ? application.model : '',
      color: typeof application.color === 'string' ? application.color : '',
      organizationId: typeof application.organization_id === 'string' ? application.organization_id : '',
      relationship: typeof application.relationship === 'string' ? application.relationship : '',
      contactName: typeof application.contactName === 'string' ? application.contactName : '',
      contactPhone: typeof application.contactPhone === 'string' ? application.contactPhone : '',
      photos: Object.freeze(photos),
    }),
  })
}

export function createGasRegistrationReviewRepository({ callOperation }) {
  if (typeof callOperation !== 'function') throw new TypeError('callOperation is required')
  return Object.freeze({
    async listPending({ page = 1, pageSize = 10 } = {}) {
      const response = await callPaginatedOperation({ callOperation, operation: 'registrations.listPending', page, pageSize })
      const result = mapPaginatedData(response.data, mapPending)
      return { registrations: result.items, pagination: result.pagination, requestId: response.requestId }
    },
    async detail(requestId) {
      const response = await callOperation('registrations.detail', { requestId })
      return { registration: mapDetail(response.data), requestId: response.requestId }
    },
    async photo({ requestId, photoId }) {
      const response = await callOperation('registrations.photo', { requestId, photoId })
      const value = response.data
      if (!value || typeof value !== 'object' || value.photoId !== photoId
        || typeof value.slot !== 'string' || !value.slot
        || !['image/jpeg', 'image/png', 'image/webp'].includes(value.mimeType)
        || typeof value.base64Image !== 'string' || !value.base64Image || value.base64Image.length > 7_000_000
        || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.base64Image)) {
        throw new RegistrationReviewContractError()
      }
      return {
        photo: Object.freeze({ photoId: value.photoId, slot: value.slot, mimeType: value.mimeType, base64Image: value.base64Image }),
        requestId: response.requestId,
      }
    },
    async review({ requestId, decision, platePhotoVerified = false }) {
      const response = await callOperation('registrations.review', {
        requestId,
        decision,
        ...(decision === 'APPROVE' ? { platePhotoVerified } : {}),
      })
      if (!response.data || response.data.requestId !== requestId || !['APPROVED', 'REJECTED'].includes(response.data.status)) {
        throw new RegistrationReviewContractError()
      }
      return {
        requestId,
        vehicleId: typeof response.data.vehicleId === 'string' ? response.data.vehicleId : '',
        status: response.data.status,
        qrToken: typeof response.data.qrToken === 'string' ? response.data.qrToken : '',
        qrId: typeof response.data.qrId === 'string' ? response.data.qrId : '',
        responseRequestId: response.requestId,
      }
    },
  })
}
