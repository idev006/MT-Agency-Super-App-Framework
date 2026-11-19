import { describe, expect, it } from 'vitest'
import { ROLE_PERMISSIONS } from '../../backend/gas/src/application/security/SessionService.js'
import { menuForPermissions } from '../src/domain/navigation/menu-catalog.js'

describe('permission-driven menu SSOT', () => {
  it('shows shared and vehicle lookup menus without admin-only items', () => {
    const ids = menuForPermissions(['session.authenticated', 'vehicle.lookup']).map((item) => item.id)
    expect(ids).toEqual(['dashboard', 'connection', 'account-security', 'vehicle-search'])
  })

  it('covers the GAS SYSTEM_ADMIN baseline without implicit operational access', () => {
    const items = menuForPermissions(ROLE_PERMISSIONS.SYSTEM_ADMIN)
    const ids = items.map((item) => item.id)
    expect(ids).toEqual([
      'dashboard', 'connection', 'account-security', 'user-admin', 'organizations',
      'campaigns', 'qr-governance', 'system-settings', 'retention', 'audit',
    ])
    expect(ids).not.toContain('vehicle-search')
    expect(ids).not.toContain('registration-review')
    expect(ids).not.toContain('my-vehicles')
    expect(items.filter((item) => item.route).map((item) => item.id)).toEqual(['dashboard', 'connection', 'user-admin'])
  })

  it('unions permission overrides without relying on a role name', () => {
    const ids = menuForPermissions(['vehicle.change.submit', 'vehicle.lookup']).map((item) => item.id)
    expect(ids).toEqual(['dashboard', 'connection', 'vehicle-search', 'my-vehicles'])
  })

  it.each([
    ['system.settings.read', 'system-settings'],
    ['organizations.read', 'organizations'],
    ['campaigns.manage', 'campaigns'],
    ['qr.manage', 'qr-governance'],
    ['retention.delete.approve', 'retention'],
    ['audit.read', 'audit'],
  ])('maps %s to only its authorized capability group', (permission, expectedId) => {
    const ids = menuForPermissions([permission]).map((item) => item.id)
    expect(ids).toEqual(['dashboard', 'connection', expectedId])
  })

  it('does not manufacture permissions from a role code', () => {
    expect(menuForPermissions(['SYSTEM_ADMIN']).map((item) => item.id)).toEqual(['dashboard', 'connection'])
  })
})
