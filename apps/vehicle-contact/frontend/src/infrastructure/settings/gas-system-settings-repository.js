import { DEFAULT_STICKER_CATEGORIES, toSticker, toStickerList } from '../../domain/reference/sticker-categories.js'
export class SystemSettingsContractError extends Error {
  constructor() {
    super('System settings response does not match the contract')
    this.name = 'SystemSettingsContractError'
    this.code = 'INVALID_SYSTEM_SETTINGS_RESPONSE'
    this.requestId = ''
  }
}

function mapSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SystemSettingsContractError()
  const parse = (input, max, { optional = false } = {}) => {
    if (optional && input === null) return null
    const result = Number(input)
    if (!Number.isSafeInteger(result) || result < 1 || result > max) throw new SystemSettingsContractError()
    return result
  }
  return Object.freeze({
    idleTimeoutMinutes: parse(value.idle_timeout_minutes, 480),
    retentionDays: parse(value.retention_days, 3650, { optional: true }),
    // VC-ADR-038: person types + sticker colours (backend ≥0.9.33; the defaults before that)
    stickerCategories: Array.isArray(value.sticker_categories) ? toStickerList(value.sticker_categories) : DEFAULT_STICKER_CATEGORIES.map(toSticker),
  })
}

export function createGasSystemSettingsRepository({ callOperation }) {
  if (typeof callOperation !== 'function') throw new TypeError('callOperation is required')
  return Object.freeze({
    async get({ signal } = {}) {
      const response = await callOperation('system.config.get', {}, { signal })
      return { settings: mapSettings(response.data), requestId: response.requestId }
    },
    async update({ idleTimeoutMinutes, retentionDays, signal }) {
      const values = { idle_timeout_minutes: idleTimeoutMinutes, retention_days: retentionDays }
      const response = await callOperation('system.config.update', { values }, { signal })
      return { settings: mapSettings(response.data), requestId: response.requestId }
    },
    async updateStickerCategories({ categories, signal }) {
      const list = categories.map(({ code, label, colour, hex, size, active }) => ({ code, label, colour, hex, size, active }))
      const response = await callOperation('system.config.update', { values: { sticker_categories: list } }, { signal })
      return { settings: mapSettings(response.data), requestId: response.requestId }
    },
  })
}
