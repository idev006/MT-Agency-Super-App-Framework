import { describe, expect, it, vi } from 'vitest'
import { useOrganizationAdministration } from '../src/features/organizations/useOrganizationAdministration.js'
import { useCampaignAdministration } from '../src/features/campaigns/useCampaignAdministration.js'
import { useSystemSettings } from '../src/features/settings/useSystemSettings.js'

describe('SYSTEM_ADMIN governance state machines', () => {
  it('loads and mutates organizations only with manage permission', async () => {
    const repository = { list: vi.fn().mockResolvedValue({ organizations: [], requestId: 'l' }), create: vi.fn().mockResolvedValue({ requestId: 'c' }), update: vi.fn(), disable: vi.fn() }
    const state = useOrganizationAdministration({ repository, permissions: ['organizations.manage'] })
    await state.load(); expect(state.phase.value).toBe('empty')
    await state.create({ name: 'A', type: 'POLICE' }); expect(state.actionPhase.value).toBe('success')
    expect(repository.list).toHaveBeenCalledTimes(2)
  })

  it('does not call organization writes with read-only permission', async () => {
    const repository = { list: vi.fn(), create: vi.fn(), update: vi.fn(), disable: vi.fn() }
    const state = useOrganizationAdministration({ repository, permissions: ['organizations.read'] })
    await state.create({ name: 'A', type: 'POLICE' })
    expect(state.actionPhase.value).toBe('forbidden'); expect(repository.create).not.toHaveBeenCalled()
  })

  it('holds a campaign token in memory until explicitly dismissed', async () => {
    const repository = { list: vi.fn().mockResolvedValue({ campaigns: [], requestId: 'l' }), create: vi.fn().mockResolvedValue({ campaignId: 'c', campaignToken: 'secret-once', requestId: 'c' }), revoke: vi.fn() }
    const state = useCampaignAdministration({ repository, permissions: ['campaigns.manage'] })
    await state.create({ startsAt: 'a', endsAt: 'b', maxSubmissions: 1 })
    expect(state.oneTimeToken.value).toEqual({ campaignId: 'c', token: 'secret-once' })
    state.clearOneTimeToken(); expect(state.oneTimeToken.value).toBeNull()
  })

  it('marks timeout after a write as uncertain and does not retry', async () => {
    const error = Object.assign(new Error('timeout'), { code: 'TIMEOUT', requestId: 'support' })
    const repository = { list: vi.fn(), create: vi.fn().mockRejectedValue(error), revoke: vi.fn() }
    const state = useCampaignAdministration({ repository, permissions: ['campaigns.manage'] })
    await state.create({})
    expect(state.actionPhase.value).toBe('uncertain'); expect(repository.create).toHaveBeenCalledTimes(1)
  })

  it('loads and updates mapped settings with separate read/manage permissions', async () => {
    const repository = { get: vi.fn().mockResolvedValue({ settings: { idleTimeoutMinutes: 30, retentionDays: 365 } }), update: vi.fn().mockResolvedValue({ settings: { idleTimeoutMinutes: 45, retentionDays: 730 } }) }
    const state = useSystemSettings({ repository, permissions: ['system.settings.read', 'system.settings.manage'] })
    await state.load(); await state.save({ idleTimeoutMinutes: 45, retentionDays: 730 })
    expect(state.settings.value).toEqual({ idleTimeoutMinutes: 45, retentionDays: 730 }); expect(state.savePhase.value).toBe('success')
  })
})
