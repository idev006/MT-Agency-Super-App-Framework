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
  const photoStates = ref({})
  const activePhotoId = ref('')
  // Photo bytes live in memory only; changing selection invalidates in-flight loads.
  let photoLoadToken = 0
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

  function resetPhotos() {
    photoLoadToken += 1
    photoStates.value = {}
    activePhotoId.value = ''
  }

  async function loadPhoto(photoId) {
    const requestId = selected.value?.requestId
    if (!requestId || !canReview.value) return
    const current = photoStates.value[photoId]
    if (current && (current.status === 'ready' || current.status === 'loading')) return
    const token = photoLoadToken
    photoStates.value = { ...photoStates.value, [photoId]: { status: 'loading' } }
    try {
      const { photo } = await source.photo({ requestId, photoId })
      if (token !== photoLoadToken) return
      photoStates.value = { ...photoStates.value, [photoId]: { status: 'ready', dataUrl: `data:${photo.mimeType};base64,${photo.base64Image}` } }
    } catch (error) {
      if (token !== photoLoadToken) return
      photoStates.value = { ...photoStates.value, [photoId]: { status: 'error', code: error?.code || 'UNEXPECTED_ERROR' } }
    }
  }

  async function loadPhotos(photos) {
    const token = photoLoadToken
    for (const photo of photos) {
      if (token !== photoLoadToken) return
      await loadPhoto(photo.photoId)
    }
  }

  function selectPhoto(photoId) {
    activePhotoId.value = photoId
    return loadPhoto(photoId)
  }

  function retryPhoto(photoId) {
    const next = { ...photoStates.value }
    delete next[photoId]
    photoStates.value = next
    return loadPhoto(photoId)
  }

  async function inspect(requestId) {
    if (!canReview.value) { phase.value = 'forbidden'; return false }
    phase.value = 'loading-detail'; failure.value = null
    try {
      selected.value = (await source.detail(requestId)).registration
      resetPhotos()
      const photos = Array.isArray(selected.value?.application?.photos) ? selected.value.application.photos : []
      if (photos.length) {
        activePhotoId.value = (photos.find((photo) => photo.slot === 'FRONT') || photos[0]).photoId
        const ordered = [...photos].sort((a, b) => (a.photoId === activePhotoId.value ? -1 : b.photoId === activePhotoId.value ? 1 : 0))
        void loadPhotos(ordered)
      }
      phase.value = 'success'
      return true
    } catch (error) { capture(error, phase); return false }
  }

  // R5: registrations.review is idempotent per (request, decision) — the backend replays an
  // APPLIED decision and returns the same deterministic QR token — so after an uncertain outcome
  // the safe action is to resend exactly the same decision, never a different one.
  const lastDecision = ref(null)

  async function review({ requestId, decision, platePhotoVerified = false }) {
    if (!canReview.value) { actionPhase.value = 'forbidden'; return false }
    lastDecision.value = Object.freeze({ requestId, decision, platePhotoVerified })
    actionPhase.value = 'submitting'; failure.value = null; oneTimeQr.value = null
    try {
      const result = await source.review({ requestId, decision, platePhotoVerified })
      if (result.qrToken) oneTimeQr.value = Object.freeze({ token: result.qrToken, qrId: result.qrId, vehicleId: result.vehicleId })
      selected.value = null
      resetPhotos()
      lastDecision.value = null
      actionPhase.value = 'success'
      await load()
      return true
    } catch (error) { capture(error, actionPhase); return false }
  }

  return {
    phase, actionPhase, registrations, selected, failure, page, pageSize, pagination, oneTimeQr, canReview,
    photoStates, activePhotoId,
    lastDecision, load, inspect, review, selectPhoto, retryPhoto,
    resendDecision: () => (lastDecision.value ? review(lastDecision.value) : Promise.resolve(false)),
    clearOneTimeQr: () => { oneTimeQr.value = null },
    clearSelection: () => { selected.value = null; resetPhotos() },
    changePage: (value) => { page.value = value; return load() },
    changePageSize: (value) => { pageSize.value = value; page.value = 1; return load() },
  }
}
