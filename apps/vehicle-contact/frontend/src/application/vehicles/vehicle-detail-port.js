export const vehicleDetailRepositoryKey = Symbol('vehicleDetailRepository')

export function assertVehicleDetailRepository(repository) {
  if (!repository || typeof repository.detail !== 'function') {
    throw new TypeError('invalid vehicle detail repository')
  }
  return repository
}