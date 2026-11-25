import { mapVehicleResponse, mapVehicleHistory } from './gas-vehicle-search-repository.js'

const t = (v) => (typeof v === 'string' ? v : '')
// VC-ADR-036 S2: Vehicle 360 dimensions. The server only sends what the session may see; anything absent
// stays undefined so the UI hides it (never inferred client-side).
export function mapVehicle360(data) {
  const out = {}
  if ('createdByName' in (data || {})) {
    out.owner = data.owner ? Object.freeze({ name: t(data.owner.name) }) : null
    out.createdByName = t(data.createdByName)
    out.updatedByName = t(data.updatedByName)
    out.registration = data.registration ? Object.freeze({ status: t(data.registration.status), submittedAt: t(data.registration.submittedAt),
      reviewedAt: t(data.registration.reviewedAt), reviewedByName: t(data.registration.reviewedByName), campaignName: t(data.registration.campaignName),
      viaCampaign: data.registration.viaCampaign === true }) : null
    out.changeRequests = Array.isArray(data.changeRequests) ? data.changeRequests.map((c) => Object.freeze({ status: t(c.status), submittedAt: t(c.submittedAt),
      submittedByName: t(c.submittedByName), reviewedAt: t(c.reviewedAt), reviewedByName: t(c.reviewedByName),
      fields: Array.isArray(c.fields) ? c.fields.filter((f) => typeof f === 'string') : [] })) : []
    out.retention = data.retention ? Object.freeze({ status: t(data.retention.status), dueAt: t(data.retention.dueAt), approvedAt: t(data.retention.approvedAt),
      approvedByName: t(data.retention.approvedByName), legalHold: data.retention.legalHold === true }) : null
  }
  if (Array.isArray(data?.accessLog)) out.accessLog = data.accessLog.map((a) => Object.freeze({ at: t(a.at), actorName: t(a.actorName), source: t(a.source), result: t(a.result) }))
  return Object.freeze(out)
}

export function createGasVehicleDetailRepository({ callOperation }) {
  if (typeof callOperation !== 'function') throw new TypeError('callOperation is required')
  return Object.freeze({
    async detail(vehicleId, { permissions = [], signal } = {}) {
      const response = await callOperation('vehicles.detail', { vehicleId: String(vehicleId || '').trim() }, { signal })
      const vehicle = mapVehicleResponse(response.data, new Set(permissions))
      if (!vehicle) return { vehicle: null, version: 0, requestId: response.requestId }
      const version = Number.isSafeInteger(response.data?.version) ? response.data.version : 0
      // Backend ≥0.9.14 embeds history (registration events included); null = not embedded.
      const history = Array.isArray(response.data?.history) ? mapVehicleHistory(response.data.history) : null
      return { vehicle, version, history, extras: mapVehicle360(response.data), requestId: response.requestId }
    },
    // R7: approved-vehicle evidence photo (bytes stay in memory; every view is audited server-side).
    async photo({ vehicleId, photoId }, { signal } = {}) {
      const response = await callOperation('vehicles.photo', { vehicleId: String(vehicleId || '').trim(), photoId: String(photoId || '').trim() }, { signal })
      const data = response.data || {}
      if (typeof data.base64Image !== 'string' || !/^image\/(jpeg|png|webp)$/.test(data.mimeType || '')) throw Object.assign(new Error('invalid photo'), { code: 'INVALID_ENVELOPE' })
      return { photoId: data.photoId, slot: data.slot, dataUrl: `data:${data.mimeType};base64,${data.base64Image}` }
    },
    async history(vehicleId, { signal } = {}) {
      const response = await callOperation('vehicles.history', { vehicleId: String(vehicleId || '').trim() }, { signal })
      return { history: mapVehicleHistory(response.data), requestId: response.requestId }
    },
  })
}