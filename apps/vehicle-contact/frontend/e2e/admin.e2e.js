// Admin flows an owner checks by hand, automated (desktop + phone): sign-in, admin lists with server
// filters, drawers, create dialogs, and the table rules on every list page.
import { test, expect, signIn, expectTableRules, expectNoSeriousA11y } from './fixtures.js'

test('sign-in lands on the dashboard with the admin menu', async ({ page, api }) => {
  await signIn(page)
  await expect(page).toHaveURL(/#\/app\/dashboard/)
  await expect(page.getByRole('heading', { name: 'งานทั้งหมดของคุณ' })).toBeVisible()
  expect(api.calls.map((c) => c.op)).toContain('auth.session')
  await expectNoSeriousA11y(page)
})

test('users: default filter ACTIVE (sent to the server), "ทั้งหมด" shows suspended, drawer opens and Esc closes, create dialog', async ({ page, api }) => {
  await signIn(page, '/#/app/admin/users')
  await expect(page.getByRole('table', { name: 'รายชื่อบัญชีผู้ใช้' })).toBeVisible()
  expect(api.calls.find((c) => c.op === 'users.list').payload.status).toBe('ACTIVE')
  await expectTableRules(page)
  await page.getByRole('combobox', { name: 'สถานะ' }).selectOption({ label: 'ทั้งหมด' })
  await expect(page.getByRole('table', { name: 'รายชื่อบัญชีผู้ใช้' }).getByText('ระงับการใช้งาน').first()).toBeVisible()
  await page.locator('[data-manage-user="u3"]').click()
  await expect(page).toHaveURL(/user=u3/)
  const drawer = page.getByRole('dialog', { name: /จัดการบัญชี/ })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('heading', { name: 'บทบาท' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await page.getByRole('button', { name: 'สร้างบัญชี' }).click()
  await expect(page.getByRole('dialog', { name: 'สร้างบัญชีผู้ใช้' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'สร้างบัญชีผู้ใช้' }).getByRole('combobox')).toContainText('สภ.ปากช่อง')
})

test('organizations and campaigns: tables follow the rules; campaign drawer shares the link', async ({ page }) => {
  await signIn(page, '/#/app/admin/organizations')
  await expect(page.getByRole('table', { name: 'รายการหน่วยงาน' })).toBeVisible()
  await expectTableRules(page)
  await page.goto('/#/app/admin/campaigns')
  await expect(page.getByRole('table', { name: 'รายการแคมเปญ' })).toBeVisible()
  await expectTableRules(page)
  await page.locator('[data-manage-campaign="c1"]').click()
  await expect(page.getByRole('dialog', { name: /แคมเปญ/ }).getByRole('button', { name: 'คัดลอกลิงก์ลงทะเบียน' })).toBeVisible()
})

test('audit: 64-character ids wrap inside their column; the page never scrolls sideways', async ({ page }) => {
  await signIn(page, '/#/app/admin/audit')
  await page.getByRole('button', { name: 'ค้นหา' }).click()
  await expect(page.getByRole('table', { name: 'เหตุการณ์ audit' })).toBeVisible()
  const report = await expectTableRules(page)
  expect(report.cells).toBeGreaterThan(20)
})
