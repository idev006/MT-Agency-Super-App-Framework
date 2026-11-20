export const CUSTOM_COLOR_CHOICE = '__CUSTOM_COLOR__'

export function resolveColorValue(choice, customValue = '') {
  return String(choice || '') === CUSTOM_COLOR_CHOICE ? String(customValue || '').trim() : String(choice || '').trim()
}

export function reconcileColorValue(value, options = []) {
  const current = String(value || '').trim()
  if (!current) return Object.freeze({ choice: '', customValue: '' })
  if (options.some(({ code }) => code === current)) return Object.freeze({ choice: current, customValue: '' })
  return Object.freeze({ choice: CUSTOM_COLOR_CHOICE, customValue: current })
}
