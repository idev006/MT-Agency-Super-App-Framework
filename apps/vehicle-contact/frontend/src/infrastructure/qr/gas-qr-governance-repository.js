import { stickerOf, toSticker } from '../../domain/reference/sticker-categories.js'
function mapResult(response, tokenExpected) {
  const data = response?.data
  if (!data || typeof data.vehicleId !== 'string') throw Object.assign(new Error('Invalid QR response'), { code: 'INVALID_ENVELOPE' })
  if (tokenExpected && typeof data.token !== 'string') throw Object.assign(new Error('Invalid QR response'), { code: 'INVALID_ENVELOPE' })
  return { ...data, requestId: response.requestId || '' }
}
const why = ({ reason, note } = {}) => ({ reason, ...(String(note || '').trim() ? { note: String(note).trim() } : {}) })
const text = (value) => (typeof value === 'string' ? value : '')

// VC-ADR-036 S3: every QR change carries a reason; history is read-only and never contains a token.
export function createGasQrGovernanceRepository({ callOperation }) {
  return Object.freeze({
    issue: async (vehicleId, reason) => mapResult(await callOperation('qr.issue', { vehicleId, ...why(reason) }), true),
    revoke: async (vehicleId, reason) => mapResult(await callOperation('qr.revoke', { vehicleId, ...why(reason) }), false),
    replace: async (vehicleId, reason) => mapResult(await callOperation('qr.replace', { vehicleId, ...why(reason) }), true),
    // S5 / VC-ADR-032 B: the ACTIVE code of up to 100 vehicles (qr.manage), for display and printing.
    async exportCodes(vehicleIds) {
      const response = await callOperation('qr.export', { vehicleIds })
      const items = response?.data?.items
      if (!Array.isArray(items)) throw Object.assign(new Error('Invalid QR export'), { code: 'INVALID_ENVELOPE' })
      return items.map((x) => Object.freeze({
        vehicleId: text(x.vehicleId), status: text(x.status), plate: text(x.plate), province: text(x.province),
        vehicleType: text(x.vehicleType), brand: text(x.brand), model: text(x.model), color: text(x.color), stickerCategory: text(x.stickerCategory),
        sticker: toSticker(x.sticker) || stickerOf(text(x.stickerCategory)),
        qrId: text(x.qrId), issuedAt: text(x.issuedAt),
        token: x.status === 'READY' && /^[a-f0-9]{64}$/.test(text(x.token)) ? x.token : '',
      }))
    },
    async history(vehicleId) {
      const response = await callOperation('qr.history', { vehicleId })
      const items = response?.data?.items
      if (!Array.isArray(items)) throw Object.assign(new Error('Invalid QR history'), { code: 'INVALID_ENVELOPE' })
      return items.map((x) => Object.freeze({
        qrId: text(x.qrId), status: text(x.status), issuedAt: text(x.issuedAt), issuedByName: text(x.issuedByName),
        reason: text(x.reason), note: text(x.note), replacesQrId: text(x.replacesQrId), revokedAt: text(x.revokedAt),
        revokedByName: text(x.revokedByName), revokeReason: text(x.revokeReason), revokeNote: text(x.revokeNote),
      }))
    },
  })
}
