export const vehicleMaintenanceRepositoryKey = Symbol('vehicleMaintenanceRepository')

export function assertVehicleMaintenanceRepository(repository) {
  const methods = ['updateVehicle', 'updateContact', 'replacePhoto', 'cancelVehicle']
  if (!repository || methods.some((method) => typeof repository[method] !== 'function')) {
    throw new TypeError('invalid vehicle maintenance repository')
  }
  return repository
}