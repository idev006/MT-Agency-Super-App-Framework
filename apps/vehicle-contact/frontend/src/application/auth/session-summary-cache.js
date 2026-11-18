const SESSION_SUMMARY_KEY = 'p6vc-session-summary'

function text(value) {
  return typeof value === 'string' ? value : ''
}

function stringList(value) {
  return Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === 'string' && item))] : []
}

export function normalizeSessionSummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const userId = text(value.userId)
  if (!userId) return null
  return Object.freeze({
    userId,
    displayName: text(value.displayName),
    organizationId: text(value.organizationId) || null,
    roles: stringList(value.roles),
    permissions: stringList(value.permissions),
    expiresAt: text(value.expiresAt),
    mustChangePassword: value.mustChangePassword === true,
  })
}

export function loadSessionSummary(storage = globalThis.sessionStorage) {
  try {
    const raw = storage?.getItem(SESSION_SUMMARY_KEY)
    return raw ? normalizeSessionSummary(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function saveSessionSummary(value, storage = globalThis.sessionStorage) {
  const summary = normalizeSessionSummary(value)
  if (!summary) return null
  storage?.setItem(SESSION_SUMMARY_KEY, JSON.stringify(summary))
  return summary
}

export function clearSessionSummary(storage = globalThis.sessionStorage) {
  storage?.removeItem(SESSION_SUMMARY_KEY)
}
