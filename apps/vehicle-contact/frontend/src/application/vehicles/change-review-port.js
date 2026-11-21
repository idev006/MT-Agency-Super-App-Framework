export const changeReviewRepositoryKey = Symbol('changeReviewRepository')

export function assertChangeReviewRepository(repository) {
  const methods = ['listPending', 'review']
  if (!repository || methods.some((method) => typeof repository[method] !== 'function')) {
    throw new TypeError('invalid change review repository')
  }
  return repository
}