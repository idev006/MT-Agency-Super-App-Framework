export const systemSettingsRepositoryKey = Symbol('systemSettingsRepository')

export function assertSystemSettingsRepository(repository) {
  for (const method of ['get', 'update']) {
    if (typeof repository?.[method] !== 'function') throw new TypeError(`system settings repository must implement ${method}`)
  }
  return repository
}
