import { describe, expect, it, vi } from 'vitest'
import { createGasUserDirectoryRepository, UserDirectoryContractError } from '../src/infrastructure/users/gas-user-directory-repository.js'

describe('GAS user directory repository contract', () => {
  it('calls users.list with a bounded limit and strips unapproved fields', async () => {
    const callOperation = vi.fn().mockResolvedValue({
      data: [{ userId: 'u-1', username: 'admin', displayName: 'ผู้ดูแล', organizationId: 'org-1', status: 'ACTIVE', password_hash: 'must-not-leak', roles: ['SYSTEM_ADMIN'] }],
      requestId: 'users-request',
    })
    const repository = createGasUserDirectoryRepository({ callOperation })
    const result = await repository.list({ limit: 50 })
    expect(callOperation).toHaveBeenCalledWith('users.list', { limit: 50 }, { signal: undefined })
    expect(result).toEqual({ users: [{ userId: 'u-1', username: 'admin', displayName: 'ผู้ดูแล', organizationId: 'org-1', status: 'ACTIVE' }], requestId: 'users-request', limit: 50 })
    expect(JSON.stringify(result)).not.toContain('password_hash')
    expect(JSON.stringify(result)).not.toContain('SYSTEM_ADMIN')
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
})
