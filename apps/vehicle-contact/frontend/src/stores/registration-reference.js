import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { assertRegistrationReferenceRepository, mapRegistrationReferences } from '../application/reference-data/registration-reference-port.js'

const CACHE_KEY = 'p6vc-registration-reference-v1'
const EMPTY_LISTS = Object.freeze({ provinces: [], plateTypes: [], vehicleTypes: [], relationships: [], brands: [], models: [], colors: [] })

function storage() { return globalThis.sessionStorage }
function contextKey({ userId, transport, endpoint }) { return JSON.stringify([userId, transport, endpoint]) }
function loadCache(context) {
  try {
    const parsed = JSON.parse(storage()?.getItem(CACHE_KEY) || 'null')
    if (!parsed || parsed.context !== contextKey(context)) return null
    return mapRegistrationReferences(parsed.catalog)
  } catch { return null }
}
function saveCache(context, catalog) {
  storage()?.setItem(CACHE_KEY, JSON.stringify({ context: contextKey(context), catalog }))
}

export const useRegistrationReferenceStore = defineStore('registrationReference', () => {
  let repository = null
  let activeContext = null
  let pending = null
  let pendingContext = null
  let generation = 0
  const phase = ref('idle')
  const catalog = ref(null)
  const failure = ref(null)
  const lists = computed(() => catalog.value?.lists || EMPTY_LISTS)
  const organizations = computed(() => catalog.value?.organizations || [])
  const mode = computed(() => catalog.value?.mode || 'UNKNOWN')
  const version = computed(() => catalog.value?.version || '')

  function configure(value) { repository = assertRegistrationReferenceRepository(value) }
  function clear() {
    generation += 1; activeContext = null; pending = null; pendingContext = null
    catalog.value = null; failure.value = null; phase.value = 'idle'
    storage()?.removeItem(CACHE_KEY)
  }
  async function ensureLoaded(context, { force = false } = {}) {
    if (!repository) throw new TypeError('registration reference repository is not configured')
    const key = contextKey(context)
    if (!force && activeContext === key && catalog.value) return catalog.value
    if (!force && pending && pendingContext === key) return pending
    if (activeContext !== key) {
      if (activeContext) storage()?.removeItem(CACHE_KEY)
      catalog.value = null; failure.value = null; activeContext = key
    }
    if (!force) {
      const cached = loadCache(context)
      if (cached) { catalog.value = cached; phase.value = 'ready'; return cached }
    }
    phase.value = 'loading'; failure.value = null
    const currentGeneration = ++generation
    pendingContext = key
    const operation = repository.load().then((value) => {
      if (currentGeneration !== generation || activeContext !== key) return value
      catalog.value = value; phase.value = 'ready'; saveCache(context, value); return value
    }).catch((error) => {
      if (currentGeneration !== generation || activeContext !== key) throw error
      phase.value = 'error'; failure.value = { code: error?.code || 'REFERENCE_DATA_UNAVAILABLE', requestId: error?.requestId || '' }
      throw error
    }).finally(() => { if (currentGeneration === generation) { pending = null; pendingContext = null } })
    pending = operation
    return operation
  }
  async function reload() {
    if (!activeContext) throw new TypeError('registration reference context is missing')
    const [userId, transport, endpoint] = JSON.parse(activeContext)
    storage()?.removeItem(CACHE_KEY)
    return ensureLoaded({ userId, transport, endpoint }, { force: true })
  }

  return { phase, catalog, failure, lists, organizations, mode, version, configure, ensureLoaded, reload, clear }
})
