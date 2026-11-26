import { describe, expect, it, vi } from 'vitest'
import { createGasOrganizationAdministrationRepository, OrganizationContractError } from '../src/infrastructure/organizations/gas-organization-administration-repository.js'
import { createGasCampaignAdministrationRepository, CampaignContractError } from '../src/infrastructure/campaigns/gas-campaign-administration-repository.js'
import { createGasSystemSettingsRepository, SystemSettingsContractError } from '../src/infrastructure/settings/gas-system-settings-repository.js'

describe('SYSTEM_ADMIN governance repository contracts', () => {
  it('maps organization rows and strips storage fields', async () => {
    const callOperation = vi.fn().mockResolvedValue({ data: { items: [{ organization_id: 'org-1', name: 'กองบังคับการ', org_type: 'POLICE', parent_id: '', status: 'ACTIVE', internal: 'drop' }], total: 1, page: 1, pageSize: 10, totalPages: 1 }, requestId: 'orgs' })
    const result = await createGasOrganizationAdministrationRepository({ callOperation }).list()
    expect(result.organizations).toEqual([{ organizationId: 'org-1', name: 'กองบังคับการ', type: 'POLICE', parentId: '', parentName: '', status: 'ACTIVE' }])
    expect(JSON.stringify(result)).not.toContain('internal')
  })

  it('calls organization mutations with exact DTOs', async () => {
    const callOperation = vi.fn()
      .mockResolvedValueOnce({ data: { organizationId: 'org-2' }, requestId: 'create' })
      .mockResolvedValueOnce({ data: { organizationId: 'org-2', updated: true }, requestId: 'update' })
      .mockResolvedValueOnce({ data: { organizationId: 'org-2', disabled: true }, requestId: 'disable' })
    const repository = createGasOrganizationAdministrationRepository({ callOperation })
    await repository.create({ name: 'หน่วยทดสอบ', type: 'EXTERNAL' })
    await repository.update({ organizationId: 'org-2', name: 'ชื่อใหม่', parentId: '' })
    await repository.disable({ organizationId: 'org-2' })
    expect(callOperation.mock.calls.map((item) => [item[0], item[1]])).toEqual([
      ['organizations.create', { name: 'หน่วยทดสอบ', type: 'EXTERNAL' }],
      ['organizations.update', { organizationId: 'org-2', name: 'ชื่อใหม่', parentId: '' }],
      ['organizations.disable', { organizationId: 'org-2' }],
    ])
  })

  it('maps campaigns and keeps the creation token only in the returned result', async () => {
    const callOperation = vi.fn()
      .mockResolvedValueOnce({ data: { items: [{ campaignId: 'c-1', startsAt: '2026-11-19T00:00:00.000Z', endsAt: '2026-11-20T00:00:00.000Z', maxSubmissions: 10, submittedCount: 1, status: 'ACTIVE' }], total: 1, page: 1, pageSize: 10, totalPages: 1 }, requestId: 'list' })
      .mockResolvedValueOnce({ data: { campaignId: 'c-2', campaignToken: 'a'.repeat(64) }, requestId: 'create' })
    const repository = createGasCampaignAdministrationRepository({ callOperation })
    expect((await repository.list()).campaigns[0].submittedCount).toBe(1)
    expect((await repository.create({ startsAt: '2026-11-19T00:00:00.000Z', endsAt: '2026-11-20T00:00:00.000Z', maxSubmissions: 10 })).campaignToken).toHaveLength(64)
  })

  it('maps numeric setting strings and sends bounded integer keys', async () => {
    const callOperation = vi.fn()
      .mockResolvedValueOnce({ data: { idle_timeout_minutes: '45', retention_days: '365' }, requestId: 'get' })
      .mockResolvedValueOnce({ data: { idle_timeout_minutes: '60', retention_days: '730' }, requestId: 'update' })
    const repository = createGasSystemSettingsRepository({ callOperation })
    expect((await repository.get()).settings).toMatchObject({ idleTimeoutMinutes: 45, retentionDays: 365 })
    expect((await repository.update({ idleTimeoutMinutes: 60, retentionDays: 730 })).settings).toMatchObject({ idleTimeoutMinutes: 60, retentionDays: 730 })
    expect(callOperation).toHaveBeenLastCalledWith('system.config.update', { values: { idle_timeout_minutes: 60, retention_days: 730 } }, { signal: undefined })
  })

  it('preserves an unconfigured retention policy as empty instead of inventing a value', async () => {
    const repository = createGasSystemSettingsRepository({ callOperation: vi.fn().mockResolvedValue({ data: { idle_timeout_minutes: '30', retention_days: null }, requestId: 'get' }) })
    expect((await repository.get()).settings).toMatchObject({ idleTimeoutMinutes: 30, retentionDays: null })
  })

  it('fails closed for malformed successful responses', async () => {
    const malformedPage = { items: [{}], total: 1, page: 1, pageSize: 10, totalPages: 1 }
    await expect(createGasOrganizationAdministrationRepository({ callOperation: vi.fn().mockResolvedValue({ data: malformedPage }) }).list()).rejects.toBeInstanceOf(OrganizationContractError)
    await expect(createGasCampaignAdministrationRepository({ callOperation: vi.fn().mockResolvedValue({ data: malformedPage }) }).list()).rejects.toBeInstanceOf(CampaignContractError)
    await expect(createGasSystemSettingsRepository({ callOperation: vi.fn().mockResolvedValue({ data: { idle_timeout_minutes: 0, retention_days: 30 } }) }).get()).rejects.toBeInstanceOf(SystemSettingsContractError)
  })
})
