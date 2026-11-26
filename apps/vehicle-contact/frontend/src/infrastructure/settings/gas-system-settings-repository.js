import { DEFAULT_STICKER_CATEGORIES, toSticker, toStickerList } from '../../domain/reference/sticker-categories.js'
import { toLogCounts, toLogPolicy } from '../../domain/settings/log-policy.js'
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
    // VC-ADR-040: which logs are kept and for how long (backend ≥0.9.35; null before that → the card is hidden)
    logPolicy: toLogPolicy(value.log_policy),
    logCounts: toLogCounts(value.log_counts),
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
    // VC-ADR-039 system reset (system.reset): preview counts, then execute with phrase + password + plan digest
    async resetPreview({ keepUsers = true, keepCampaigns = false, signal } = {}) {
      const response = await callOperation('system.reset.preview', { keepUsers, keepCampaigns }, { signal })
      const d = response.data
      if (!d || typeof d.planDigest !== 'string' || typeof d.phrase !== 'string') throw new SystemSettingsContractError()
      const counts = (o) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([, n]) => Number.isSafeInteger(n)))
      return { phrase: d.phrase, planDigest: d.planDigest, deleteByTable: counts(d.deleteByTable), keptByTable: counts(d.keptByTable),
        deleteTotal: Number(d.deleteTotal) || 0, driveFiles: Number(d.driveFiles) || 0 }
    },
    async resetExecute({ confirmation, password, planDigest, keepUsers = true, keepCampaigns = false }) {
      const response = await callOperation('system.reset.execute', { confirmation, password, planDigest, keepUsers, keepCampaigns })
      const d = response.data
      if (!d || !Number.isSafeInteger(d.deleted)) throw new SystemSettingsContractError()
      return { deleted: d.deleted, drive: { status: String(d.drive?.status || ''), trashed: Number(d.drive?.trashed) || 0, more: d.drive?.more === true } }
    },
    async updateLogPolicy({ policy, signal }) {
      const list = policy.map(({ code, enabled, days }) => ({ code, enabled, days }))
      const response = await callOperation('system.config.update', { values: { log_policy: list } }, { signal })
      return { settings: mapSettings(response.data), requestId: response.requestId }
    },
    async updateStickerCategories({ categories, signal }) {
      const list = categories.map(({ code, label, colour, hex, size, active }) => ({ code, label, colour, hex, size, active }))
      const response = await callOperation('system.config.update', { values: { sticker_categories: list } }, { signal })
      return { settings: mapSettings(response.data), requestId: response.requestId }
    },
  })
}
