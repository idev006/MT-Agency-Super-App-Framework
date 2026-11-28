// Live UI test of the system settings page on the real DEV backend (owner 2026-11-26: "you pls automate test").
// Needs the dev server (npm run dev, port 5173) and the gitignored .env (synthetic admin + Firestore read key).
//   P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV node scripts/live-settings-ui.mjs [outDir]
// Checks (desktop 1280 + phone 375):
//   log card     five kinds, three locked, photo log off, counts are numbers
//   save         LOOKUP days 365→364 → Firestore read-back (vc_settings + LOG_POLICY_UPDATED with expiry) → back to 365
//   reset panel  preview only ("1. ตรวจสอบก่อนลบ"); never executes; kept table lists reference data, settings, users
//   phone        card renders, the page never scrolls sideways
// The session token stays in memory (never written to disk) and is always signed out (UI, else API) at the end.
// Report: test-results/p6vc-live-settings-ui.json. Screenshots: outDir (default test-results/live-settings-ui).
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const gasDir = path.resolve(here, '../../backend/gas')
process.chdir(gasDir); await import(new URL('file:///' + path.join(gasDir, 'scripts/load-env.mjs').replace(/\\/g, '/')).href); process.chdir(path.resolve(here, '..'))
if (process.env.P6VC_ALLOW_OWNER_DEV_WRITES !== 'RUN_SYNTHETIC_OWNER_DEV') throw new Error('owner-dev synthetic write guard is required')
const { coreFrontendEndpoint } = await import(new URL('file:///' + path.join(gasDir, 'scripts/core-frontend-endpoint.mjs').replace(/\\/g, '/')).href)
const endpoint = coreFrontendEndpoint(), APP = process.env.P6VC_UI_BASE || 'http://localhost:5173'
const out = path.resolve(process.argv[2] || 'test-results/live-settings-ui'); fs.mkdirSync(out, { recursive: true })

const api = async (operation, payload, token) => {
  const [group, ...rest] = operation.split('.')
  const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', origin: APP },
    body: JSON.stringify({ apiVersion: 'v1', group, action: rest.join('.'), payload, requestId: randomUUID(), ...(token ? { sessionToken: token } : {}) }) })
  return r.json()
}
const readback = () => JSON.parse(execFileSync('node', ['scripts/log-policy-readback.mjs'], { cwd: gasDir, encoding: 'utf8' })
  .split('\n').find((l) => l.startsWith('READBACK ')).slice(9))
const report = { startedAt: new Date().toISOString(), app: APP, checks: [] }
const check = (name, ok, detail = '') => { report.checks.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 300) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' ' + detail : '')) }

const login = await api('auth.login', { username: process.env.P6VC_ADMIN_USER, password: process.env.P6VC_ADMIN_PASS })
if (!login.ok) throw new Error('login failed: ' + login.error?.code)
const token = login.data.sessionToken
const browser = await chromium.launch()
async function open(viewport) {
  const page = await (await browser.newContext({ viewport })).newPage()
  await page.goto(APP + '/#/signin'); await page.evaluate((t) => sessionStorage.setItem('p6vc-session-token', t), token)
  await page.reload(); await page.waitForTimeout(2500)
  const heading = page.getByRole('heading', { name: 'การบันทึกประวัติ' })
  // the app may land on the dashboard while it restores the session: ask for the settings page until it shows
  for (let i = 0; i < 6 && !(await heading.count()); i++) { await page.evaluate(() => { location.hash = '#/app/admin/settings' }); await page.waitForTimeout(4000) }
  await heading.waitFor({ timeout: 30000 })
  return page
}
const card = (p) => p.locator('section', { has: p.getByRole('heading', { name: 'การบันทึกประวัติ' }) })
let desk
try {
  desk = await open({ width: 1280, height: 900 })
  const c = card(desk)
  check('LOG.ROWS five kinds', (await c.locator('tbody tr').count()) === 5)
  check('LOG.LOCKED contact/change/login', (await c.locator('[data-log-locked]').count()) === 3)
  check('LOG.PHOTO off by default', !(await c.locator('[data-log-toggle="PHOTO"]').isChecked()))
  const counts = await c.locator('tbody tr td:last-child').allInnerTexts()
  check('LOG.COUNTS numbers', counts.length === 5 && counts.every((t) => /^[\d,]+$/.test(t.trim())), counts.join('|'))
  await c.screenshot({ path: path.join(out, 'log-desktop.png') })
  const before = readback(), days0 = before.policy?.find((k) => k.code === 'LOOKUP')?.days ?? 365, days1 = days0 === 364 ? 365 : 364
  await c.locator('[data-log-days="LOOKUP"]').fill(String(days1)); await c.locator('[data-log-save]').click()
  await c.getByRole('status').filter({ hasText: 'บันทึกการตั้งค่าการบันทึกประวัติแล้ว' }).waitFor({ timeout: 30000 })
  const r1 = readback()
  check(`DB.SAVED LOOKUP ${days1}`, r1.policy?.find((k) => k.code === 'LOOKUP')?.days === days1, JSON.stringify(r1.policy))
  check('DB.AUDIT LOG_POLICY_UPDATED with expiry', r1.audits === before.audits + 1 && new RegExp(`LOOKUP ${days0}->${days1}d`).test(r1.lastAudit?.summary || '') && Boolean(r1.lastAudit?.expire), r1.lastAudit?.summary)
  await c.locator('[data-log-days="LOOKUP"]').fill(String(days0)); await c.locator('[data-log-save]').click()
  await desk.waitForTimeout(1000); await c.locator('[data-log-save]').waitFor({ state: 'attached' }); await desk.waitForTimeout(2000)
  const r2 = readback()
  check(`DB.RESTORED LOOKUP ${days0}`, r2.policy?.find((k) => k.code === 'LOOKUP')?.days === days0 && r2.audits === before.audits + 2, r2.lastAudit?.summary)
  const reset = desk.locator('[data-system-reset]')
  if (await reset.count()) {
    await reset.getByRole('button', { name: '1. ตรวจสอบก่อนลบ' }).click()
    const total = reset.locator('[data-reset-total]'), alert = reset.getByRole('alert')
    await Promise.race([total.waitFor({ timeout: 60000 }), alert.waitFor({ timeout: 60000 })])
    if (await total.count()) {
      check('RESET.PREVIEW shown', /จะลบ [\d,]+ รายการ/.test(await total.innerText()), await total.innerText())
      const kept = await reset.getByRole('table', { name: 'ข้อมูลที่เก็บไว้' }).innerText()
      check('RESET.KEPT reference + settings + users + own session', /ข้อมูลอ้างอิง/.test(kept) && /การตั้งค่า/.test(kept) && /บัญชีผู้ใช้/.test(kept) && !/ของผู้อื่น/.test(kept))
      check('RESET.NOT_EXECUTED delete button locked', await reset.getByRole('button', { name: '2. ลบข้อมูลถาวร' }).isDisabled())
      await reset.screenshot({ path: path.join(out, 'reset-preview.png') })
    } else check('RESET.PREVIEW (switched off on this host)', /ปิดอยู่/.test(await alert.innerText()), await alert.innerText())
  } else check('RESET.PANEL hidden (no system.reset permission)', true)
  const phone = await open({ width: 375, height: 812 })
  await card(phone).screenshot({ path: path.join(out, 'log-phone.png') })
  check('PHONE.NO_PAGE_SCROLL', await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
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
  fs.mkdirSync('test-results', { recursive: true }); fs.writeFileSync('test-results/p6vc-live-settings-ui.json', JSON.stringify(report, null, 2) + '\n')
  console.log('LIVE_SETTINGS_UI ' + JSON.stringify({ result: report.result, passed: report.checks.length - failed, failed, signedOut }))
  process.exitCode = failed ? 1 : 0
}
