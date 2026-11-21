import { computed, ref, unref } from 'vue'
import { assertMyVehiclesRepository } from '../../application/vehicles/my-vehicles-port.js'

const WRITE_UNCERTAIN = new Set(['TIMEOUT', 'NETWORK_ERROR'])

function hasPermission(permissions, permission) {
  const values = Array.isArray(unref(permissions)) ? unref(permissions) : []
  return values.includes(permission)
}

export function useMyVehicles({ repository, permissions }) {
  const source = assertMyVehiclesRepository(repository)
  const phase = ref('idle')
  const actionPhase = ref('idle')
  const vehicles = ref([])
  const selectedVehicle = ref(null)
  const changes = ref([])
  const failure = ref(null)
  const lastSubmitted = ref(null)
  const page = ref(1)
  const pageSize = ref(10)
  const pagination = ref({ total: 0, page: 1, pageSize: 10, totalPages: 0 })
  const canRead = computed(() => hasPermission(permissions, 'vehicle.own.read'))
  const canSubmit = computed(() => hasPermission(permissions, 'vehicle.change.submit'))
  const selectedChanges = computed(() => {
    const vehicleId = selectedVehicle.value?.vehicleId
    return vehicleId ? changes.value.filter((item) => item.vehicleId === vehicleId) : []
  })

  function capture(error, target) {
    failure.value = { code: error?.code || 'UNEXPECTED_ERROR', requestId: error?.requestId || '' }
    target.value = error?.code === 'FORBIDDEN' ? 'forbidden'
      : error?.code === 'UNAUTHENTICATED' ? 'unauthenticated'
        : WRITE_UNCERTAIN.has(error?.code) ? 'uncertain' : 'error'
  }

  async function load() {
    if (!canRead.value) { phase.value = 'forbidden'; return false }
    phase.value = 'loading'; failure.value = null
    try {
      const result = await source.listMine({ page: page.value, pageSize: pageSize.value })
      if (result.pagination.totalPages > 0 && page.value > result.pagination.totalPages) {
        page.value = result.pagination.totalPages
        return load()
      }
      vehicles.value = result.vehicles
      pagination.value = result.pagination
      const track = await source.listMyChanges({ page: 1, pageSize: 50 })
      changes.value = track.changes
      phase.value = result.vehicles.length ? 'success' : 'empty'
      return true
    } catch (error) { capture(error, phase); return false }
  }

  function selectVehicle(vehicle) {
    selectedVehicle.value = vehicle
    actionPhase.value = 'idle'
    lastSubmitted.value = null
  }

  async function submitChange(delta) {
    if (!canSubmit.value) { actionPhase.value = 'forbidden'; return false }
    const vehicleId = selectedVehicle.value?.vehicleId
    if (!vehicleId) return false
    actionPhase.value = 'submitting'; failure.value = null
    try {
      const result = await source.submitChange({ vehicleId, delta })
      lastSubmitted.value = Object.freeze({ requestId: result.requestId })
      actionPhase.value = 'success'
      await load()
      selectedVehicle.value = vehicles.value.find((item) => item.vehicleId === vehicleId) || null
      return true
    } catch (error) { capture(error, actionPhase); return false }
  }

  return {
    phase, actionPhase, vehicles, selectedVehicle, changes, selectedChanges, failure, lastSubmitted,
    page, pageSize, pagination, canRead, canSubmit,
    load, selectVehicle, submitChange,
    clearSelection: () => { selectedVehicle.value = null; actionPhase.value = 'idle'; lastSubmitted.value = null },
    changePage: (value) => { page.value = value; return load() },
    changePageSize: (value) => { pageSize.value = value; page.value = 1; return load() },
  }
}