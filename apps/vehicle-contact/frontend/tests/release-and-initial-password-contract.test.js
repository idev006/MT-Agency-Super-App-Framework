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

  it('versions live on the About page; the footer is one line that links to it (owner 2026-11-25)', () => {
    const about = readFileSync(new URL('../src/pages/AboutPage.vue', import.meta.url), 'utf8')
    expect(about).toContain('packageInfo.version')
    expect(about).toContain('backendRelease.value?.apiVersion')
    expect(about).toContain('backendRelease.value?.backendVersion')
    expect(footer).toContain("{ name: 'about' }")
    expect(footer).not.toMatch(/Cloudflare|GAS|Firestore|endpoint/)
    expect(store).toContain('loadReleaseInfo')
  })
})
