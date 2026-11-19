export const qrGovernanceRepositoryKey = Symbol('qrGovernanceRepository')

export function assertQrGovernanceRepository(repository) {
  const methods = ['issue', 'revoke', 'replace']
  if (!repository || methods.some((method) => typeof repository[method] !== 'function')) throw new TypeError('invalid QR governance repository')
  return repository
}
