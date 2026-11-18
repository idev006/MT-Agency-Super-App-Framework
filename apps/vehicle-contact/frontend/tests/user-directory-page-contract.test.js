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

  it('uses native responsive table/list presentation without raw API access', () => {
    expect(list).toContain('class="table"')
    expect(list).toContain('class="list')
    expect(page).not.toContain('gas-api-client')
    expect(page).not.toContain('fetch(')
  })

  it('renders required asynchronous states and accurately labels the slice read-only', () => {
    for (const phase of ['loading', 'empty', 'forbidden', 'recoverable-error', 'error', 'success']) expect(page).toContain(`'${phase}'`)
    expect(page).toContain('อ่านอย่างเดียว')
    expect(page).toContain('ยังไม่แก้ไข')
  })
})
