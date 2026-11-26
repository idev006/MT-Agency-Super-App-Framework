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

test('system reset (VC-ADR-039): check first → phrase + password → reset; wrong password refused', async ({ page, api }) => {
  await signIn(page, '/#/app/admin/settings')
  const panel = page.locator('[data-system-reset]')
  await expect(panel.getByRole('heading', { name: /รีเซ็ตข้อมูลระบบ/ })).toBeVisible()
  await expect(panel.getByRole('checkbox', { name: 'เก็บบัญชีผู้ใช้และหน่วยงานทั้งหมด' })).toBeChecked()
  await panel.getByRole('button', { name: '1. ตรวจสอบก่อนลบ' }).click()
  await expect(panel.locator('[data-reset-total]')).toContainText('จะลบ 21 รายการ · ภาพใน Drive 15 ไฟล์ไปถังขยะ')
  await expect(panel.getByRole('table', { name: 'ข้อมูลที่จะลบ' })).toContainText('แคมเปญลงทะเบียน')
  await expect(panel.getByRole('table', { name: 'ข้อมูลที่เก็บไว้' })).toContainText('ข้อมูลอ้างอิง')
  await expectTableRules(page)
  const run = panel.getByRole('button', { name: '2. ลบข้อมูลถาวร' })
  await expect(run).toBeDisabled()
  await panel.getByLabel('พิมพ์ RESET P6VC เพื่อยืนยัน').fill('RESET P6VC')
  await panel.getByLabel('รหัสผ่านของคุณ').fill('wrong-password-1')
  await run.click()
  await expect(panel.getByRole('alert')).toContainText('รหัสผ่านไม่ถูกต้อง')
  await panel.getByLabel('รหัสผ่านของคุณ').fill('e2e-password-123')
  await run.click()
  await expect(panel.locator('[data-reset-result]')).toContainText('รีเซ็ตแล้ว: ลบ 18 รายการ')
  await expect(panel.locator('[data-reset-result]')).toContainText('ย้ายภาพใน Drive ไปถังขยะ 15 ไฟล์')
  const sent = api.calls.filter((c) => c.op === 'system.reset.execute').at(-1).payload
  expect(sent).toEqual({ confirmation: 'RESET P6VC', password: 'e2e-password-123', planDigest: 'd'.repeat(64), keepUsers: true, keepCampaigns: false })
})

test('log policy (VC-ADR-040): required logs locked; switching a log off asks first; days checked; the whole list is sent', async ({ page, api }) => {
  await signIn(page, '/#/app/admin/settings')
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'การบันทึกประวัติ' }) })
  await expect(card.getByRole('table', { name: 'การบันทึกประวัติ' })).toBeVisible()
  await expectTableRules(page)
  for (const code of ['CONTACT', 'CHANGE', 'LOGIN']) await expect(card.locator(`[data-log-locked="${code}"]`)).toHaveText('บันทึกเสมอ')
  await expect(card.locator('[data-log-toggle="PHOTO"]')).not.toBeChecked()
  await expect(card.getByRole('table', { name: 'การบันทึกประวัติ' })).toContainText('1,240')
  const save = card.locator('[data-log-save]')
  await expect(save).toBeDisabled()
  await card.locator('[data-log-days="LOOKUP"]').fill('5')
  await expect(save).toBeDisabled() // below the 30-day minimum
  await card.locator('[data-log-days="LOOKUP"]').fill('180')
  await card.locator('[data-log-toggle="LOOKUP"]').uncheck()
  await card.locator('[data-log-forever="CHANGE"]').check()
  await save.click()
  const dialog = page.getByRole('dialog', { name: 'ยืนยันการหยุดบันทึก' })
  await expect(dialog).toContainText('ค้นหารถด้วยป้ายทะเบียน / สแกน QR')
  await dialog.locator('[data-log-confirm]').click()
  await expect(card.getByRole('status')).toContainText('บันทึกการตั้งค่าการบันทึกประวัติแล้ว')
  const sent = api.calls.filter((c) => c.op === 'system.config.update').at(-1).payload.values.log_policy
  expect(sent).toEqual([{ code: 'LOOKUP', enabled: false, days: 180 }, { code: 'CONTACT', enabled: true, days: 365 }, { code: 'PHOTO', enabled: false, days: 90 },
    { code: 'CHANGE', enabled: true, days: 0 }, { code: 'LOGIN', enabled: true, days: 90 }])
  await expect(card.locator('[data-log-toggle="LOOKUP"]')).not.toBeChecked()
})
