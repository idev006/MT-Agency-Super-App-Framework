import { computed, ref, unref } from 'vue'
import { assertRegistrationReviewRepository } from '../../application/registrations/registration-review-port.js'

const WRITE_UNCERTAIN = new Set(['TIMEOUT', 'NETWORK_ERROR'])

export function useRegistrationReview({ repository, permissions }) {
  const source = assertRegistrationReviewRepository(repository)
  const phase = ref('idle')
  const actionPhase = ref('idle')
  const registrations = ref([])
  const selected = ref(null)
  const failure = ref(null)
  const page = ref(1)
  const pageSize = ref(10)
  const pagination = ref({ total: 0, page: 1, pageSize: 10, totalPages: 0 })
  const oneTimeQr = ref(null)
  const canReview = computed(() => {
    const values = Array.isArray(unref(permissions)) ? unref(permissions) : []
    return values.includes('vehicle.registration.approve')
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
      registrations.value = result.registrations
      pagination.value = result.pagination
      phase.value = result.registrations.length ? 'success' : 'empty'
      return true
    } catch (error) { capture(error, phase); return false }
  }

  async function inspect(requestId) {
    if (!canReview.value) { phase.value = 'forbidden'; return false }
    phase.value = 'loading-detail'; failure.value = null
    try {
      selected.value = (await source.detail(requestId)).registration
      phase.value = 'success'
      return true
    } catch (error) { capture(error, phase); return false }
  }

  async function review({ requestId, decision, platePhotoVerified = false }) {
    if (!canReview.value) { actionPhase.value = 'forbidden'; return false }
    actionPhase.value = 'submitting'; failure.value = null; oneTimeQr.value = null
    try {
      const result = await source.review({ requestId, decision, platePhotoVerified })
      if (result.qrToken) oneTimeQr.value = Object.freeze({ token: result.qrToken, qrId: result.qrId, vehicleId: result.vehicleId })
      selected.value = null
      actionPhase.value = 'success'
      await load()
      return true
    } catch (error) { capture(error, actionPhase); return false }
  }

  return {
    phase, actionPhase, registrations, selected, failure, page, pageSize, pagination, oneTimeQr, canReview,
    load, inspect, review,
    clearOneTimeQr: () => { oneTimeQr.value = null },
    clearSelection: () => { selected.value = null },
    changePage: (value) => { page.value = value; return load() },
    changePageSize: (value) => { pageSize.value = value; page.value = 1; return load() },
  }
}
