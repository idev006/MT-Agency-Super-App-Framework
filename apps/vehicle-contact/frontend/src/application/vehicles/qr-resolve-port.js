export const qrResolveRepositoryKey = Symbol('qrResolveRepository')

export function assertQrResolveRepository(repository) {
  if (!repository || typeof repository.resolve !== 'function') {
    throw new TypeError('QR resolve repository must implement resolve')
  }
  return repository
}
