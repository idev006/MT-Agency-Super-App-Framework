import { computed, ref, unref } from 'vue'
import { assertVehicleRegistryRepository } from '../../application/vehicles/vehicle-registry-port.js'

function hasPermission(permissions, permission) {
  const values = Array.isArray(unref(permissions)) ? unref(permissions) : []
  return values.includes(permission)
}

export function useVehicleRegistry({ repository, permissions, withOptions = false }) {
  const source = assertVehicleRegistryRepository(repository)
  const phase = ref('idle')
  const vehicles = ref([])
  const failure = ref(null)
  const page = ref(1)
  const pageSize = ref(10)
  const pagination = ref({ total: 0, page: 1, pageSize: 10, totalPages: 0 })
  const canRead = computed(() => hasPermission(permissions, 'vehicle.list'))
  // VC-ADR-042 (print page): server-side filters + the choices for the filter bar (asked once)
  const filters = ref({})
  const filterOptions = ref(null)

  function capture(error) {
    failure.value = { code: error?.code || 'UNEXPECTED_ERROR', requestId: error?.requestId || '' }
    phase.value = error?.code === 'FORBIDDEN' ? 'forbidden'
      : error?.code === 'UNAUTHENTICATED' ? 'unauthenticated' : 'error'
  }

  async function load() {
    if (!canRead.value) { phase.value = 'forbidden'; return false }
    phase.value = 'loading'; failure.value = null
    try {
      const result = await source.list({ page: page.value, pageSize: pageSize.value, filters: filters.value, withFilterOptions: !filterOptions.value && withOptions })
      if (result.filterOptions) filterOptions.value = result.filterOptions
      if (result.pagination.totalPages > 0 && page.value > result.pagination.totalPages) {
        page.value = result.pagination.totalPages
        return load()
      }
      vehicles.value = result.vehicles
      pagination.value = result.pagination
      phase.value = result.vehicles.length ? 'success' : 'empty'
      return true
    } catch (error) { capture(error); return false }
  }

  return {
    phase, vehicles, failure, page, pageSize, pagination, canRead, filters, filterOptions,
    load,
    applyFilters: (value) => { filters.value = { ...value }; page.value = 1; return load() },
    changePage: (value) => { page.value = value; return load() },
    changePageSize: (value) => { pageSize.value = value; page.value = 1; return load() },
  }
}