import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/pages/AccountSecurityPage.vue', import.meta.url), 'utf8')

describe('account security page contract', () => {
  it('uses shared page context and protected account operations', () => {
    expect(page).toContain('<PageTemplateComponent')
    expect(page).toContain('<OperationalContextStrip')
    expect(page).toContain('security.changePassword')
    expect(page).toContain('security.linkGoogle')
  })

  it('does not persist credentials and redirects after password change', () => {
    expect(page).not.toContain('localStorage')
    expect(page).not.toContain('sessionStorage')
    expect(page).toContain("reason: 'password-changed'")
    expect(page).toContain('autocomplete="new-password"')
  })
})
