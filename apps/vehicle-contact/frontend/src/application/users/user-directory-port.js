export const userDirectoryRepositoryKey = Symbol('userDirectoryRepository')

export function assertUserDirectoryRepository(repository) {
  if (!repository || typeof repository.list !== 'function') {
    throw new TypeError('user directory repository must implement list')
  }
  return repository
}

export function assertUserAdministrationRepository(repository) {
  const required = ['create', 'update', 'suspend', 'resetPassword', 'assignRoles']
  if (!repository || required.some((method) => typeof repository[method] !== 'function')) {
    throw new TypeError(`user administration repository must implement ${required.join(', ')}`)
  }
  return repository
}
