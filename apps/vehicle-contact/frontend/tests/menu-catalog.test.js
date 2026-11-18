import { describe, expect, it } from 'vitest'
import { menuForRoles } from '../src/domain/navigation/menu-catalog.js'

describe('role menu SSOT', () => {
  it('shows shared and staff menus without admin-only items', () => {
    const ids = menuForRoles(['STAFF']).map((item) => item.id)
    expect(ids).toEqual(['dashboard', 'connection', 'vehicle-search'])
  })

  it('shows system administration menus to system admin', () => {
    const ids = menuForRoles(['SYSTEM_ADMIN']).map((item) => item.id)
    expect(ids).toContain('user-admin')
    expect(ids).toContain('retention')
    expect(ids).not.toContain('my-vehicles')
  })
})
