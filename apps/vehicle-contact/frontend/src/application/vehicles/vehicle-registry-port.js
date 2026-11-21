export const vehicleRegistryRepositoryKey = Symbol('vehicleRegistryRepository')

export function assertVehicleRegistryRepository(repository) {
  const methods = ['list']
  if (!repository || methods.some((method) => typeof repository[method] !== 'function')) {
    throw new TypeError('invalid vehicle registry repository')
  }
  return repository
}