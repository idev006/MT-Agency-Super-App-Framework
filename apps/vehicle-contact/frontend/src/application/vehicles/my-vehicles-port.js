export const myVehiclesRepositoryKey = Symbol('myVehiclesRepository')

export function assertMyVehiclesRepository(repository) {
  const methods = ['listMine', 'submitChange', 'listMyChanges']
  if (!repository || methods.some((method) => typeof repository[method] !== 'function')) {
    throw new TypeError('invalid my vehicles repository')
  }
  return repository
}