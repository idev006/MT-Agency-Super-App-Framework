export const campaignAdministrationRepositoryKey = Symbol('campaignAdministrationRepository')

export function assertCampaignAdministrationRepository(repository) {
  for (const method of ['list', 'create', 'revoke']) {
    if (typeof repository?.[method] !== 'function') throw new TypeError(`campaign repository must implement ${method}`)
  }
  return repository
}
