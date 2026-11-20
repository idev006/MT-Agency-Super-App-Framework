export const registrationIntakeRepositoryKey = Symbol('registrationIntakeRepository')

export function assertRegistrationIntakeRepository(repository) {
  if (!repository || ['validateCampaign', 'uploadPhoto', 'submit'].some((method) => typeof repository[method] !== 'function')) {
    throw new TypeError('invalid registration intake repository')
  }
  return repository
}
