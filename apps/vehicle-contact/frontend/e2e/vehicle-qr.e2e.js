// Vehicle detail (redesigned overview + tabs), QR card, the QR print page and the sticker link flow.
import { test, expect, signIn, expectTableRules } from './fixtures.js'

test('registry → vehicle drawer: overview first, primary contact call link, every tab table follows the rules', async ({ page }) => {
  await signIn(page, '/#/app/vehicles/registry')
  await expect(page.getByRole('table', { name: 'ทะเบียนยานพาหนะที่อนุมัติ' })).toBeVisible()
  await expectTableRules(page)
  await page.getByRole('button', { name: 'ดูรายละเอียด' }).first().click()
  const drawer = page.getByRole('dialog', { name: /กข1234/ })
  await expect(drawer.getByRole('tab', { name: 'ภาพรวม' })).toHaveAttribute('aria-selected', 'true')
  await expect(drawer.getByRole('heading', { name: 'ผู้ติดต่อหลัก' })).toBeVisible()
  await expect(drawer.getByRole('link', { name: /โทรหา/ })).toHaveAttribute('href', 'tel:+66800000001')
  for (const tab of ['ประวัติ', 'QR และประวัติ QR', 'ที่มาและคำขอ', 'การเข้าดู']) {
    await drawer.getByRole('tab', { name: tab, exact: true }).click()
    await expectTableRules(page)
  }
  // QR tab: the current QR is shown with a print link (qr.export, audited server-side)
  await drawer.getByRole('tab', { name: 'QR และประวัติ QR' }).click()
  await expect(drawer.locator('[data-current-qr] img')).toBeVisible()
  await expect(drawer.getByRole('link', { name: 'พิมพ์ QR คันนี้' })).toBeVisible()
})

test('QR print: pick vehicles → sheet with READY stickers, others listed with the reason', async ({ page, api }) => {
  await signIn(page, '/#/app/admin/qr-print')
  await expect(page.getByRole('table', { name: 'เลือกรถสำหรับพิมพ์ QR' })).toBeVisible()
  await page.getByRole('button', { name: 'เลือกทั้งหน้า' }).click()
  await expect(page.getByText('เลือกแล้ว 3 / 100 คัน')).toBeVisible()
  await page.getByRole('button', { name: 'สร้างแผ่น QR' }).click()
  await expect(page.getByRole('heading', { name: 'แผ่น QR พร้อมพิมพ์ 1 ดวง' })).toBeVisible()
  const sticker = page.locator('[data-sticker="v1"]')
  await expect(sticker).toContainText('กข1234')
  await expect(sticker).toContainText('ตำรวจภูธรภาค 6')
  await expect(sticker.locator('img')).toBeVisible()
  await expect(page.getByText('2 คันพิมพ์ไม่ได้')).toBeVisible()
  await expect(page.getByText(/ต้องออก QR ใหม่ก่อนพิมพ์/)).toBeVisible()
  expect(api.calls.find((c) => c.op === 'qr.export').payload.vehicleIds.sort()).toEqual(['v1', 'v2', 'v3'])
  await page.getByRole('combobox', { name: 'รูปแบบ' }).selectOption('single')
  await expect(page.locator('[data-qr-sheet]')).toHaveClass(/qr-sheet--single/)
})
