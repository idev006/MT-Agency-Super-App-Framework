// VC-ADR-031 (owner 2026-11-25): "รหัส campaign ไม่ควรหายไป ต้องสามารถคัดลอกได้ตลอด ลองคิดถึงการใช้งานด้วย"
import { describe, expect, it, vi } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { campaignRegistrationLink, isCampaignCode, campaignDisplayName } from '../src/domain/campaigns/campaign-link.js'
import { qrImageDataUrl } from '../src/infrastructure/media/qr-image.js'
import { createGasCampaignAdministrationRepository } from '../src/infrastructure/campaigns/gas-campaign-administration-repository.js'
import CampaignAdministrationPanel from '../src/features/campaigns/components/CampaignAdministrationPanel.vue'
import CampaignShareTools from '../src/features/campaigns/components/CampaignShareTools.vue'
import { readFileSync } from 'node:fs'

const CODE = 'ab'.repeat(32)
const future = new Date(Date.now() + 86400e3).toISOString(), past = new Date(Date.now() - 86400e3).toISOString()
const open = { campaignId: 'c1', name: 'ลงทะเบียน สภ.เมือง', startsAt: past, endsAt: future, maxSubmissions: 10, submittedCount: 4, status: 'ACTIVE', campaignToken: CODE }

describe('VC-ADR-031 shareable campaign', () => {
  it('builds a link with the code in the hash fragment (never sent as Referer) and rejects non-codes', () => {
    expect(campaignRegistrationLink(CODE, { origin: 'https://x.github.io', pathname: '/p6/' })).toBe(`https://x.github.io/p6/#/register?c=${CODE}`)
    expect(campaignRegistrationLink('nope', { origin: 'a', pathname: '/' })).toBe('')
    expect(isCampaignCode(CODE.toUpperCase())).toBe(true)
    expect(campaignDisplayName({ name: '  ' })).toBe('แคมเปญไม่มีชื่อ')
  })

  it('renders a QR image for posters', () => {
    expect(qrImageDataUrl(`https://x/#/register?c=${CODE}`)).toMatch(/^data:image\/gif;base64,/)
  })

  it('repository maps name/code (optional for old campaigns) and sends the name only when given', async () => {
    const callOperation = vi.fn()
      .mockResolvedValueOnce({ data: { items: [open, { ...open, campaignId: 'old', name: undefined, campaignToken: undefined }], total: 2, page: 1, pageSize: 10, totalPages: 1 }, requestId: 'r' })
      .mockResolvedValueOnce({ data: { campaignId: 'c2', campaignToken: CODE }, requestId: 'r' })
      .mockResolvedValueOnce({ data: { campaignId: 'c3', campaignToken: CODE }, requestId: 'r' })
    const repo = createGasCampaignAdministrationRepository({ callOperation })
    const { campaigns } = await repo.list({})
    expect(campaigns[0]).toMatchObject({ name: 'ลงทะเบียน สภ.เมือง', campaignToken: CODE })
    expect(campaigns[1]).toMatchObject({ name: '', campaignToken: '' })
    await repo.create({ name: '  ชื่อ ', startsAt: past, endsAt: future, maxSubmissions: 5 })
    expect(callOperation.mock.calls[1][1]).toEqual({ name: 'ชื่อ', startsAt: past, endsAt: future, maxSubmissions: 5 })
    await repo.create({ name: '', startsAt: past, endsAt: future, maxSubmissions: 5 })
    expect(callOperation.mock.calls[2][1]).not.toHaveProperty('name')
  })

  it('every open campaign keeps copy-link / QR / copy-code; old ones explain; closed ones offer nothing to share', async () => {
    // D2: share tools live in the campaign drawer; the table row keeps a one-click copy-link for open ones
    const items = [open, { ...open, campaignId: 'old', campaignToken: '' }, { ...open, campaignId: 'gone', status: 'REVOKED' }]
    const tools = {}
    for (const item of items) tools[item.campaignId] = await renderToString(createSSRApp(CampaignShareTools, { campaign: item }))
    const card = (id) => tools[id]
    const table = await renderToString(createSSRApp(CampaignAdministrationPanel, { campaigns: items, total: 3, lastCreatedId: 'c1' }))
    expect(table).toContain('คัดลอกลิงก์</button>')
    expect(table).toContain('4 / 10')
    expect(table.match(/คัดลอกลิงก์<\/button>/g)).toHaveLength(1)
    expect(card('c1')).toContain('คัดลอกลิงก์ลงทะเบียน')
    expect(card('c1')).toContain('แสดง QR')
    expect(card('c1')).toContain('คัดลอกรหัส')
    expect(card('old')).toContain('data-legacy-campaign')
    expect(card('old')).not.toContain('data-share-actions')
    expect(card('gone')).not.toContain('data-share-actions')
    expect(card('gone')).not.toContain('เพิกถอน</button>')
  })

  it('the shared link opens the intake page with the code pre-filled and checked (sign-in first when needed)', () => {
    const router = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8')
    expect(router).toContain("path: '/register'")
    expect(router).toContain("name: 'registration-intake', query: typeof to.query.c === 'string' ? { c: to.query.c } : {}")
    const page = readFileSync(new URL('../src/pages/RegistrationIntakePage.vue', import.meta.url), 'utf8')
    expect(page).toContain('work.validateCampaign(campaignToken.value)')
    expect(page).not.toContain('type="password"')
  })
})
