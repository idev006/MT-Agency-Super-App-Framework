import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const cdpPort = Number(process.env.P6VC_CDP_PORT || 9223)
const evidenceSlice = process.env.P6VC_EVIDENCE_SLICE || 'staff'
const systemAdminEvidence = evidenceSlice === 'system-admin-users'
const systemAdminNavigationEvidence = evidenceSlice === 'system-admin-navigation'
const systemAdminCompleteEvidence = evidenceSlice === 'system-admin-complete'
const registrationReviewEvidence = evidenceSlice === 'registration-review'
const registrationIntakeEvidence = evidenceSlice === 'registration-intake'
const qrResolveEvidence = evidenceSlice === 'qr-resolve'
const appUrl = process.env.P6VC_EVIDENCE_URL || (qrResolveEvidence
  ? 'http://127.0.0.1:4173/#/app/vehicles/qr'
  : registrationIntakeEvidence
  ? 'http://127.0.0.1:4173/#/app/registrations/new'
  : registrationReviewEvidence
  ? 'http://127.0.0.1:4173/#/app/registrations/review'
  : systemAdminNavigationEvidence || systemAdminCompleteEvidence
  ? 'http://127.0.0.1:4173/#/app/dashboard'
  : systemAdminEvidence
  ? 'http://127.0.0.1:4173/#/app/admin/users'
  : 'http://127.0.0.1:4173/#/app/vehicles/search')
const evidenceDir = resolve(process.env.P6VC_EVIDENCE_DIR || (systemAdminNavigationEvidence
  ? '../docs/evidence/fe-system-admin-navigation-20261119'
  : systemAdminCompleteEvidence
  ? '../docs/evidence/fe-system-admin-complete-20261119'
  : systemAdminEvidence
  ? '../docs/evidence/fe-system-admin-users-20261119'
  : registrationReviewEvidence
  ? '../docs/evidence/fe-registration-review-20261120'
  : registrationIntakeEvidence
  ? '../docs/evidence/fe-registration-intake-20261120'
  : qrResolveEvidence
  ? '../docs/evidence/fe-qr-resolve-20261120'
  : '../docs/evidence/fe-staff-vehicle-search-20261119'))
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
const userFixture = [
  { userId: 'user-admin-evidence', username: 'admin', displayName: 'ผู้ดูแลระบบทดสอบ', organizationId: 'org-command', status: 'ACTIVE' },
  { userId: 'user-staff-evidence', username: 'staff.demo', displayName: 'เจ้าหน้าที่ทดสอบ', organizationId: 'org-station-01', status: 'ACTIVE' },
  { userId: 'user-suspended-evidence', username: 'staff.suspended', displayName: 'บัญชีระงับทดสอบ', organizationId: '', status: 'SUSPENDED' },
]
const adminSessionFixture = {
  userId: 'preview-user', displayName: 'ผู้ใช้งานทดสอบ', organizationId: 'preview-unit',
  roles: ['SYSTEM_ADMIN'],
  permissions: [
    'session.authenticated', 'system.settings.read', 'system.settings.manage', 'users.manage',
    'organizations.read', 'organizations.manage', 'campaigns.manage', 'qr.manage',
    'retention.read', 'retention.delete.approve', 'audit.read',
  ],
  expiresAt: '2026-11-20T02:30:00.000Z', mustChangePassword: false,
}
const staffSessionFixture = {
  ...adminSessionFixture,
  roles: ['STAFF'],
  permissions: ['session.authenticated', 'organizations.read', 'vehicle.lookup', 'vehicle.contact.read', 'vehicle.photos.read', 'vehicle.history.read'],
}
const registrationSessionFixture = {
  ...adminSessionFixture,
  roles: ['SYSTEM_ADMIN', 'REGISTRATION_ADMIN'],
  permissions: [...new Set([...adminSessionFixture.permissions,
    'vehicle.registration.approve', 'vehicle.lookup', 'vehicle.contact.read', 'vehicle.photos.read',
    'vehicle.update', 'vehicle.history.read', 'vehicle.change.approve'])],
}
const sessionFixture = registrationReviewEvidence || registrationIntakeEvidence ? registrationSessionFixture
  : systemAdminEvidence || systemAdminNavigationEvidence || systemAdminCompleteEvidence ? adminSessionFixture : staffSessionFixture
const gasEvidenceEndpoint = 'https://script.google.com/macros/s/evidence-only/exec'
const gasPersistedEndpoint = 'https://script.google.com/macros/s/persisted-evidence/exec'
const workerEvidenceEndpoint = 'https://p6vc-evidence.example.workers.dev/api/frontend'
const referenceFixture = {
  mode: 'ADVISORY', version: 'a'.repeat(64),
  lists: {
    provinces: [{ code: 'BKK', label: 'กรุงเทพมหานคร' }, { code: 'CNX', label: 'เชียงใหม่' }],
    plateTypes: [{ code: 'PRIVATE', label: 'รถยนต์ส่วนบุคคล' }],
    vehicleTypes: [{ code: 'CAR', label: 'รถยนต์' }],
    relationships: [{ code: 'OWNER', label: 'เจ้าของรถ' }],
    brands: [{ code: 'TOYOTA', label: 'โตโยต้า' }],
    models: [{ code: 'YARIS', label: 'ยาริส', parentCode: 'TOYOTA' }],
    colors: [{ code: 'WHITE', label: 'ขาว' }, { code: 'BLACK', label: 'ดำ' }],
  },
  organizations: [{ code: 'org-command', label: 'กองบัญชาการทดสอบ' }],
  policies: Object.fromEntries(['provinces', 'plateTypes', 'vehicleTypes', 'relationships', 'brands', 'models', 'colors', 'organizations'].map((key) => [key, 'ADVISORY'])),
}

const installFixture = `
  (() => {
    sessionStorage.setItem('p6vc-session-token', 'synthetic-evidence-session');
    sessionStorage.setItem('p6vc-session-summary', ${JSON.stringify(JSON.stringify(sessionFixture))});
    localStorage.setItem('p6vc-api-transport', 'direct');
    localStorage.setItem('p6vc-gas-endpoint', ${JSON.stringify(gasEvidenceEndpoint)});
    const nativeFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input, init = {}) => {
      const url = String(input?.url || input || '');
      if (![${JSON.stringify(gasEvidenceEndpoint)}, ${JSON.stringify(gasPersistedEndpoint)}, ${JSON.stringify(workerEvidenceEndpoint)}].includes(url)) return nativeFetch(input, init);
      const request = JSON.parse(init.body || '{}');
      const operation = request.group + '.' + request.action;
      let data;
      if (operation === 'system.health') data = { service: 'p6-vehicle-contact', status: 'ready', apiVersion: 'v1', backendVersion: '0.5.0', releaseChannel: 'development' };
      else if (operation === 'auth.session') data = ${JSON.stringify(sessionFixture)};
      else if (operation === 'references.registration') data = ${JSON.stringify(referenceFixture)};
      else if (operation === 'vehicles.lookup') data = ${JSON.stringify(apiFixture)};
      else if (operation === 'qr.resolve') data = ${JSON.stringify(apiFixture)};
      else if (operation === 'users.list') data = ${JSON.stringify(userFixture)};
      else if (operation === 'organizations.list') data = [{ organization_id: 'org-command', name: 'กองบัญชาการทดสอบ', org_type: 'POLICE', parent_id: '', status: 'ACTIVE' }];
      else if (operation === 'campaigns.list') data = [{ campaignId: 'campaign-1', startsAt: '2026-11-19T00:00:00.000Z', endsAt: '2026-12-19T00:00:00.000Z', maxSubmissions: 100, submittedCount: 3, status: 'ACTIVE' }];
      else if (operation === 'system.config.get') data = { idle_timeout_minutes: '30', retention_days: '365' };
      else if (operation === 'retention.listDue') data = [{ jobId: 'retention-1', vehicleId: 'vehicle-1', dueAt: '2026-11-20T00:00:00.000Z', status: 'DUE' }];
      else if (operation === 'audit.query') data = [{ type: 'change', eventId: 'audit-1', actorId: 'admin-1', entityId: 'vehicle-1', action: 'UPDATED', at: '2026-11-19T00:00:00.000Z' }];
      else if (operation === 'registrations.listPending') data = [{ requestId: 'registration-evidence-1', vehicleId: 'vehicle-evidence-2', submittedAt: '2026-11-20T01:15:00.000Z', status: 'PENDING_APPROVAL' }];
      else if (operation === 'registrations.detail') data = { requestId: 'registration-evidence-1', status: 'PENDING_APPROVAL', submittedAt: '2026-11-20T01:15:00.000Z', application: { plate_normalized: 'กข 1234', province_code: '65', plate_type: 'PRIVATE', vehicle_type: 'CAR', make: 'Toyota', model: 'Corolla Cross', color: 'ขาว', organization_id: 'org-command', relationship: 'ผู้ดูแลรถ', contactName: 'ผู้ทดสอบ', contactPhone: '+66810000001', photos: [{ photoId: 'photo-plate', slot: 'PLATE', mimeType: 'image/jpeg' }, { photoId: 'photo-front', slot: 'FRONT', mimeType: 'image/jpeg' }, { photoId: 'photo-rear', slot: 'REAR', mimeType: 'image/jpeg' }, { photoId: 'photo-left', slot: 'LEFT', mimeType: 'image/jpeg' }, { photoId: 'photo-right', slot: 'RIGHT', mimeType: 'image/jpeg' }] } };
      else if (operation === 'vehicles.history') data = [{
        audit_id: 'audit-evidence-1', action: 'VEHICLE_UPDATED', redacted_summary: 'VEHICLE_UPDATED',
        created_at: '2026-11-19T02:30:00.000Z'
      }];
      else data = {};
      if (['users.list', 'organizations.list', 'campaigns.list', 'retention.listDue', 'audit.query', 'registrations.listPending'].includes(operation) && request.payload?.page) {
        const items = data;
        data = { items, total: items.length, page: request.payload.page, pageSize: request.payload.pageSize, totalPages: Math.ceil(items.length / request.payload.pageSize) };
      }
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
const evidence = { generatedAt: new Date().toISOString(), evidenceSlice, appUrl, browser: 'Microsoft Edge headless', cases: {} }

if (qrResolveEvidence) {
  const submitQr = async () => {
    await evaluate(`(() => {
      const input = document.querySelector('input[type="password"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'a'.repeat(64));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.closest('form').requestSubmit();
    })()`)
    await waitUntil(`document.querySelector('#vehicle-result-title')`)
  }
  await setViewport(1440, 900); await navigate(); await setTheme('dark'); await submitQr()
  evidence.cases.desktopDark = await auditPage(); await screenshot('qr-resolve-desktop-dark.png', { fullPage: true })
  await setViewport(360, 800); await setTheme('corporate'); await submitQr()
  evidence.cases.mobileCorporate = await auditPage(); await screenshot('qr-resolve-mobile-corporate.png', { fullPage: true })
} else if (registrationIntakeEvidence) {
  await setViewport(1440, 900); await navigate(); await setTheme('dark')
  await waitUntil(`document.querySelector('input[type="file"]')`)
  evidence.cases.desktopDark = await auditPage(); await screenshot('registration-intake-desktop-dark.png', { fullPage: true })
  await setViewport(360, 800); await setTheme('corporate')
  await waitUntil(`document.querySelector('input[type="file"]')`)
  evidence.cases.mobileCorporate = await auditPage(); await screenshot('registration-intake-mobile-corporate.png', { fullPage: true })
  await evaluate(`(() => {
    const select = [...document.querySelectorAll('select')].find((item) => [...item.options].some((option) => option.textContent.includes('สีอื่น')));
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, '__CUSTOM_COLOR__');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`)
  await waitUntil(`document.querySelector('input[aria-label="ระบุสีรถ"]')`)
  await evaluate(`(() => {
    const input = document.querySelector('input[aria-label="ระบุสีรถ"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'ฟ้าอมเทา');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  evidence.cases.mobileCustomColor = await auditPage(); await screenshot('registration-intake-mobile-custom-color.png', { fullPage: true })
} else if (registrationReviewEvidence) {
  await setViewport(1440, 900); await navigate(); await setTheme('dark')
  await waitUntil(`document.querySelector('#registration-queue-title')`)
  await evaluate(`document.querySelector('#registration-queue-title')?.parentElement?.querySelector('button')?.click()`)
  await waitUntil(`document.body.innerText.includes('ปิดรายละเอียด')`)
  evidence.cases.desktopDark = await auditPage(); await screenshot('registration-review-desktop-dark.png', { fullPage: true })
  await setViewport(360, 800); await setTheme('corporate')
  await waitUntil(`document.querySelector('#registration-queue-title')`)
  await evaluate(`document.querySelector('#registration-queue-title')?.parentElement?.querySelector('button')?.click()`)
  await waitUntil(`document.body.innerText.includes('ปิดรายละเอียด')`)
  evidence.cases.mobileCorporate = await auditPage(); await screenshot('registration-review-mobile-corporate.png', { fullPage: true })
} else if (systemAdminCompleteEvidence) {
  const routes = [
    ['account-security', '#/app/account/security'], ['users', '#/app/admin/users'],
    ['organizations', '#/app/admin/organizations'], ['campaigns', '#/app/admin/campaigns'],
    ['qr', '#/app/admin/qr'], ['settings', '#/app/admin/settings'],
    ['retention', '#/app/admin/retention'], ['audit', '#/app/admin/audit'],
  ]
  for (const [name, hash] of routes) {
    await setViewport(1440, 900); await navigate(`http://127.0.0.1:4173/${hash}`); await setTheme('dark')
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200))
    evidence.cases[`${name}DesktopDark`] = await auditPage(); await screenshot(`${name}-desktop-dark.png`, { fullPage: true })
    await setViewport(360, 800); await setTheme('corporate'); await new Promise((resolveDelay) => setTimeout(resolveDelay, 200))
    evidence.cases[`${name}MobileCorporate`] = await auditPage(); await screenshot(`${name}-mobile-corporate.png`, { fullPage: true })
  }
} else if (systemAdminNavigationEvidence) {
  await setViewport(1920, 1080)
  await navigate()
  await setTheme('corporate')
  await waitUntil(`document.querySelector('#planned-work-title')`)
  evidence.navigationCoverage = await evaluate(`(() => ({
    ready: [...document.querySelectorAll('a.p6-task-card h3')].map((item) => item.textContent.trim()),
    planned: [...document.querySelectorAll('#planned-work-title + p + ul strong')].map((item) => item.textContent.trim()),
    plannedLinkCount: document.querySelectorAll('#planned-work-title + p + ul a').length,
    pageText: document.querySelector('main')?.textContent || ''
  }))()`)
  evidence.cases.desktopWideCorporate = await auditPage()
  await screenshot('navigation-desktop-wide-corporate.png', { fullPage: true })

  await setViewport(1440, 900)
  await setTheme('dark')
  await waitUntil(`document.querySelector('#planned-work-title')`)
  evidence.cases.desktopDark = await auditPage()
  await screenshot('navigation-desktop-dark.png', { fullPage: true })

  await setViewport(360, 800)
  await setTheme('corporate')
  await waitUntil(`document.querySelector('#planned-work-title')`)
  evidence.cases.mobileCorporate = await auditPage()
  await screenshot('navigation-mobile-corporate.png', { fullPage: true })
} else if (systemAdminEvidence) {
  await setViewport(1440, 900)
  await navigate()
  await setTheme('corporate')
  await waitUntil(`document.querySelector('#user-directory-title')`)
  evidence.cases.desktopCorporateSuccess = await auditPage()
  await screenshot('users-desktop-corporate.png')

  await setTheme('dark')
  await waitUntil(`document.querySelector('#user-directory-title')`)
  evidence.cases.desktopDarkSuccess = await auditPage()
  await screenshot('users-desktop-dark.png')

  await setViewport(390, 844)
  await setTheme('corporate')
  await waitUntil(`document.querySelector('#user-directory-title')`)
  evidence.cases.mobileCorporateSuccess = await auditPage()
  await screenshot('users-mobile-corporate.png', { fullPage: true })
} else {
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
}

await writeFile(resolve(evidenceDir, 'browser-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
client.socket.close()

const violations = Object.values(evidence.cases).flatMap((entry) => entry.axe.violations)
const overflow = Object.values(evidence.cases).filter((entry) => entry.layout.documentScrollWidth !== entry.layout.documentClientWidth)
const expectedAdminReady = ['ภาพรวม', 'ตรวจสอบการเชื่อมต่อ', 'ผู้ใช้และสิทธิ์']
const expectedAdminPlanned = ['บัญชีและความปลอดภัย', 'หน่วยงาน', 'แคมเปญลงทะเบียน', 'จัดการ QR', 'ตั้งค่าระบบ', 'การเก็บรักษาข้อมูล', 'ตรวจสอบ Audit']
const navigationFailed = systemAdminNavigationEvidence && (
  JSON.stringify(evidence.navigationCoverage.ready) !== JSON.stringify(expectedAdminReady)
  || JSON.stringify(evidence.navigationCoverage.planned) !== JSON.stringify(expectedAdminPlanned)
  || evidence.navigationCoverage.plannedLinkCount !== 0
  || ['ค้นหายานพาหนะ', 'ตรวจสอบการลงทะเบียน', 'ยานพาหนะของฉัน'].some((label) => evidence.navigationCoverage.pageText.includes(label))
)
const refreshFailed = systemAdminEvidence || systemAdminNavigationEvidence || systemAdminCompleteEvidence || registrationReviewEvidence || registrationIntakeEvidence || qrResolveEvidence ? false : evidence.refreshPersistence.route !== '#/app/vehicles/search'
  || evidence.refreshPersistence.signInVisible
  || evidence.refreshPersistence.transport !== 'worker'
  || evidence.refreshPersistence.gasEndpoint !== gasPersistedEndpoint
  || evidence.refreshPersistence.workerEndpoint !== workerEvidenceEndpoint
  || !evidence.refreshPersistence.sessionTokenPresent
  || !evidence.refreshPersistence.sessionSummaryPresent
if (violations.length || overflow.length || refreshFailed || navigationFailed) process.exitCode = 1
console.log(JSON.stringify({ cases: Object.keys(evidence.cases), violations: violations.length, overflow: overflow.length, refreshFailed, navigationFailed }, null, 2))
