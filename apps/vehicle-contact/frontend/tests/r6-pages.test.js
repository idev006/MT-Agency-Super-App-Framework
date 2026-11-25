// R6: remaining P3 findings + redesign of frequently used pages.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')

describe('R6 P3 findings', () => {
  it('phones get a folded one-line context strip; tablets/desktop keep the full strip', () => {
    const strip = read('components/page/OperationalContextStrip.vue')
    expect(strip).toMatch(/<details class="operational-context-compact[^"]*md:hidden/)
    expect(strip).toMatch(/class="operational-context stats[^"]*hidden[^"]*md:inline-grid/)
  })
  it('header shows the role, never the technical user id', () => {
    const header = read('components/layout/AppHeader.vue')
    expect(header).not.toContain('รหัสผู้ใช้')
    expect(header).toContain('roleText')
  })
  it('dashboard work list hides the home page itself and the developer connection check', () => {
    expect(read('components/dashboard/RoleMenuGrid.vue')).toContain("new Set(['dashboard', 'about'])")
  })
  it('sign-in explains per-tab sessions', () => {
    expect(read('views/SignInView.vue')).toContain('เปิดแท็บใหม่ต้องเข้าสู่ระบบอีกครั้ง')
  })
})

describe('R6 My Vehicles', () => {
  const page = read('pages/MyVehiclesPage.vue')
  it('sends only real changes (the pre-filled form used to resend unchanged brand/model/colour)', () => {
    expect(page).toContain("form.value = { brand: '', model: '', color: '', contactName: '', contactPhone: '' }")
    expect(page).toContain('String(current[field] || \'\') === v')
    expect(page).toContain('await work.submitChange(delta)')
  })
  it('Thai phone input converted to E.164; province names; no raw ids shown', () => {
    expect(page).toContain('toE164(delta.contactPhone)')
    expect(page).toContain('provinceText(vehicle.province)')
    expect(page).not.toContain('shortId(work.selectedVehicle.value.vehicleId)')
  })
})

describe('R6 QR management', () => {
  const page = read('pages/QrGovernancePage.vue')
  it('finds the vehicle by plate + province instead of a raw 64-char id input', () => {
    expect(page).toContain('<VehicleSearchForm')
    expect(page).not.toContain('<label class="field-stack"><span class="label-text font-semibold">รหัสยานพาหนะ</span>')
    expect(page).toContain('route.query.vehicleId')
  })
  it('the one-time QR token has a copy button and a leave guard', () => {
    expect(page).toContain('useOneTimeSecretGuard(token)')
    expect(page).toContain('คัดลอกรหัส QR')
  })
  it('vehicle detail links to QR management for qr.manage', () => {
    expect(read('pages/VehicleDetailPage.vue')).toContain("permissionSet.has('qr.manage')")
  })
})

describe('R7 owner feedback', () => {
  it('inline form rows align the action button with the inputs (no guessed md:mt-8 offsets)', () => {
    for (const p of ['features/vehicle-search/components/VehicleSearchForm.vue', 'pages/QrResolvePage.vue', 'pages/RegistrationIntakePage.vue']) {
      const src = read(p)
      expect(src, p).toContain('p6-form-row')
      expect(src, p).toContain('p6-row-action')
      expect(src, p).not.toMatch(/md:mt-8/)
    }
  })
  it('vehicle detail uses tabs and loads evidence photos through vehicles.photo', () => {
    const tabs = read('features/vehicle-search/components/VehicleDetailTabs.vue')
    expect(tabs).toContain('role="tablist"')
    expect(tabs).toContain("watch(active, (tab) => { if (tab === 'photos') openPhotos() })")
    expect(read('infrastructure/vehicles/gas-vehicle-detail-repository.js')).toContain("callOperation('vehicles.photo'")
    expect(read('pages/VehicleDetailPage.vue')).toContain("route.query.from === 'registry'")
  })
  it('registry is a table on wide screens', () => {
    expect(read('pages/VehicleRegistryPage.vue')).toMatch(/<table class="table/)
  })
})
