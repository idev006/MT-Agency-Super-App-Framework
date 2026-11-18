export const userDirectoryRepositoryKey = Symbol('userDirectoryRepository')

export function assertUserDirectoryRepository(repository) {
  if (!repository || typeof repository.list !== 'function') {
    throw new TypeError('user directory repository must implement list')
  }
  return repository
}
