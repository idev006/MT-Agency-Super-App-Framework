import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const router = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8')
const menu = readFileSync(new URL('../src/domain/navigation/menu-catalog.js', import.meta.url), 'utf8')

describe('complete SYSTEM_ADMIN route contract', () => {
  it.each([
    ['account-security', 'session.authenticated'],
    ['user-directory', 'users.manage'],
    ['organization-administration', 'organizations.read'],
    ['campaign-administration', 'campaigns.manage'],
    ['qr-governance', 'qr.manage'],
    ['system-settings', 'system.settings.read'],
    ['retention-approval', 'retention.read'],
    ['audit-review', 'audit.read'],
    ['vehicle-registry', 'vehicle.list'],
  ])('wires %s with permission %s', (route, permission) => {
    expect(router).toContain(`name: '${route}'`)
    expect(router).toContain(`requiredPermissions: ['${permission}']`)
    expect(menu).toContain(`route: '${route}'`)
  })
})
