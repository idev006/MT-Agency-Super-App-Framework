import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/pages/UserDirectoryPage.vue', import.meta.url), 'utf8')
const list = readFileSync(new URL('../src/features/user-directory/components/UserDirectoryList.vue', import.meta.url), 'utf8')
const router = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8')

describe('SYSTEM_ADMIN user directory page contract', () => {
  it('uses shared page/context contracts and users.manage route metadata', () => {
    expect(page).toContain('<PageTemplateComponent')
    expect(page).toContain('<OperationalContextStrip')
    expect(router).toMatch(/name: 'user-directory'.*requiredPermissions: \['users\.manage'\]/)
  })

  it('D2: one DataTable (desktop and phone), server filters, drawer + create dialog, no raw API access', () => {
    expect(list).toContain('<DataTable')
    expect(list).toContain("emit('manage', row)")
    expect(page).toContain('<ListFilterBar')
    expect(page).toContain('directory.applyFilters')
    expect(page).toContain('<EntityDrawer')
    expect(page).toContain('<UserCreateDialog')
    expect(page).toContain('route.query.user')
    expect(page).not.toContain('gas-api-client')
    expect(page).not.toContain('fetch(')
  })

  it('renders required asynchronous states and full administration controls', () => {
    for (const phase of ['loading', 'empty', 'forbidden', 'recoverable-error', 'error', 'success']) expect(page).toContain(`'${phase}'`)
    expect(page).toContain('จัดการบัญชี')
    expect(page).toContain('<UserAdministrationPanel')
    expect(page).toContain('administration.suspendUser')
    expect(page).toContain('administration.resetPassword')
    expect(page).toContain('administration.assignRoles')
  })
})
