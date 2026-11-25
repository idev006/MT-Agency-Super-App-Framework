// D2 (owner 2026-11-25: "Merge + D2 หน้าแอดมิน"): users / organizations / campaigns as DataTable +
// server-side filters (default = active) + drawer for row actions + create in a dialog.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { filterPayload } from '../src/infrastructure/api/pagination-contract.js'
import { createGasUserDirectoryRepository } from '../src/infrastructure/users/gas-user-directory-repository.js'
import { createGasOrganizationAdministrationRepository } from '../src/infrastructure/organizations/gas-organization-administration-repository.js'
import { createGasCampaignAdministrationRepository } from '../src/infrastructure/campaigns/gas-campaign-administration-repository.js'

const page = (items) => ({ data: { items, total: items.length, page: 1, pageSize: 10, totalPages: items.length ? 1 : 0 }, requestId: 'r' })
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('D2 admin lists', () => {
  it('filterPayload sends only non-empty filters (empty = no filter)', () => {
    expect(filterPayload({ status: 'ACTIVE', role: '', q: '  สภ ' })).toEqual({ status: 'ACTIVE', q: 'สภ' })
    expect(filterPayload(undefined)).toEqual({})
  })

  it('repositories pass filters to the server and map the display names it returns', async () => {
    const callOperation = vi.fn()
      .mockResolvedValueOnce(page([{ userId: 'u', username: 'a', organizationId: 'o', organizationName: 'สภ.เมือง', status: 'ACTIVE', roles: [] }]))
      .mockResolvedValueOnce(page([{ organization_id: 'o2', name: 'สภ.ย่อย', org_type: 'POLICE', parent_id: 'o', parentName: 'สภ.เมือง', status: 'ACTIVE' }]))
      .mockResolvedValueOnce(page([{ campaignId: 'c', startsAt: 'x', endsAt: 'y', maxSubmissions: 1, submittedCount: 0, status: 'ACTIVE', state: 'UPCOMING' }]))
    const users = await createGasUserDirectoryRepository({ callOperation }).list({ filters: { status: 'SUSPENDED', role: '', q: 'abc' } })
    const orgs = await createGasOrganizationAdministrationRepository({ callOperation }).list({ filters: { status: 'ACTIVE', type: 'POLICE' } })
    const camps = await createGasCampaignAdministrationRepository({ callOperation }).list({ filters: { state: 'CURRENT' } })
    expect(callOperation.mock.calls[0][1]).toEqual({ status: 'SUSPENDED', q: 'abc', page: 1, pageSize: 10 })
    expect(callOperation.mock.calls[1][1]).toEqual({ status: 'ACTIVE', type: 'POLICE', page: 1, pageSize: 10 })
    expect(callOperation.mock.calls[2][1]).toEqual({ state: 'CURRENT', page: 1, pageSize: 10 })
    expect(users.users[0].organizationName).toBe('สภ.เมือง')
    expect(orgs.organizations[0].parentName).toBe('สภ.เมือง')
    expect(camps.campaigns[0].state).toBe('UPCOMING')
  })

  it.each([
    ['UserDirectoryPage.vue', 'user', 'UserCreateDialog'],
    ['OrganizationAdministrationPage.vue', 'org', 'FormDialog'],
    ['CampaignAdministrationPage.vue', 'campaign', 'FormDialog'],
  ])('%s: filter bar → table → drawer (?%s=) → create dialog', (file, query, dialog) => {
    const src = read(`../src/pages/${file}`)
    expect(src).toContain('<ListFilterBar')
    expect(src).toContain('<EntityDrawer')
    expect(src).toContain(`route.query.${query}`)
    expect(src).toContain(`<${dialog}`)
    expect(src).toContain('FILTER_DEFAULTS')
  })

  it('no free-text organization id: users pick an organization from the list', () => {
    expect(read('../src/features/user-administration/components/UserCreateDialog.vue')).toContain('v-for="o in organizations"')
    expect(read('../src/features/user-administration/components/UserAdministrationPanel.vue')).not.toContain('รหัสหน่วยงาน')
  })
})
