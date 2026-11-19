export const organizationAdministrationRepositoryKey = Symbol('organizationAdministrationRepository')

export function assertOrganizationAdministrationRepository(repository) {
  for (const method of ['list', 'create', 'update', 'disable']) {
    if (typeof repository?.[method] !== 'function') throw new TypeError(`organization repository must implement ${method}`)
  }
  return repository
}
