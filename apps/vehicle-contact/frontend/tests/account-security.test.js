import { describe, expect, it, vi } from 'vitest'
import { createGasAccountSecurityRepository } from '../src/infrastructure/auth/gas-account-security-repository.js'
import { useAccountSecurity } from '../src/features/account-security/useAccountSecurity.js'

describe('account security contract', () => {
  it('changes password, requires reauthentication, and invokes session cleanup', async () => {
    const callOperation = vi.fn().mockResolvedValue({ data: { changed: true, reauthenticate: true }, requestId: 'change-1' })
    const source = createGasAccountSecurityRepository({ callOperation })
    const onReauthenticate = vi.fn()
    const security = useAccountSecurity({ repository: source, onReauthenticate })
    await expect(security.changePassword({ oldPassword: 'old-password', newPassword: 'new-password' })).resolves.toBe(true)
    expect(callOperation).toHaveBeenCalledWith('auth.changePassword', { oldPassword: 'old-password', newPassword: 'new-password' }, { signal: undefined })
    expect(onReauthenticate).toHaveBeenCalledOnce()
  })

  it('links Google through the protected adapter', async () => {
    const callOperation = vi.fn().mockResolvedValue({ data: { linked: true }, requestId: 'link-1' })
    const source = createGasAccountSecurityRepository({ callOperation })
    await expect(source.linkGoogle({ password: 'account-password', idToken: 'oidc-token' })).resolves.toMatchObject({ linked: true, requestId: 'link-1' })
  })

  it('maps backend denial without reauthentication', async () => {
    const error = Object.assign(new Error('denied'), { code: 'INVALID_CREDENTIALS', requestId: 'denied-1' })
    const onReauthenticate = vi.fn()
    const security = useAccountSecurity({ repository: { changePassword: vi.fn().mockRejectedValue(error), linkGoogle: vi.fn() }, onReauthenticate })
    await expect(security.changePassword({})).resolves.toBe(false)
    expect(security.failure.value).toEqual({ code: 'INVALID_CREDENTIALS', requestId: 'denied-1' })
    expect(onReauthenticate).not.toHaveBeenCalled()
  })
})
