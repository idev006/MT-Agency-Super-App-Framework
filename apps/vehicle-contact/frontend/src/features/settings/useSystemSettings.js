import { computed, ref, unref } from 'vue'
import { assertSystemSettingsRepository } from '../../application/settings/system-settings-port.js'

const AUTH_FAILURES = new Set(['UNAUTHENTICATED', 'SESSION_EXPIRED', 'SESSION_IDLE_EXPIRED'])
const UNCERTAIN_FAILURES = new Set(['TIMEOUT', 'NETWORK_ERROR', 'HTTP_502', 'HTTP_503', 'HTTP_504'])
const failureOf = (error) => ({ code: typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR', requestId: typeof error?.requestId === 'string' ? error.requestId : '' })

export function useSystemSettings({ repository, permissions }) {
  const source = assertSystemSettingsRepository(repository)
  const phase = ref('idle'), settings = ref(null), failure = ref(null)
  const savePhase = ref('idle'), saveFailure = ref(null)
  const permissionList = computed(() => Array.isArray(unref(permissions)) ? unref(permissions) : [])
  const canRead = computed(() => permissionList.value.includes('system.settings.read'))
  const canManage = computed(() => permissionList.value.includes('system.settings.manage'))

  async function load() {
    failure.value = null
    if (!canRead.value) { phase.value = 'forbidden'; return false }
    phase.value = 'loading'
    try { settings.value = (await source.get()).settings; phase.value = 'success'; return true }
    catch (error) {
      failure.value = failureOf(error)
      phase.value = failure.value.code === 'FORBIDDEN' ? 'forbidden' : AUTH_FAILURES.has(failure.value.code) ? 'unauthenticated' : 'error'
      return false
    }
  }

  async function save(values) {
    saveFailure.value = null
    if (!canManage.value) { savePhase.value = 'forbidden'; return false }
    savePhase.value = 'submitting'
    try { settings.value = (await source.update(values)).settings; savePhase.value = 'success'; return true }
    catch (error) {
      saveFailure.value = failureOf(error)
      savePhase.value = UNCERTAIN_FAILURES.has(saveFailure.value.code) ? 'uncertain' : AUTH_FAILURES.has(saveFailure.value.code) ? 'unauthenticated' : saveFailure.value.code === 'FORBIDDEN' ? 'forbidden' : 'error'
      return false
    }
  }

  // VC-ADR-038: save the whole person-type / sticker-colour list (system admin)
  const stickerPhase = ref('idle'), stickerFailure = ref(null)
  async function saveStickerCategories(categories) {
    stickerFailure.value = null
    if (!canManage.value || typeof source.updateStickerCategories !== 'function') { stickerPhase.value = 'forbidden'; return false }
    stickerPhase.value = 'submitting'
    try { settings.value = (await source.updateStickerCategories({ categories })).settings; stickerPhase.value = 'success'; return true }
    catch (error) { stickerFailure.value = failureOf(error); stickerPhase.value = UNCERTAIN_FAILURES.has(stickerFailure.value.code) ? 'uncertain' : 'error'; return false }
  }

  // VC-ADR-040: save which logs are kept and for how long (system admin)
  const logPhase = ref('idle'), logFailure = ref(null)
  async function saveLogPolicy(policy) {
    logFailure.value = null
    if (!canManage.value || typeof source.updateLogPolicy !== 'function') { logPhase.value = 'forbidden'; return false }
    logPhase.value = 'submitting'
    try { settings.value = (await source.updateLogPolicy({ policy })).settings; logPhase.value = 'success'; return true }
    catch (error) { logFailure.value = failureOf(error); logPhase.value = UNCERTAIN_FAILURES.has(logFailure.value.code) ? 'uncertain' : 'error'; return false }
  }

  // VC-ADR-055: save the photo rules (system admin)
  const photoPhase = ref('idle'), photoFailure = ref(null)
  async function savePhotoPolicy(policy) {
    photoFailure.value = null
    if (!canManage.value || typeof source.updatePhotoPolicy !== 'function') { photoPhase.value = 'forbidden'; return false }
    photoPhase.value = 'submitting'
    try { settings.value = (await source.updatePhotoPolicy({ policy })).settings; photoPhase.value = 'success'; return true }
    catch (error) { photoFailure.value = failureOf(error); photoPhase.value = UNCERTAIN_FAILURES.has(photoFailure.value.code) ? 'uncertain' : 'error'; return false }
  }

  return { phase, settings, failure, savePhase, saveFailure, canRead, canManage, load, save, stickerPhase, stickerFailure, saveStickerCategories,
    logPhase, logFailure, saveLogPolicy, photoPhase, photoFailure, savePhotoPolicy }
}
