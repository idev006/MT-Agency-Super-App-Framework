export const accountSecurityRepositoryKey = Symbol('accountSecurityRepository')

export function assertAccountSecurityRepository(repository) {
  if (!repository || typeof repository.changePassword !== 'function' || typeof repository.linkGoogle !== 'function') {
    throw new TypeError('account security repository must implement changePassword and linkGoogle')
  }
  return repository
}
