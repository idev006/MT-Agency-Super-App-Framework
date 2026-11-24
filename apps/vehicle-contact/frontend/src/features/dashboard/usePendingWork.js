import { computed, inject, ref, watch } from 'vue'
import { registrationReviewRepositoryKey } from '../../application/registrations/registration-review-port.js'
import { changeReviewRepositoryKey } from '../../application/vehicles/change-review-port.js'
import { loadPendingCount, pendingSourcesFor } from '../../application/dashboard/pending-work.js'

export function usePendingWork(permissions) {
  const repositories = {
    registrationReview: inject(registrationReviewRepositoryKey, null),
    changeReview: inject(changeReviewRepositoryKey, null),
  }
  const sources = computed(() => pendingSourcesFor(permissions.value))
  const results = ref({})

  async function refresh(source) {
    results.value = { ...results.value, [source.id]: { id: source.id, status: 'loading', total: null, errorCode: '' } }
    const result = await loadPendingCount(source, repositories)
    results.value = { ...results.value, [source.id]: result }
  }

  function refreshAll() {
    return Promise.all(sources.value.map(refresh))
  }

  const items = computed(() => sources.value.map((source) => ({
    ...source, ...(results.value[source.id] || { status: 'loading', total: null, errorCode: '' }),
  })))

  watch(() => sources.value.map((source) => source.id).join(','), () => { refreshAll() }, { immediate: true })
  return { items, refresh, refreshAll }
}
