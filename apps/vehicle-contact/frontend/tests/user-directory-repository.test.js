import { describe, expect, it, vi } from 'vitest'
import { createGasUserDirectoryRepository, UserDirectoryContractError } from '../src/infrastructure/users/gas-user-directory-repository.js'

describe('GAS user directory repository contract', () => {
  it('calls users.list with a bounded limit and keeps only approved fields including roles', async () => {
    const callOperation = vi.fn().mockResolvedValue({
      data: [{ userId: 'u-1', username: 'admin', displayName: 'ผู้ดูแล', organizationId: 'org-1', status: 'ACTIVE', password_hash: 'must-not-leak', roles: ['SYSTEM_ADMIN'] }],
      requestId: 'users-request',
    })
    const repository = createGasUserDirectoryRepository({ callOperation })
    const result = await repository.list({ limit: 50 })
    expect(callOperation).toHaveBeenCalledWith('users.list', { limit: 50 }, { signal: undefined })
    expect(result).toEqual({ users: [{ userId: 'u-1', username: 'admin', displayName: 'ผู้ดูแล', organizationId: 'org-1', status: 'ACTIVE', roles: ['SYSTEM_ADMIN'] }], requestId: 'users-request', limit: 50 })
    expect(JSON.stringify(result)).not.toContain('password_hash')
  })

  it('rejects malformed successful responses instead of guessing account fields', async () => {
    const repository = createGasUserDirectoryRepository({ callOperation: vi.fn().mockResolvedValue({ data: [{ username: 'missing-id' }], requestId: 'bad' }) })
    await expect(repository.list()).rejects.toEqual(expect.any(UserDirectoryContractError))
  })

  it('rejects limits outside the backend contract before transport', async () => {
    const callOperation = vi.fn()
    const repository = createGasUserDirectoryRepository({ callOperation })
    await expect(repository.list({ limit: 101 })).rejects.toEqual(expect.any(RangeError))
    expect(callOperation).not.toHaveBeenCalled()
  })

  it('maps every user administration operation without retaining credentials', async () => {
    const callOperation = vi.fn()
      .mockResolvedValueOnce({ data: { userId: 'u-2' }, requestId: 'create' })
      .mockResolvedValueOnce({ data: { userId: 'u-2', updated: true }, requestId: 'update' })
      .mockResolvedValueOnce({ data: { userId: 'u-2', suspended: true }, requestId: 'suspend' })
      .mockResolvedValueOnce({ data: { userId: 'u-2', reset: true }, requestId: 'reset' })
      .mockResolvedValueOnce({ data: { userId: 'u-2', roles: ['STAFF'] }, requestId: 'roles' })
    const repository = createGasUserDirectoryRepository({ callOperation })
    await repository.create({ username: 'staff.two', displayName: 'Staff Two', temporaryPassword: 'temporary-only-123' })
    await repository.update({ userId: 'u-2', displayName: 'Updated' })
    await repository.suspend('u-2')
    await repository.resetPassword('u-2', 'temporary-only-456')
    await repository.assignRoles('u-2', ['STAFF'])
    expect(callOperation.mock.calls.map((call) => call[0])).toEqual(['users.create', 'users.update', 'users.suspend', 'users.resetPassword', 'users.assignRoles'])
    expect(JSON.stringify(callOperation.mock.results)).not.toContain('temporary-only')
  })
})
