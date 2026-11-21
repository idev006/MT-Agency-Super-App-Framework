import { computed, ref, unref } from 'vue'
import { assertChangeReviewRepository } from '../../application/vehicles/change-review-port.js'
import { assertVehicleDetailRepository } from '../../application/vehicles/vehicle-detail-port.js'

const WRITE_UNCERTAIN = new Set(['TIMEOUT', 'NETWORK_ERROR'])
const FIELD_LABELS = {
  contactName: 'ชื่อผู้ประสานงาน',
  contactPhone: 'เบอร์โทรผู้ประสานงาน',
  brand: 'ยี่ห้อ',
  model: 'รุ่น',
  color: 'สี',
}

function currentValue(field, vehicle) {
  if (!vehicle) return ''
  if (field === 'contactName' || field === 'contactPhone') {
    const contacts = vehicle.contacts || []
    const contact = contacts.find((item) => item.isPrimary) || contacts[0]
    if (!contact) return ''
    return field === 'contactName' ? contact.name : contact.phone
  }
  return vehicle[field] || ''
}

export function useChangeReview({ repository, detailRepository, permissions }) {
  const source = assertChangeReviewRepository(repository)
  const detailSource = assertVehicleDetailRepository(detailRepository)
  const phase = ref('idle')
  const actionPhase = ref('idle')
  const changes = ref([])
  const selected = ref(null)
  const currentVehicle = ref(null)
  const failure = ref(null)
  const page = ref(1)
  const pageSize = ref(10)
  const pagination = ref({ total: 0, page: 1, pageSize: 10, totalPages: 0 })
  const canReview = computed(() => {
    const values = Array.isArray(unref(permissions)) ? unref(permissions) : []
    return values.includes('vehicle.change.approve')
  })
  const diffRows = computed(() => {
    const delta = selected.value?.proposedDelta || {}
    return Object.keys(delta).map((field) => ({
      field,
      label: FIELD_LABELS[field] || field,
      current: currentValue(field, currentVehicle.value),
      proposed: delta[field],
    }))
  })

  function capture(error, target) {
    failure.value = { code: error?.code || 'UNEXPECTED_ERROR', requestId: error?.requestId || '' }
    target.value = error?.code === 'FORBIDDEN' ? 'forbidden'
      : error?.code === 'UNAUTHENTICATED' ? 'unauthenticated'
        : WRITE_UNCERTAIN.has(error?.code) ? 'uncertain' : 'error'
  }

  async function load() {
    if (!canReview.value) { phase.value = 'forbidden'; return false }
    phase.value = 'loading'; failure.value = null
    try {
      const result = await source.listPending({ page: page.value, pageSize: pageSize.value })
      if (result.pagination.totalPages > 0 && page.value > result.pagination.totalPages) {
        page.value = result.pagination.totalPages
        return load()
      }
      changes.value = result.changes
      pagination.value = result.pagination
      phase.value = result.changes.length ? 'success' : 'empty'
      return true
    } catch (error) { capture(error, phase); return false }
  }

  async function inspect(item) {
    if (!canReview.value) { phase.value = 'forbidden'; return false }
    phase.value = 'loading-detail'; failure.value = null
    selected.value = item; currentVehicle.value = null
    try {
      const perms = Array.isArray(unref(permissions)) ? unref(permissions) : []
      const { vehicle } = await detailSource.detail(item.vehicleId, { permissions: perms })
      currentVehicle.value = vehicle
      phase.value = 'success'
      return true
    } catch (error) { capture(error, phase); return false }
  }

  async function review({ requestId, decision }) {
    if (!canReview.value) { actionPhase.value = 'forbidden'; return false }
    actionPhase.value = 'submitting'; failure.value = null
    try {
      await source.review({ requestId, decision })
      selected.value = null; currentVehicle.value = null
      actionPhase.value = 'success'
      await load()
      return true
    } catch (error) { capture(error, actionPhase); return false }
  }

  return {
    phase, actionPhase, changes, selected, currentVehicle, diffRows, failure, page, pageSize, pagination, canReview,
    load, inspect, review,
    clearSelection: () => { selected.value = null; currentVehicle.value = null },
    changePage: (value) => { page.value = value; return load() },
    changePageSize: (value) => { pageSize.value = value; page.value = 1; return load() },
  }
}