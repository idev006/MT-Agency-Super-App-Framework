import { computed, ref, unref } from 'vue'
import { assertOrganizationAdministrationRepository } from '../../application/organizations/organization-administration-port.js'

const AUTH_FAILURES = new Set(['UNAUTHENTICATED', 'SESSION_EXPIRED', 'SESSION_IDLE_EXPIRED'])
const UNCERTAIN_FAILURES = new Set(['TIMEOUT', 'NETWORK_ERROR', 'HTTP_502', 'HTTP_503', 'HTTP_504'])
const failureOf = (error) => ({ code: typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR', requestId: typeof error?.requestId === 'string' ? error.requestId : '' })

export function useOrganizationAdministration({ repository, permissions }) {
  const source = assertOrganizationAdministrationRepository(repository)
  const phase = ref('idle'), organizations = ref([]), failure = ref(null)
  const page = ref(1), pageSize = ref(10), pagination = ref({ total: 0, page: 1, pageSize: 10, totalPages: 0 })
  const actionPhase = ref('idle'), actionFailure = ref(null), lastAction = ref(null)
  const filters = ref({ status: 'ACTIVE', type: '', q: '' }) // D2
  const permissionList = computed(() => Array.isArray(unref(permissions)) ? unref(permissions) : [])
  const canRead = computed(() => permissionList.value.some((item) => ['organizations.read', 'organizations.manage'].includes(item)))
  const canManage = computed(() => permissionList.value.includes('organizations.manage'))

  async function load() {
    failure.value = null
    if (!canRead.value) { phase.value = 'forbidden'; return false }
    phase.value = 'loading'
    try {
      const result = await source.list({ page: page.value, pageSize: pageSize.value, filters: filters.value })
      if (result.pagination.totalPages > 0 && page.value > result.pagination.totalPages) { page.value = result.pagination.totalPages; return load() }
      organizations.value = result.organizations
      pagination.value = result.pagination
      phase.value = organizations.value.length ? 'success' : 'empty'
      return true
    } catch (error) {
      failure.value = failureOf(error)
      phase.value = failure.value.code === 'FORBIDDEN' ? 'forbidden' : AUTH_FAILURES.has(failure.value.code) ? 'unauthenticated' : 'error'
      return false
    }
  }

  async function write(kind, task) {
    actionFailure.value = null; lastAction.value = null
    if (!canManage.value) { actionPhase.value = 'forbidden'; return false }
    actionPhase.value = 'submitting'
    try {
      const result = await task()
      lastAction.value = { kind, requestId: result.requestId || '' }
      actionPhase.value = 'success'
      await load()
      return true
    } catch (error) {
      actionFailure.value = failureOf(error)
      actionPhase.value = UNCERTAIN_FAILURES.has(actionFailure.value.code) ? 'uncertain' : AUTH_FAILURES.has(actionFailure.value.code) ? 'unauthenticated' : actionFailure.value.code === 'FORBIDDEN' ? 'forbidden' : 'error'
      return false
    }
  }

  return {
    phase, organizations, failure, page, pageSize, pagination, filters,
    applyFilters: (value) => { filters.value = { ...filters.value, ...value }; page.value = 1; return load() },
    actionPhase, actionFailure, lastAction, canRead, canManage, load,
    changePage: (value) => { page.value = value; return load() },
    changePageSize: (value) => { pageSize.value = value; page.value = 1; return load() },
    create: (input) => write('create', () => source.create(input)),
    update: (input) => write('update', () => source.update(input)),
    disable: (organizationId) => write('disable', () => source.disable({ organizationId })),
    enable: (organizationId) => write('enable', () => source.enable({ organizationId })),
  }
}
