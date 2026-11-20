export const CUSTOM_BRAND_CHOICE = '__CUSTOM_BRAND__'

export function resolveBrandValue(choice, customValue = '') {
  return String(choice || '') === CUSTOM_BRAND_CHOICE ? String(customValue || '').trim() : String(choice || '').trim()
}

export function reconcileBrandValue(value, options = []) {
  const current = String(value || '').trim()
  if (!current) return Object.freeze({ choice: '', customValue: '' })
  if (options.some(({ code }) => code === current)) return Object.freeze({ choice: current, customValue: '' })
  return Object.freeze({ choice: CUSTOM_BRAND_CHOICE, customValue: current })
}
