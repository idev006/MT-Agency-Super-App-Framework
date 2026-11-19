import { computed, ref, unref } from 'vue'
import { assertUserDirectoryRepository } from '../../application/users/user-directory-port.js'

const AUTH_FAILURES = new Set(['UNAUTHENTICATED', 'SESSION_EXPIRED', 'SESSION_IDLE_EXPIRED'])
const RETRYABLE_FAILURES = new Set(['TIMEOUT', 'NETWORK_ERROR', 'HTTP_429', 'BUSY'])

export function useUserDirectory({ repository, permissions }) {
  const source = assertUserDirectoryRepository(repository)
  const phase = ref('idle')
  const result = ref(null)
  const failure = ref(null)
  const page = ref(1)
  const pageSize = ref(10)
  const permissionList = computed(() => Array.isArray(unref(permissions)) ? unref(permissions) : [])
  const canReadUsers = computed(() => permissionList.value.includes('users.manage'))

  async function load() {
    result.value = null
    failure.value = null
    if (!canReadUsers.value) {
      phase.value = 'forbidden'
      failure.value = { code: 'FORBIDDEN', requestId: '' }
      return false
    }
    phase.value = 'loading'
    try {
      result.value = await source.list({ page: page.value, pageSize: pageSize.value })
      if (result.value.pagination.totalPages > 0 && page.value > result.value.pagination.totalPages) {
        page.value = result.value.pagination.totalPages
        return load()
      }
      phase.value = result.value.users.length ? 'success' : 'empty'
      return true
    } catch (error) {
      const code = typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR'
      failure.value = { code, requestId: typeof error?.requestId === 'string' ? error.requestId : '' }
      if (code === 'FORBIDDEN') phase.value = 'forbidden'
      else if (AUTH_FAILURES.has(code)) phase.value = 'unauthenticated'
      else phase.value = RETRYABLE_FAILURES.has(code) ? 'recoverable-error' : 'error'
      return false
    }
  }

  async function changePage(value) { page.value = value; return load() }
  async function changePageSize(value) { pageSize.value = value; page.value = 1; return load() }

  return { phase, result, failure, page, pageSize, canReadUsers, load, changePage, changePageSize }
}
