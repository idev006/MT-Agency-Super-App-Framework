import { describe, expect, it, vi } from 'vitest'
import { useUserAdministration } from '../src/features/user-administration/useUserAdministration.js'

function repository(overrides = {}) {
  return {
    create: vi.fn().mockResolvedValue({ userId: 'u-1' }), update: vi.fn().mockResolvedValue({ updated: true }),
    suspend: vi.fn().mockResolvedValue({ suspended: true }), resetPassword: vi.fn().mockResolvedValue({ reset: true }),
    assignRoles: vi.fn().mockResolvedValue({ roles: ['STAFF'] }), ...overrides,
  }
}

describe('useUserAdministration', () => {
  it('executes mutations and reloads the authoritative directory', async () => {
    const source = repository()
    const reload = vi.fn().mockResolvedValue(true)
    const admin = useUserAdministration({ repository: source, reload })
    await expect(admin.createUser({ username: 'staff' })).resolves.toBe(true)
    await expect(admin.updateUser({ userId: 'u-1', displayName: 'Staff' })).resolves.toBe(true)
    await expect(admin.suspendUser('u-1')).resolves.toBe(true)
    await expect(admin.resetPassword('u-1', 'temporary-only-123')).resolves.toBe(true)
    await expect(admin.assignRoles('u-1', ['STAFF'])).resolves.toBe(true)
    expect(reload).toHaveBeenCalledTimes(5)
    expect(admin.phase.value).toBe('success')
  })

  it('fails closed and does not reload after backend denial', async () => {
    const error = Object.assign(new Error('denied'), { code: 'SELF_SUSPEND_DENIED', requestId: 'request-1' })
    const reload = vi.fn()
    const admin = useUserAdministration({ repository: repository({ suspend: vi.fn().mockRejectedValue(error) }), reload })
    await expect(admin.suspendUser('self')).resolves.toBe(false)
    expect(admin.failure.value).toEqual({ code: 'SELF_SUSPEND_DENIED', requestId: 'request-1' })
    expect(reload).not.toHaveBeenCalled()
  })
})
