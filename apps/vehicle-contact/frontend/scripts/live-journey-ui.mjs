// Live UI journey: the REAL web app (built from this checkout, served on localhost) against the LIVE p6vc-core, with
// synthetic DEV data only (owner 2026-11-28: "ก็ต้องย้ายให้ FE ไปเชื่อมกับ p6vc-core และ ทำ automate full test ด้วย world class grade").
//   P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV node scripts/live-journey-ui.mjs
// It starts its own Vite dev server (VITE_CORE_API_URL = the core, from the trusted-endpoints contract) unless P6VC_UI_BASE is set.
//
// 1. setup (API, as the synthetic admin from the gitignored .env): a campaign, ONE synthetic registration (plate ฑฆ…, five
//    fixture photos), and one synthetic account per role (REGISTRATION_ADMIN, STAFF, OWNER) with generated passwords that
//    stay in memory (temporary → changed → signed in again). Nothing is typed into a hosted web app.
// 2. journey (UI): the registration admin approves the request in the review page (plate photo checkbox → approve →
//    confirm); read-back: the vehicle is ACTIVE with one ACTIVE QR. The admin makes the owner its owner (API); the owner sees
//    it in "ยานพาหนะของฉัน"; staff opens its detail page; the public QR landing page resolves the sticker code.
// 3. route sweep: every page each role may open, desktop 1280 and phone 375 — the page renders its title, shows no error
//    alert, no console error, no horizontal scroll on the phone, axe-core finds no serious / critical violation, and EVERY
//    API request goes to p6vc-core (no Worker, no p6vc-api, no GAS /exec); every API answer is ok (or an expected refusal).
// 4. cleanup: the synthetic accounts are suspended (sessions revoked); the admin signs out. The synthetic vehicle stays (DEV).
// Report: test-results/p6vc-live-journey-ui.json (no tokens, no passwords). Exit 1 on any failure.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import zlib from 'node:zlib'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID, randomBytes } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const feDir = path.resolve(here, '..')
const gasDir = path.resolve(here, '../../backend/gas')
const fileUrl = (p) => pathToFileURL(p).href
// the gitignored .env is found from backend/gas upwards; P6VC_ENV_DIR points elsewhere (e.g. from a git worktree)
process.chdir(process.env.P6VC_ENV_DIR || gasDir); await import(fileUrl(path.join(gasDir, 'scripts/load-env.mjs'))); process.chdir(feDir)
const { coreFrontendEndpoint } = await import(fileUrl(path.join(gasDir, 'scripts/core-frontend-endpoint.mjs')))
const { PHOTO_SLOTS } = await import(fileUrl(path.join(gasDir, 'src/domain/policies/VehicleLifecycle.js')))
if (process.env.P6VC_ALLOW_OWNER_DEV_WRITES !== 'RUN_SYNTHETIC_OWNER_DEV') throw new Error('owner-dev synthetic write guard is required')
const ENDPOINT = coreFrontendEndpoint(), CORE_ORIGIN = new URL(ENDPOINT).origin
const require = createRequire(import.meta.url)
const AXE = require.resolve('axe-core/axe.min.js')
const out = path.resolve('test-results/live-journey-ui'); fs.mkdirSync(out, { recursive: true })
const report = { startedAt: new Date().toISOString(), endpoint: ENDPOINT, checks: [], sweep: [] }
const check = (name, ok, detail = '') => { report.checks.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 300) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + String(detail).slice(0, 200) : '')) }
const persist = () => { fs.mkdirSync('test-results', { recursive: true }); fs.writeFileSync('test-results/p6vc-live-journey-ui.json', JSON.stringify(report, null, 2) + '\n') }

// --- the web app: our own dev server on a free port, pointed at the core (or P6VC_UI_BASE)
let dev = null, APP = process.env.P6VC_UI_BASE
if (!APP) {
  const port = Number(process.env.P6VC_UI_PORT || 5177)
  APP = `http://localhost:${port}`
  dev = spawn(process.execPath, [path.join(feDir, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'],
    { cwd: feDir, env: { ...process.env, VITE_CORE_API_URL: ENDPOINT, VITE_BASE_PATH: '/' }, stdio: 'ignore' })
  for (let i = 0; i < 60; i++) { try { if ((await fetch(APP)).ok) break } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)) }
}
report.app = APP

// --- API (setup + read-back), as a browser on APP would call it
const api = async (operation, payload = {}, token) => {
  const [group, ...rest] = operation.split('.')
  const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json', origin: APP },
    body: JSON.stringify({ apiVersion: 'v1', group, action: rest.join('.'), payload, requestId: randomUUID(), ...(token ? { sessionToken: token } : {}) }),
    signal: AbortSignal.timeout(90000) })
  return r.json()
}
const must = async (op, payload, token) => { const r = await api(op, payload, token); if (!r.ok) throw new Error(op + ' → ' + (r.error?.code || 'FAILED')); return r.data }
// a solid-colour square PNG (synthetic; zlib only) with a diagonal band so it is not blank
function squarePng(n, [r, g, b]) {
  const row = Buffer.alloc(1 + n * 3)
  const raw = Buffer.alloc((1 + n * 3) * n)
  for (let y = 0; y < n; y++) {
    row[0] = 0
    for (let x = 0; x < n; x++) { const band = Math.abs(x - y) < n / 12; row[1 + x * 3] = band ? 255 : r; row[2 + x * 3] = band ? 255 : g; row[3 + x * 3] = band ? 255 : b }
    row.copy(raw, y * row.length)
  }
  const crcTable = Array.from({ length: 256 }, (_, k) => { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (buf) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const strongPassword = () =>'Syn-' + randomBytes(12).toString('base64url') + '-9aZ!'

const created = [], tokens = {}
let admin = null, browser = null, current = null
try {
  admin = (await must('auth.login', { username: process.env.P6VC_ADMIN_USER, password: process.env.P6VC_ADMIN_PASS })).sessionToken
  const health = await must('system.health', {})
  report.backendVersion = health.backendVersion
  check('SETUP core health', health.status === 'ready', health.backendVersion)

  // synthetic accounts, one per role; passwords generated here and kept in memory only
  const tag = Date.now().toString(36)
  for (const [kind, role] of Object.entries({ reg: 'REGISTRATION_ADMIN', staff: 'STAFF', owner: 'OWNER' })) {
    const username = `p6vc_ui_${kind}_${tag}`, temp = strongPassword(), final = strongPassword()
    const u = await must('users.create', { username, displayName: `P6VC UI journey ${kind}`, temporaryPassword: temp }, admin)
    created.push(u.userId)
    await must('users.assignRoles', { userId: u.userId, roles: [role] }, admin)
    const first = (await must('auth.login', { username, password: temp })).sessionToken
    await must('auth.changePassword', { oldPassword: temp, newPassword: final }, first)
    tokens[kind] = { token: (await must('auth.login', { username, password: final })).sessionToken, userId: u.userId }
  }
  tokens.sys = { token: admin }
  check('SETUP synthetic accounts (reg, staff, owner) signed in', Object.keys(tokens).length === 4)

  // one synthetic registration (fixture photos, plate ฑฆ…)
  const refs = await must('references.registration', {}, admin), L = refs.lists
  const t = Date.now()
  const camp = await must('campaigns.create', { name: `UI journey ${new Date(t).toISOString().slice(0, 16)}`,
    startsAt: new Date(t - 60000).toISOString(), endsAt: new Date(t + 3600000).toISOString(), maxSubmissions: 3 }, admin)
  // synthetic photos that satisfy the LIVE photo rules (VC-ADR-055, set by the admin): a square fits every orientation;
  // its side is inside [minSide, maxSide]; a different colour per slot
  const policy = (await must('campaigns.validate', { campaignToken: camp.campaignToken })).photoPolicy || {}
  const side = Math.min(Number(policy.maxSide) || 1600, Math.max(Number(policy.minSide) || 0, 900))
  report.photoPolicy = { orientation: policy.orientation || 'ANY', minSide: policy.minSide || 0, maxSide: policy.maxSide, side }
  const photos = [], colours = [[200, 40, 40], [40, 160, 60], [40, 80, 200], [220, 160, 30], [120, 60, 160]]
  for (const [i, slot] of PHOTO_SLOTS.entries())
    photos.push({ slot, photoId: (await must('photos.upload', { campaignToken: camp.campaignToken, slot,
      base64Image: squarePng(side, colours[i]).toString('base64'), mimeType: 'image/png' })).photoId })
  let sub, plate, province = L.provinces[0].code
  for (let n = 1000 + (Math.floor(t / 1000) % 8000), i = 0; i < 6; i++, n++) {
    plate = 'ฑฆ' + n
    sub = await api('registrations.submit', { campaignToken: camp.campaignToken, plate, province, plateType: L.plateTypes[0].code,
      vehicleType: L.vehicleTypes[0].code, brand: L.brands[0].code, model: (L.models || []).find((m) => m.parentCode === L.brands[0].code)?.code || 'ทดสอบ',
      color: L.colors[0].code, organizationId: refs.organizations[0].code, relationship: L.relationships[0].code,
      contactName: 'ผู้ประสานงานทดสอบ UI', contactPhone: '+66809' + String(t % 1000000).padStart(6, '0'), photos,
      idempotencyKey: `ui-journey-${t}-${i}`, referenceVersion: refs.version, stickerCategory: 'NCO' })
    if (sub.ok || sub.error?.code !== 'DUPLICATE_VEHICLE') break
  }
  if (!sub.ok) throw new Error('registrations.submit → ' + sub.error?.code)
  const requestId = sub.data.requestId
  report.synthetic = { plate, province }
  check('SETUP synthetic registration submitted', /^[a-f0-9]{64}$/.test(requestId))

  // --- browser helpers: every page records console errors, API hosts and API answers
  browser = await chromium.launch()
  async function pageAs(kind, viewport = { width: 1280, height: 900 }) {
    const ctx = await browser.newContext({ viewport })
    const page = await ctx.newPage()
    current = page
    const seen = { console: [], hosts: new Set(), apiFailures: [], badHosts: [] }
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource.*(drive|googleusercontent)/i.test(m.text())) seen.console.push(m.text().slice(0, 160)) })
    page.on('request', (r) => {
      const u = new URL(r.url())
      if (/workers\.dev|p6vc-api-|script\.google(usercontent)?\.com\/macros/.test(u.href)) seen.badHosts.push(u.host)
      if (r.method() === 'POST' && u.pathname.endsWith('/api/frontend')) seen.hosts.add(u.origin)
    })
    page.on('response', async (r) => {
      if (r.request().method() !== 'POST' || !r.url().endsWith('/api/frontend')) return
      try { const j = await r.json(); if (!j.ok) seen.apiFailures.push(j.error?.code || 'FAILED') } catch { seen.apiFailures.push('NOT_JSON') }
    })
    await page.goto(APP + '/#/signin')
    if (kind) { await page.evaluate((tk) => sessionStorage.setItem('p6vc-session-token', tk), tokens[kind].token); await page.reload() }
    return { page, seen, close: () => ctx.close() }
  }
  // the app restores the session first and may land on the dashboard: set the route until it sticks
  const go = async (page, hash) => {
    for (let i = 0; i < 8; i++) {
      await page.evaluate((h) => { location.hash = h }, hash)
      await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(1500)
      if (decodeURIComponent(await page.evaluate(() => location.hash)).startsWith(hash)) return
      await page.waitForTimeout(1500)
    }
  }

  // --- 2. journey
  {
    const { page, seen, close } = await pageAs('reg')
    await go(page, '#/app/registrations/review')
    const row = page.locator('li', { hasText: requestId.slice(0, 8) })
    await row.first().waitFor({ timeout: 30000 })
    await row.first().getByRole('button', { name: 'ตรวจรายละเอียด' }).click()
    await page.getByText('ตรวจสอบภาพป้ายทะเบียนแล้ว').click()
    await page.getByRole('button', { name: 'อนุมัติการลงทะเบียน' }).click()
    await page.getByRole('button', { name: 'ยืนยันการอนุมัติ' }).click()
    await page.getByText('อนุมัติแล้ว').first().waitFor({ timeout: 60000 })
    await page.screenshot({ path: path.join(out, 'journey-approved.png') })
    check('JOURNEY reg admin approves in the review page', true)
    check('JOURNEY review page: API only to the core', [...seen.hosts].every((h) => h === CORE_ORIGIN) && !seen.badHosts.length, [...seen.hosts, ...seen.badHosts].join(' '))
    await close()
  }
  const found = await must('vehicles.lookup', { plate, province }, tokens.staff.token)
  const vehicleId = found.vehicleId || found.vehicle?.vehicleId || found.items?.[0]?.vehicleId
  check('READBACK the approved vehicle is found by plate (staff)', Boolean(vehicleId), plate)
  const exp = await must('qr.export', { vehicleIds: [vehicleId] }, admin)
  check('READBACK one ACTIVE QR with its code (qr.export READY)', exp.items[0]?.status === 'READY', exp.items[0]?.status)
  const detail = await must('vehicles.detail', { vehicleId }, admin)
  await must('vehicles.update', { vehicleId, expectedVersion: Number(detail.version ?? detail.vehicle?.version ?? 1), ownerUserId: tokens.owner.userId }, admin)
  {
    const { page, close } = await pageAs('owner')
    await go(page, '#/app/vehicles/mine')
    const shown = await page.getByText(plate).first().isVisible({ timeout: 30000 }).catch(() => false)
    check('JOURNEY owner sees the vehicle in "ยานพาหนะของฉัน"', shown, plate)
    await close()
  }
  {
    const { page, seen, close } = await pageAs('staff')
    await go(page, '#/app/vehicles/detail/' + vehicleId)
    const shown = await page.getByText(plate).first().isVisible({ timeout: 30000 }).catch(() => false)
    check('JOURNEY staff opens the vehicle detail page', shown && !seen.badHosts.length, plate)
    await close()
  }
  {
    const { page, close } = await pageAs(null)
    await page.goto(APP + '/#/q/' + exp.items[0].token); await page.waitForTimeout(4000)
    const text = await page.locator('body').innerText()
    check('JOURNEY public QR landing page answers for the sticker code', text.length > 40 && !/ไม่พบ|ผิดพลาด/.test(text.slice(0, 400)))
    await close()
  }

  // --- 3. route sweep: every page each role may open, desktop + phone
  const ROUTES = {
    sys: ['dashboard', 'about', 'account/security', 'vehicles/search', 'vehicles/qr', 'vehicles/registry', 'registrations/review',
      'vehicles/changes/review', 'admin/users', 'admin/organizations', 'admin/campaigns', 'admin/qr-print', 'admin/qr', 'admin/settings',
      'admin/retention', 'admin/audit', 'vehicles/detail/' + vehicleId],
    reg: ['dashboard', 'registrations/review', 'vehicles/changes/review', 'vehicles/registry', 'vehicles/search'],
    staff: ['dashboard', 'vehicles/search', 'vehicles/qr', 'vehicles/detail/' + vehicleId],
    owner: ['dashboard', 'vehicles/mine', 'account/security']
  }
  for (const [kind, routes] of Object.entries(ROUTES)) {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
      const { page, seen, close } = await pageAs(kind, viewport)
      for (const r of routes) {
        seen.console.length = 0; seen.apiFailures.length = 0
        await go(page, '#/app/' + r)
        const res = await page.evaluate(() => ({
          title: document.querySelector('h1')?.textContent?.trim() || '',
          forbidden: /forbidden/.test(location.hash), signin: /signin/.test(location.hash),
          errorAlert: [...document.querySelectorAll('.alert-error')].filter((e) => e.offsetParent).map((e) => e.textContent.trim().slice(0, 80)),
          sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
          widest: document.documentElement.scrollWidth > window.innerWidth + 1 ? [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(-3).map((e) => e.tagName + '.' + [...e.classList].slice(0, 3).join('.') + ' ' + Math.round(e.getBoundingClientRect().right)) : []
        }))
        await page.addScriptTag({ path: AXE })
        const axe = await page.evaluate(async () => { const r = await window.axe.run(document, { resultTypes: ['violations'] })
          return r.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => v.id + ' @ ' + v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' :: ' + (n.any[0]?.message || n.failureSummary || '').slice(0, 140)).join(' | ')) })
        const failures = seen.apiFailures.filter((c) => !['FORBIDDEN', 'NOT_FOUND'].includes(c))
        const ok = res.title && !res.forbidden && !res.signin && !res.errorAlert.length && !seen.console.length && !failures.length
          && !seen.badHosts.length && [...seen.hosts].every((h) => h === CORE_ORIGIN) && !axe.length && !(viewport.width < 500 && res.sideways)
        report.sweep.push({ role: kind, route: r, width: viewport.width, ok, title: res.title, errors: res.errorAlert, console: [...seen.console],
          apiFailures: failures, axe, sideways: res.sideways })
        if (!ok) { console.log(`FAIL SWEEP ${kind} ${r} @${viewport.width}`, JSON.stringify({ ...res, console: seen.console, failures, axe })); await page.screenshot({ path: path.join(out, `sweep-${kind}-${r.replace(/\W+/g, '_')}-${viewport.width}.png`) }) }
      }
      await close()
    }
  }
  const bad = report.sweep.filter((s) => !s.ok)
  check(`SWEEP ${report.sweep.length} page views (4 roles × desktop + phone): rendered, no error, core only, axe clean, no sideways scroll`, !bad.length,
    bad.map((s) => `${s.role}:${s.route}@${s.width}`).join(', '))
} catch (e) {
  check('RUN completed', false, e.message)
  if (current) { await current.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {}); report.failureUrl = current.url(); report.failureText = (await current.locator('body').innerText().catch(() => '')).slice(0, 600) }
} finally {
  if (browser) await browser.close().catch(() => {})
  for (const userId of created) await api('users.suspend', { userId }, admin).catch(() => {})
  if (admin) await api('auth.logout', {}, admin).catch(() => {})
  if (dev) dev.kill()
  report.finishedAt = new Date().toISOString()
  report.status = report.checks.length && report.checks.every((c) => c.ok) ? 'PASS' : 'FAIL'
  persist()
  console.log('LIVE_JOURNEY_UI ' + JSON.stringify({ status: report.status, checks: report.checks.length, failed: report.checks.filter((c) => !c.ok).length, pageViews: report.sweep.length }))
  process.exit(report.status === 'PASS' ? 0 : 1)
}
