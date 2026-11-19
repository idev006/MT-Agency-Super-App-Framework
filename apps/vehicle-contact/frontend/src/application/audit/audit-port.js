export const auditRepositoryKey = Symbol('auditRepository')
export function assertAuditRepository(repository) { if (!repository || ['query', 'exportJson'].some((method) => typeof repository[method] !== 'function')) throw new TypeError('invalid audit repository'); return repository }
