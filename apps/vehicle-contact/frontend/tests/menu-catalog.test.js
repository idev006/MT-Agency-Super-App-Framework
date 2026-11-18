import { describe, expect, it } from 'vitest'
import { menuForPermissions } from '../src/domain/navigation/menu-catalog.js'

describe('permission-driven menu SSOT', () => {
  it('shows shared and vehicle lookup menus without admin-only items', () => {
    const ids = menuForPermissions(['session.authenticated', 'vehicle.lookup']).map((item) => item.id)
    expect(ids).toEqual(['dashboard', 'connection', 'vehicle-search'])
  })

  it('shows administration menus from permissions without implicit vehicle access', () => {
    const ids = menuForPermissions(['session.authenticated', 'users.manage', 'retention.read']).map((item) => item.id)
    expect(ids).toContain('user-admin')
    expect(ids).toContain('retention')
    expect(ids).not.toContain('vehicle-search')
    expect(ids).not.toContain('registration-review')
    expect(ids).not.toContain('my-vehicles')
  })

  it('unions permission overrides without relying on a role name', () => {
    const ids = menuForPermissions(['vehicle.change.submit', 'vehicle.lookup']).map((item) => item.id)
    expect(ids).toEqual(['dashboard', 'connection', 'vehicle-search', 'my-vehicles'])
  })
})
