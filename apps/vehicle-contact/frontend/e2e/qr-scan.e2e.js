// Owner 2026-11-26: the scan workflow must not confuse — sticker page for the public, one step at a time,
// the photo shows, the call button sits under the plate, and a revoked sticker says so.
import { test, expect } from './fixtures.js'

async function signInFrom(page) {
  await page.getByLabel('ชื่อผู้ใช้', { exact: true }).fill('e2e_admin')
  await page.locator('input[autocomplete="current-password"]').fill('e2e-synthetic-password')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click()
}

test('sticker link, signed out: a plain public page (what it is, nothing shown, no API call) → officer signs in → the vehicle', async ({ page, api }) => {
  const code = api.data.qrCode.v1
  await page.goto(`/#/q/${code}`)
  await expect(page.getByRole('heading', { name: /QR ยานพาหนะ/ })).toBeVisible()
  await expect(page.getByText('ไม่เปิดเผยต่อบุคคลทั่วไป')).toBeVisible()
  expect(api.calls, 'the sticker page makes no API call').toEqual([])
  await page.getByRole('button', { name: 'เจ้าหน้าที่: เข้าสู่ระบบเพื่อตรวจสอบ' }).click()
  await signInFrom(page)
  await expect(page.getByRole('heading', { name: 'ผลการตรวจสอบ QR' })).toBeVisible()
  await expect(page).toHaveURL(/#\/app\/vehicles\/qr$/) // the code has left the URL
  expect(api.calls.find((c) => c.op === 'qr.resolve').payload.token).toBe(code)
})

test('result: plate → make/model → call button under it, then the photo (front loads at once); camera step is gone', async ({ page, api }) => {
  await page.goto(`/#/q/${api.data.qrCode.v1}`)
  await page.getByRole('button', { name: 'เจ้าหน้าที่: เข้าสู่ระบบเพื่อตรวจสอบ' }).click()
  await signInFrom(page)
  const plate = page.getByRole('heading', { name: 'กข1234' })
  const call = page.getByRole('link', { name: /^โทรหา นายทดสอบ/ })
  const photo = page.locator('[data-vehicle-photo] img')
  await expect(plate).toBeVisible(); await expect(call).toBeVisible(); await expect(photo).toBeVisible()
  const [p, c, f] = [await plate.boundingBox(), await call.boundingBox(), await photo.boundingBox()]
  expect(p.y).toBeLessThan(c.y) // the call button is right under the plate
  if (f.x >= c.x + c.width) expect(f.y).toBeLessThan(c.y + c.height + 400) // desktop: photo in the column beside it
  else expect(c.y).toBeLessThan(f.y) // phone: one column — call first, then the photo
  expect(api.calls.filter((c) => c.op === 'vehicles.photo').length, 'only the front photo loads by itself').toBe(1)
  await page.getByRole('button', { name: 'ด้านหลัง' }).click()
  await expect.poll(() => api.calls.filter((c) => c.op === 'vehicles.photo').length).toBe(2)
  await expect(page.getByRole('heading', { name: 'สแกน QR บนรถ' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'สแกนคันถัดไป' })).toBeVisible()
})

test('a revoked sticker says so (and shows no vehicle); "สแกนคันถัดไป" returns to the camera step', async ({ page, api }) => {
  await page.goto(`/#/q/${api.data.revokedCode}`)
  await page.getByRole('button', { name: 'เจ้าหน้าที่: เข้าสู่ระบบเพื่อตรวจสอบ' }).click()
  await signInFrom(page)
  await expect(page.locator('[data-qr-outcome]')).toContainText('QR นี้ถูกเพิกถอนแล้ว')
  await expect(page.getByRole('heading', { name: 'กข1234' })).toHaveCount(0)
  await page.getByRole('button', { name: 'สแกนคันถัดไป' }).click()
  await expect(page.getByRole('heading', { name: 'สแกน QR บนรถ' })).toBeVisible()
})
