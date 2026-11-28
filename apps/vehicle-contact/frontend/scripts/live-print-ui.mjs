// Live UI test of the QR print page filters on the real DEV backend (VC-ADR-042; owner: test with real data).
// Needs the dev server (npm run dev, port 5173) and the gitignored .env (synthetic admin + Firestore read key).
//   P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV node scripts/live-print-ui.mjs [outDir]
// Checks (desktop 1280 + phone 375):
//   default      "ยังไม่พิมพ์", the total on the page = the API total for the same filter
//   filters      unit, person type and plate each give the same total as the API; filters are kept in the URL
//   print        one synthetic vehicle (plate ฑฆ… / TST…) → sheet → print → "พิมพ์แล้ว บันทึก" → Firestore read-back:
//                qr_print_state PRINTED + one more QR_PRINTED audit row; then it shows under "พิมพ์แล้ว"
//   phone        filter bar renders; the page never scrolls sideways
// Writes: marks ONE synthetic vehicle as printed (that is the feature). Token in memory only; always signed out.
// Report: test-results/p6vc-live-print-ui.json. Screenshots: outDir (default test-results/live-print-ui).
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const gasDir = path.resolve(here, '../../backend/gas')
process.chdir(gasDir); await import(pathToFileURL(path.join(gasDir, 'scripts/load-env.mjs')).href); process.chdir(path.resolve(here, '..'))
if (process.env.P6VC_ALLOW_OWNER_DEV_WRITES !== 'RUN_SYNTHETIC_OWNER_DEV') throw new Error('owner-dev synthetic write guard is required')
const { coreFrontendEndpoint } = await import(new URL('file:///' + path.join(gasDir, 'scripts/core-frontend-endpoint.mjs').replace(/\\/g, '/')).href)
const endpoint = coreFrontendEndpoint(), APP = process.env.P6VC_UI_BASE || 'http://localhost:5173'
const out = path.resolve(process.argv[2] || 'test-results/live-print-ui'); fs.mkdirSync(out, { recursive: true })

const api = async (operation, payload, token) => {
  const [group, ...rest] = operation.split('.')
  const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', origin: APP },
    body: JSON.stringify({ apiVersion: 'v1', group, action: rest.join('.'), payload, requestId: randomUUID(), ...(token ? { sessionToken: token } : {}) }) })
  return r.json()
}
const readback = (id) => JSON.parse(execFileSync('node', ['scripts/vehicle-print-readback.mjs', id], { cwd: gasDir, encoding: 'utf8' })
  .split('\n').find((l) => l.startsWith('READBACK ')).slice(9))
const report = { startedAt: new Date().toISOString(), app: APP, checks: [] }
const check = (name, ok, detail = '') => { report.checks.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 300) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' ' + detail : '')) }

const login = await api('auth.login', { username: process.env.P6VC_ADMIN_USER, password: process.env.P6VC_ADMIN_PASS })
if (!login.ok) throw new Error('login failed: ' + login.error?.code)
const token = login.data.sessionToken
const apiTotal = async (filters) => { const r = await api('vehicles.list', { page: 1, pageSize: 50, ...filters }, token); if (!r.ok) throw new Error('api ' + r.error?.code); return r.data }
const browser = await chromium.launch()
const table = (p) => p.getByRole('table', { name: 'เลือกรถสำหรับพิมพ์ QR' })
async function open(viewport) {
  const page = await (await browser.newContext({ viewport })).newPage()
  await page.goto(APP + '/#/signin'); await page.evaluate((t) => sessionStorage.setItem('p6vc-session-token', t), token)
  await page.reload(); await page.waitForTimeout(2500)
  const bar = page.locator('[data-print-filters]')
  for (let i = 0; i < 6 && !(await bar.count()); i++) { await page.evaluate(() => { location.hash = '#/app/admin/qr-print' }); await page.waitForTimeout(4000) }
  await bar.waitFor({ timeout: 30000 })
  return page
}
// the page shows "แสดง a–b จาก N รายการ" (or the empty message)
async function uiTotal(page) {
  await page.waitForTimeout(1500)
  await page.waitForFunction(() => !document.querySelector('[role="status"] .sr-only') || !/กำลังโหลด/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {})
  if (await page.locator('[data-print-empty]').count()) return 0
  const m = (await page.locator('body').innerText()).match(/จาก ([\d,]+) รายการ/)
  return m ? Number(m[1].replace(/,/g, '')) : -1
}
let desk
try {
  desk = await open({ width: 1280, height: 900 })
  const notPrinted = await apiTotal({ printState: 'NOT_PRINTED', withFilterOptions: true })
  check('DEFAULT not printed = API total', (await uiTotal(desk)) === notPrinted.total, `ui=${await uiTotal(desk)} api=${notPrinted.total}`)
  check('DEFAULT URL keeps the filter', /print=NOT_PRINTED/.test(desk.url()) || (await desk.locator('[data-filter="print"]').inputValue()) === 'NOT_PRINTED')
  await table(desk).screenshot({ path: path.join(out, 'print-desktop.png') }).catch(() => {})
  // unit
  const org = notPrinted.filterOptions?.organizations?.find(() => true)
  if (org) {
    await desk.locator('[data-filter="org"]').selectOption(org.id)
    const a = await apiTotal({ printState: 'NOT_PRINTED', organizationId: org.id })
    check('FILTER unit = API total', (await uiTotal(desk)) === a.total, `${org.name}: api=${a.total}`)
    check('FILTER unit in URL', desk.url().includes('org=' + encodeURIComponent(org.id)) || desk.url().includes('org=' + org.id))
    await desk.locator('[data-filter="org"]').selectOption('')
  } else check('FILTER unit (no organizations)', false)
  // person type
  const type = notPrinted.items.find((x) => x.stickerCategory)?.stickerCategory || 'NCO'
  await desk.locator('[data-filter="type"]').selectOption(type)
  const t = await apiTotal({ printState: 'NOT_PRINTED', stickerCategory: type })
  check('FILTER person type = API total', (await uiTotal(desk)) === t.total, `${type}: api=${t.total}`)
  await desk.locator('[data-filter="type"]').selectOption('')
  // one synthetic, not-printed vehicle with a printable QR
  const ids = notPrinted.items.filter((x) => /^(ฑฆ|TST)/.test(x.plate) && x.sticker).map((x) => x.vehicleId)
  const exp = ids.length ? await api('qr.export', { vehicleIds: ids.slice(0, 20) }, token) : { ok: false }
  const target = exp.ok ? notPrinted.items.find((x) => x.vehicleId === exp.data.items.find((i) => i.status === 'READY')?.vehicleId) : null
  if (!target) check('PRINT a synthetic not-printed vehicle with a READY QR exists', false)
  else {
    await desk.locator('[data-filter="plate"]').fill(target.plate); await desk.getByRole('button', { name: 'ค้นหา', exact: true }).click()
    check('FILTER plate = 1 vehicle', (await uiTotal(desk)) === 1, target.plate)
    const before = readback(target.vehicleId)
    await desk.getByRole('button', { name: 'เลือกทั้งหน้า' }).click()
    await desk.getByRole('button', { name: 'สร้างแผ่น QR', exact: true }).click()
    await desk.getByRole('heading', { name: /แผ่น QR พร้อมพิมพ์ 1 ดวง/ }).waitFor({ timeout: 60000 })
    await desk.evaluate(() => { window.print = () => {} })
    await desk.getByRole('button', { name: 'พิมพ์ / บันทึกเป็น PDF' }).click()
    const dialog = desk.getByRole('dialog', { name: 'พิมพ์เรียบร้อยแล้วหรือยัง' })
    await dialog.locator('[data-confirm-printed]').click()
    await desk.locator('[data-mark-result]').waitFor({ timeout: 30000 })
    check('PRINT confirmed on the page', /บันทึกว่าพิมพ์แล้ว 1 คัน/.test(await desk.locator('[data-mark-result]').innerText()))
    const after = readback(target.vehicleId)
    check('DB PRINTED + audit', before.state === 'NOT_PRINTED' && after.state === 'PRINTED' && Boolean(after.printedAt) && after.printedAudits === before.printedAudits + 1, JSON.stringify({ before, after }))
    check('FILTER not printed no longer lists it', (await uiTotal(desk)) === 0, target.plate)
    await desk.locator('[data-filter="print"]').selectOption('PRINTED')
    check('FILTER printed lists it', (await uiTotal(desk)) === 1 && /พิมพ์แล้ว/.test(await table(desk).innerText()), target.plate)
  }
  const phone = await open({ width: 375, height: 812 })
  await phone.locator('[data-print-filters]').screenshot({ path: path.join(out, 'print-phone-filters.png') })
  check('PHONE no sideways page scroll', await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
} catch (e) { check('RUN', false, e.message) }
finally {
  let signedOut = false
  if (desk) {
    await desk.evaluate(() => { location.hash = '#/app/dashboard' }); await desk.waitForTimeout(1500)
    await desk.getByRole('button', { name: 'ออกจากระบบ' }).first().click().catch(() => {})
    await desk.getByRole('dialog').getByRole('button', { name: 'ออกจากระบบ' }).click().catch(() => {})
    signedOut = await desk.waitForURL(/signin/, { timeout: 15000 }).then(() => true).catch(() => false)
  }
  if (!signedOut) signedOut = (await api('auth.logout', {}, token).catch(() => ({}))).ok === true
  await browser.close()
  report.signedOut = signedOut; report.finishedAt = new Date().toISOString()
  const failed = report.checks.filter((x) => !x.ok).length
  report.result = failed ? 'FAIL' : 'PASS'
  fs.mkdirSync('test-results', { recursive: true }); fs.writeFileSync('test-results/p6vc-live-print-ui.json', JSON.stringify(report, null, 2) + '\n')
  console.log('LIVE_PRINT_UI ' + JSON.stringify({ result: report.result, passed: report.checks.length - failed, failed, signedOut }))
  process.exitCode = failed ? 1 : 0
}
