import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const cdpPort = Number(process.env.P6VC_CDP_PORT || 9223)
const appUrl = process.env.P6VC_EVIDENCE_URL || 'http://127.0.0.1:4173/#/app/vehicles/search'
const evidenceDir = resolve('../docs/evidence/fe-staff-vehicle-search-20261119')
const axeSource = await readFile(resolve('node_modules/axe-core/axe.min.js'), 'utf8')

class CdpClient {
  constructor(socket) {
    this.socket = socket
    this.sequence = 0
    this.pending = new Map()
    this.events = new Map()
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data)
      if (message.id) {
        const entry = this.pending.get(message.id)
        if (!entry) return
        this.pending.delete(message.id)
        if (message.error) entry.reject(new Error(message.error.message))
        else entry.resolve(message.result)
        return
      }
      const listeners = this.events.get(message.method) || []
      this.events.delete(message.method)
      for (const resolveEvent of listeners) resolveEvent(message.params)
    })
  }

  send(method, params = {}) {
    return new Promise((resolveMessage, rejectMessage) => {
      const id = ++this.sequence
      this.pending.set(id, { resolve: resolveMessage, reject: rejectMessage })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  waitFor(method, timeoutMs = 10_000) {
    return new Promise((resolveEvent, rejectEvent) => {
      const timer = setTimeout(() => rejectEvent(new Error(`Timed out waiting for ${method}`)), timeoutMs)
      const listeners = this.events.get(method) || []
      listeners.push((value) => {
        clearTimeout(timer)
        resolveEvent(value)
      })
      this.events.set(method, listeners)
    })
  }
}

async function connect() {
  const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) => response.json())
  const target = targets.find((item) => item.type === 'page')
  if (!target) throw new Error('No Chromium page target found')
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolveSocket, rejectSocket) => {
    socket.addEventListener('open', resolveSocket, { once: true })
    socket.addEventListener('error', rejectSocket, { once: true })
  })
  return new CdpClient(socket)
}

const client = await connect()
await Promise.all([client.send('Page.enable'), client.send('Runtime.enable')])

const apiFixture = {
  vehicleId: 'vehicle-evidence-1', plate: 'กข 1234', province: 'TH-10', status: 'ACTIVE',
  vehicleType: 'รถยนต์นั่งส่วนบุคคล', brand: 'Toyota', model: 'Corolla Cross', color: 'ขาว',
  contacts: [{ name: 'สมชาย ทดสอบ', phone: '+66810000001', relationship: 'ผู้ดูแลรถ', isPrimary: true }],
  photos: [
    { photoId: 'photo-front', slot: 'FRONT', storageRef: 'not-for-ui', mimeType: 'image/jpeg' },
    { photoId: 'photo-rear', slot: 'REAR', storageRef: 'not-for-ui', mimeType: 'image/jpeg' },
  ],
}
const sessionFixture = {
  userId: 'preview-user', displayName: 'ผู้ใช้งานทดสอบ', organizationId: 'preview-unit',
  roles: ['SYSTEM_ADMIN', 'STAFF'],
  permissions: ['session.authenticated', 'users.manage', 'organizations.read', 'organizations.manage', 'retention.read', 'retention.delete.approve', 'vehicle.lookup', 'vehicle.contact.read', 'vehicle.photos.read', 'vehicle.history.read'],
  expiresAt: '2026-11-20T02:30:00.000Z', mustChangePassword: false,
}
const gasEvidenceEndpoint = 'https://script.google.com/macros/s/evidence-only/exec'
const gasPersistedEndpoint = 'https://script.google.com/macros/s/persisted-evidence/exec'
const workerEvidenceEndpoint = 'https://p6vc-evidence.example.workers.dev/api/frontend'

const installFixture = `
  (() => {
    sessionStorage.setItem('p6vc-session-token', 'synthetic-evidence-session');
    sessionStorage.setItem('p6vc-session-summary', ${JSON.stringify(JSON.stringify(sessionFixture))});
    const nativeFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input, init = {}) => {
      const url = String(input?.url || input || '');
      if (![${JSON.stringify(gasEvidenceEndpoint)}, ${JSON.stringify(gasPersistedEndpoint)}, ${JSON.stringify(workerEvidenceEndpoint)}].includes(url)) return nativeFetch(input, init);
      const request = JSON.parse(init.body || '{}');
      const operation = request.group + '.' + request.action;
      let data;
      if (operation === 'auth.session') data = ${JSON.stringify(sessionFixture)};
      else if (operation === 'vehicles.lookup') data = ${JSON.stringify(apiFixture)};
      else if (operation === 'vehicles.history') data = [{
        audit_id: 'audit-evidence-1', action: 'VEHICLE_UPDATED', redacted_summary: 'VEHICLE_UPDATED',
        created_at: '2026-11-19T02:30:00.000Z'
      }];
      else data = {};
      return new Response(JSON.stringify({ ok: true, requestId: 'evidence-' + request.action, data, error: null }), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    };
  })();
`
await client.send('Page.addScriptToEvaluateOnNewDocument', { source: installFixture })

async function evaluate(expression) {
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

async function navigate(url = appUrl) {
  const freshUrl = new URL(url)
  freshUrl.searchParams.set('evidenceRun', String(Date.now()))
  const loaded = client.waitFor('Page.loadEventFired')
  await client.send('Page.navigate', { url: freshUrl.href })
  await loaded
  await waitUntil(`document.querySelector('.page-template')`)
}

async function waitUntil(expression, timeoutMs = 10_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(`Boolean(${expression})`)) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  throw new Error(`Timed out waiting for ${expression}`)
}

async function setViewport(width, height) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width < 640,
  })
}

async function setTheme(theme) {
  const loaded = client.waitFor('Page.loadEventFired')
  await evaluate(`localStorage.setItem('p6vc-theme', ${JSON.stringify(theme)}); location.reload()`)
  await loaded
  await waitUntil(`document.documentElement.dataset.theme === ${JSON.stringify(theme)}`)
}

async function submitSearch() {
  await evaluate(`(() => {
    const setValue = (selector, value) => {
      const input = document.querySelector(selector);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setValue('input[name="plate"]', 'กข 1234');
    setValue('input[name="province"]', 'TH-10');
    document.querySelector('form').requestSubmit();
  })()`)
  await waitUntil(`document.querySelector('#vehicle-result-title')`)
}

async function keyboardOrder() {
  const describeFocus = () => evaluate(`(() => {
    const element = document.activeElement;
    return { tag: element?.tagName || '', name: element?.getAttribute('name') || '', type: element?.getAttribute('type') || '' };
  })()`)
  await evaluate(`document.querySelector('input[name="plate"]').focus()`)
  const order = [await describeFocus()]
  for (let index = 0; index < 2; index += 1) {
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    order.push(await describeFocus())
  }
  await evaluate(`document.activeElement?.blur()`)
  return order
}

async function verifyRefreshPersistence() {
  await evaluate(`location.hash = '#/app/connection'`)
  await waitUntil(`document.querySelector('.route-plate')`)
  await evaluate(`(() => {
    const input = document.querySelector('input[type="url"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(gasPersistedEndpoint)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await waitUntil(`localStorage.getItem('p6vc-gas-endpoint') === ${JSON.stringify(gasPersistedEndpoint)}`)
  await evaluate(`(() => {
    document.querySelector('input[value="worker"]').click();
  })()`)
  await waitUntil(`document.querySelector('input[type="url"]')?.placeholder.includes('workers.dev')`)
  await evaluate(`(() => {
    const input = document.querySelector('input[type="url"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(workerEvidenceEndpoint)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await waitUntil(`localStorage.getItem('p6vc-worker-endpoint') === ${JSON.stringify(workerEvidenceEndpoint)}`)
  await evaluate(`location.hash = '#/app/vehicles/search'`)
  await waitUntil(`document.querySelector('.page-template')`)
  const loaded = client.waitFor('Page.loadEventFired')
  await evaluate(`location.reload()`)
  await loaded
  await waitUntil(`document.querySelector('.page-template')`)
  return evaluate(`(() => ({
    route: location.hash,
    signInVisible: Boolean(document.querySelector('input[autocomplete="username"]')),
    transport: localStorage.getItem('p6vc-api-transport'),
    gasEndpoint: localStorage.getItem('p6vc-gas-endpoint'),
    workerEndpoint: localStorage.getItem('p6vc-worker-endpoint'),
    sessionTokenPresent: Boolean(sessionStorage.getItem('p6vc-session-token')),
    sessionSummaryPresent: Boolean(sessionStorage.getItem('p6vc-session-summary'))
  }))()`)
}

async function auditPage() {
  await evaluate(axeSource)
  const axe = await evaluate(`axe.run(document, { resultTypes: ['violations', 'incomplete'] }).then((result) => ({
    violations: result.violations.map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.map((node) => ({ target: node.target, html: node.html, failureSummary: node.failureSummary })) })),
    incomplete: result.incomplete.map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.map((node) => ({ target: node.target, html: node.html })) }))
  }))`)
  const layout = await evaluate(`(() => ({
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    theme: document.documentElement.dataset.theme,
    title: document.title,
    activeElement: document.activeElement?.tagName || ''
  }))()`)
  return { layout, axe }
}

async function screenshot(fileName, { fullPage = false } = {}) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: fullPage })
  await writeFile(resolve(evidenceDir, fileName), Buffer.from(result.data, 'base64'))
}

await mkdir(evidenceDir, { recursive: true })
const evidence = { generatedAt: new Date().toISOString(), appUrl, browser: 'Microsoft Edge headless', cases: {} }

await setViewport(1440, 900)
await navigate()
await setTheme('corporate')
evidence.cases.desktopCorporateIdle = await auditPage()
evidence.cases.desktopCorporateIdle.keyboardOrder = await keyboardOrder()
await screenshot('search-desktop-corporate.png')

await setTheme('dark')
await submitSearch()
evidence.cases.desktopDarkSuccess = await auditPage()
await screenshot('search-desktop-dark-success.png')

await setViewport(390, 844)
await setTheme('corporate')
await submitSearch()
evidence.cases.mobileCorporateSuccess = await auditPage()
await screenshot('search-mobile-corporate-success.png', { fullPage: true })

evidence.refreshPersistence = await verifyRefreshPersistence()

await writeFile(resolve(evidenceDir, 'browser-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
client.socket.close()

const violations = Object.values(evidence.cases).flatMap((entry) => entry.axe.violations)
const overflow = Object.values(evidence.cases).filter((entry) => entry.layout.documentScrollWidth !== entry.layout.documentClientWidth)
const refreshFailed = evidence.refreshPersistence.route !== '#/app/vehicles/search'
  || evidence.refreshPersistence.signInVisible
  || evidence.refreshPersistence.transport !== 'worker'
  || evidence.refreshPersistence.gasEndpoint !== gasPersistedEndpoint
  || evidence.refreshPersistence.workerEndpoint !== workerEvidenceEndpoint
  || !evidence.refreshPersistence.sessionTokenPresent
  || !evidence.refreshPersistence.sessionSummaryPresent
if (violations.length || overflow.length || refreshFailed) process.exitCode = 1
console.log(JSON.stringify({ cases: Object.keys(evidence.cases), violations: violations.length, overflow: overflow.length, refreshFailed }, null, 2))
