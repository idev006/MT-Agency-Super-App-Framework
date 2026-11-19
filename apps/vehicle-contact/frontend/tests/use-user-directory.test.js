import { describe, expect, it, vi } from 'vitest'
import { useUserDirectory } from '../src/features/user-directory/useUserDirectory.js'

describe('useUserDirectory state machine', () => {
  it('loads authorized users and reaches success', async () => {
    const list = vi.fn().mockResolvedValue({ users: [{ userId: 'u-1' }], pagination: { total: 1, page: 1, pageSize: 10, totalPages: 1 }, requestId: 'id' })
    const directory = useUserDirectory({ repository: { list }, permissions: ['users.manage'] })
    await expect(directory.load()).resolves.toBe(true)
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 10 })
    expect(directory.phase.value).toBe('success')
  })

  it('does not call the repository without users.manage', async () => {
    const list = vi.fn()
    const directory = useUserDirectory({ repository: { list }, permissions: ['organizations.read'] })
    await directory.load()
    expect(directory.phase.value).toBe('forbidden')
    expect(list).not.toHaveBeenCalled()
  })

  it('maps an empty authoritative response to empty', async () => {
    const directory = useUserDirectory({ repository: { list: vi.fn().mockResolvedValue({ users: [], pagination: { total: 0, page: 1, pageSize: 10, totalPages: 0 }, requestId: 'empty' }) }, permissions: ['users.manage'] })
    await directory.load()
    expect(directory.phase.value).toBe('empty')
  })

  it.each([['FORBIDDEN', 'forbidden'], ['SESSION_EXPIRED', 'unauthenticated'], ['TIMEOUT', 'recoverable-error'], ['INVALID_USER_DIRECTORY_RESPONSE', 'error']])('maps %s to %s', async (code, phase) => {
    const error = Object.assign(new Error('private detail'), { code, requestId: 'support-id' })
    const directory = useUserDirectory({ repository: { list: vi.fn().mockRejectedValue(error) }, permissions: ['users.manage'] })
    await directory.load()
    expect(directory.phase.value).toBe(phase)
    expect(directory.failure.value).toEqual({ code, requestId: 'support-id' })
  })
})
