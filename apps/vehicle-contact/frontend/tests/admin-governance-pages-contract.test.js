import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const pages = [
  read('../src/pages/OrganizationAdministrationPage.vue'),
  read('../src/pages/CampaignAdministrationPage.vue'),
  read('../src/pages/SystemSettingsPage.vue'),
]

describe('SYSTEM_ADMIN governance page contracts', () => {
  it('uses shared page and operational context contracts without raw transport', () => {
    for (const page of pages) {
      expect(page).toContain('<PageTemplateComponent')
      expect(page).toContain('<OperationalContextStrip')
      expect(page).not.toContain('gas-api-client')
      expect(page).not.toContain('fetch(')
    }
  })

  it('renders explicit loading, forbidden, unauthenticated and error states', () => {
    for (const page of pages) for (const phase of ['loading', 'forbidden', 'unauthenticated', 'error']) expect(page).toContain(`'${phase}'`)
  })

  it('confirms high-impact organization and campaign operations', () => {
    expect(pages[0]).toContain('<ConfirmDialog')
    expect(pages[0]).toContain('ปิดใช้งานหน่วยงานหรือไม่')
    expect(pages[1]).toContain('<ConfirmDialog')
    expect(pages[1]).toContain('เพิกถอนแคมเปญหรือไม่')
  })

  it('warns that the campaign token is one-time and never persists it', () => {
    const component = read('../src/features/campaigns/components/CampaignAdministrationPanel.vue')
    expect(component).toContain('ระบบจะแสดงค่านี้ครั้งเดียว')
    expect(component).not.toContain('localStorage')
    expect(component).not.toContain('sessionStorage')
  })
})
