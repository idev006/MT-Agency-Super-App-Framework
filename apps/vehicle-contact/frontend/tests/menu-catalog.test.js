import { describe, expect, it } from 'vitest'
import { ROLE_PERMISSIONS } from '../../backend/gas/src/application/security/SessionService.js'
import { menuForPermissions } from '../src/domain/navigation/menu-catalog.js'

describe('permission-driven menu SSOT', () => {
  it('shows shared and vehicle lookup menus without admin-only items', () => {
    const ids = menuForPermissions(['session.authenticated', 'vehicle.lookup']).map((item) => item.id)
    expect(ids).toEqual(['dashboard', 'about', 'account-security', 'vehicle-search', 'qr-resolve'])
  })

  it('SYSTEM_ADMIN (VC-ADR-036): vehicle search + QR resolve, but no registration approval or owner work', () => {
    const items = menuForPermissions(ROLE_PERMISSIONS.SYSTEM_ADMIN)
    const ids = items.map((item) => item.id)
    expect(ids).toEqual([
      'dashboard', 'about', 'account-security', 'vehicle-search', 'qr-resolve', 'vehicle-registry', 'user-admin', 'organizations',
      'campaigns', 'qr-governance', 'system-settings', 'retention', 'audit',
    ])
    expect(ids).not.toContain('registration-review')
    expect(ids).not.toContain('my-vehicles')
    expect(items.filter((item) => item.route).map((item) => item.id)).toEqual(ids)
    expect(items.filter((item) => !item.route)).toEqual([])
  })

  it('unions permission overrides without relying on a role name', () => {
    const ids = menuForPermissions(['vehicle.change.submit', 'vehicle.lookup']).map((item) => item.id)
    expect(ids).toEqual(['dashboard', 'about', 'vehicle-search', 'qr-resolve', 'my-vehicles'])
  })

  it('gives the combined system and registration administrator a routed review menu', () => {
    const permissions = [...new Set([...ROLE_PERMISSIONS.SYSTEM_ADMIN, ...ROLE_PERMISSIONS.REGISTRATION_ADMIN])]
    const items = menuForPermissions(permissions)
    expect(items.find((item) => item.id === 'registration-review')).toMatchObject({
      route: 'registration-review', permissionsAny: ['vehicle.registration.approve'],
    })
    expect(items.find((item) => item.id === 'vehicle-search')?.route).toBe('vehicle-search')
    expect(items.find((item) => item.id === 'qr-resolve')?.route).toBe('qr-resolve')
    expect(items.filter((item) => !item.route)).toEqual([])
  })

  it.each([
    ['system.settings.read', 'system-settings'],
    ['organizations.read', 'organizations'],
    ['campaigns.manage', 'campaigns'],
    ['qr.manage', 'qr-governance'],
    ['retention.delete.approve', 'retention'],
    ['audit.read', 'audit'],
    ['vehicle.change.approve', 'change-review'],
    ['vehicle.list', 'vehicle-registry'],
  ])('maps %s to only its authorized capability group', (permission, expectedId) => {
    const ids = menuForPermissions([permission]).map((item) => item.id)
    expect(ids).toEqual(['dashboard', 'about', expectedId])
  })

  it('does not manufacture permissions from a role code', () => {
    expect(menuForPermissions(['SYSTEM_ADMIN']).map((item) => item.id)).toEqual(['dashboard', 'about'])
  })
})
