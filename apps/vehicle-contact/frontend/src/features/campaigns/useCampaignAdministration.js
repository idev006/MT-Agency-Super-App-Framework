import { computed, ref, unref } from 'vue'
import { assertCampaignAdministrationRepository } from '../../application/campaigns/campaign-administration-port.js'

const AUTH_FAILURES = new Set(['UNAUTHENTICATED', 'SESSION_EXPIRED', 'SESSION_IDLE_EXPIRED'])
const UNCERTAIN_FAILURES = new Set(['TIMEOUT', 'NETWORK_ERROR', 'HTTP_502', 'HTTP_503', 'HTTP_504'])
const failureOf = (error) => ({ code: typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR', requestId: typeof error?.requestId === 'string' ? error.requestId : '' })

export function useCampaignAdministration({ repository, permissions }) {
  const source = assertCampaignAdministrationRepository(repository)
  const phase = ref('idle'), campaigns = ref([]), failure = ref(null)
  const actionPhase = ref('idle'), actionFailure = ref(null), oneTimeToken = ref(null)
  const permissionList = computed(() => Array.isArray(unref(permissions)) ? unref(permissions) : [])
  const canManage = computed(() => permissionList.value.includes('campaigns.manage'))

  async function load() {
    failure.value = null
    if (!canManage.value) { phase.value = 'forbidden'; return false }
    phase.value = 'loading'
    try {
      const result = await source.list({ limit: 50 })
      campaigns.value = result.campaigns
      phase.value = campaigns.value.length ? 'success' : 'empty'
      return true
    } catch (error) {
      failure.value = failureOf(error)
      phase.value = failure.value.code === 'FORBIDDEN' ? 'forbidden' : AUTH_FAILURES.has(failure.value.code) ? 'unauthenticated' : 'error'
      return false
    }
  }

  async function create(input) {
    actionFailure.value = null; oneTimeToken.value = null
    if (!canManage.value) { actionPhase.value = 'forbidden'; return false }
    actionPhase.value = 'submitting'
    try {
      const result = await source.create(input)
      oneTimeToken.value = { campaignId: result.campaignId, token: result.campaignToken }
      actionPhase.value = 'success'
      await load()
      return true
    } catch (error) {
      actionFailure.value = failureOf(error)
      actionPhase.value = UNCERTAIN_FAILURES.has(actionFailure.value.code) ? 'uncertain' : AUTH_FAILURES.has(actionFailure.value.code) ? 'unauthenticated' : actionFailure.value.code === 'FORBIDDEN' ? 'forbidden' : 'error'
      return false
    }
  }

  async function revoke(campaignId) {
    actionFailure.value = null
    if (!canManage.value) { actionPhase.value = 'forbidden'; return false }
    actionPhase.value = 'submitting'
    try {
      await source.revoke({ campaignId })
      actionPhase.value = 'success'
      await load()
      return true
    } catch (error) {
      actionFailure.value = failureOf(error)
      actionPhase.value = UNCERTAIN_FAILURES.has(actionFailure.value.code) ? 'uncertain' : AUTH_FAILURES.has(actionFailure.value.code) ? 'unauthenticated' : actionFailure.value.code === 'FORBIDDEN' ? 'forbidden' : 'error'
      return false
    }
  }

  return { phase, campaigns, failure, actionPhase, actionFailure, oneTimeToken, canManage, load, create, revoke, clearOneTimeToken: () => { oneTimeToken.value = null } }
}
