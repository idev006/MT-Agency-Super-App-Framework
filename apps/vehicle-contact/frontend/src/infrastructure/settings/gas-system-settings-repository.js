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
  })
}
