import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const router = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8')
const sidebar = readFileSync(new URL('../src/components/layout/AppSidebar.vue', import.meta.url), 'utf8')
const footer = readFileSync(new URL('../src/components/layout/AppFooter.vue', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/stores/session.js', import.meta.url), 'utf8')

describe('release and initial-password UX contract', () => {
  it('uses semantic DaisyUI menu structure with a padded touch target', () => {
    expect(sidebar).toContain('<ul class="menu')
    expect(sidebar).toContain('<li v-for="item in menuItems"')
    expect(sidebar).toContain('class="min-h-11 gap-3 px-3 py-2"')
  })

  it('routes initial-password sessions to the only permitted account operation', () => {
    expect(router).toContain("auth.session?.mustChangePassword && to.name !== 'account-security'")
    expect(router).toContain("reason: 'password-change-required'")
    expect(store).toContain("items.filter((item) => item.id === 'account-security')")
  })

  it('renders frontend and server-reported backend versions', () => {
    expect(footer).toContain('Frontend v{{ packageInfo.version }}')
    expect(footer).toContain("backendRelease?.apiVersion")
    expect(footer).toContain("backendRelease?.backendVersion")
    expect(store).toContain('loadReleaseInfo')
  })
})
