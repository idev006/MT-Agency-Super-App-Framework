export const vehicleSearchRepositoryKey = Symbol('vehicleSearchRepository')

export function assertVehicleSearchRepository(repository) {
  if (!repository || typeof repository.lookup !== 'function') {
    throw new TypeError('vehicle search repository must implement lookup')
  }
  return repository
}
