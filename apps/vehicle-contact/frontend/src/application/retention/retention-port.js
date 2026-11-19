export const retentionRepositoryKey = Symbol('retentionRepository')
export function assertRetentionRepository(repository) {
  if (!repository || ['listDue', 'approve', 'status'].some((method) => typeof repository[method] !== 'function')) throw new TypeError('invalid retention repository')
  return repository
}
