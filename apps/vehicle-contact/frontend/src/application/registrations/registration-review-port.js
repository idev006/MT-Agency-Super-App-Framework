export const registrationReviewRepositoryKey = Symbol('registrationReviewRepository')

export function assertRegistrationReviewRepository(repository) {
  const methods = ['listPending', 'detail', 'review', 'photo']
  if (!repository || methods.some((method) => typeof repository[method] !== 'function')) {
    throw new TypeError('invalid registration review repository')
  }
  return repository
}
