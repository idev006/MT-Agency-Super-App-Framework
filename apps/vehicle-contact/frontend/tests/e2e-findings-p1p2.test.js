// Fixes for the live UI E2E findings (INTEGRATION_E2E_UI_SSOT_EVIDENCE_20261124 §4).
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { campaignState } from '../src/features/common/useOneTimeSecretGuard.js'
import { REGISTRATION_PHOTO_SLOTS, useRegistrationIntake } from '../src/features/registrations/useRegistrationIntake.js'
import { useRegistrationReview } from '../src/features/registrations/useRegistrationReview.js'
import { createGasVehicleSearchRepository } from '../src/infrastructure/vehicles/gas-vehicle-search-repository.js'
import { createGasVehicleDetailRepository } from '../src/infrastructure/vehicles/gas-vehicle-detail-repository.js'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const vehicle = { vehicleId: 'v1', plate: 'กข1', province: '65', status: 'ACTIVE', contacts: [], photos: [] }
const auditRow = { audit_id: 'a1', action: 'REGISTRATION_APPROVED', redacted_summary: 'x', created_at: '2026-11-24T00:00:00Z' }

describe('P1.1 one-time secrets', () => {
  it('campaign status separates revoked / ended / not started / full / open', () => {
    const now = Date.parse('2026-11-24T12:00:00Z')
    const base = { status: 'ACTIVE', startsAt: '2026-11-24T10:00:00Z', endsAt: '2026-11-24T14:00:00Z', submittedCount: 1, maxSubmissions: 5 }
    expect(campaignState({ ...base, status: 'REVOKED' }, now).label).toBe('เพิกถอนแล้ว')
    expect(campaignState({ ...base, endsAt: '2026-11-24T11:00:00Z' }, now).label).toBe('หมดเวลาแล้ว')
    expect(campaignState({ ...base, startsAt: '2026-11-24T13:00:00Z' }, now).label).toBe('ยังไม่เริ่ม')
    expect(campaignState({ ...base, submittedCount: 5 }, now).label).toBe('เต็มโควตา')
    expect(campaignState(base, now).label).toBe('เปิดรับอยู่')
  })
  it('campaign and approval pages guard leaving while a one-time secret is shown; campaign token has a copy button', () => {
    expect(read('../src/pages/CampaignAdministrationPage.vue')).toContain('useOneTimeSecretGuard(administration.oneTimeToken)')
    expect(read('../src/pages/RegistrationReviewPage.vue')).toContain('useOneTimeSecretGuard(work.oneTimeQr)')
    expect(read('../src/features/campaigns/components/CampaignAdministrationPanel.vue')).toContain('คัดลอกรหัส')
  })
})

describe('P2 speed', () => {
  it('intake starts all 5 uploads before any finishes (parallel) and still submits once', async () => {
    let inFlight = 0, peak = 0
    const repository = {
      validateCampaign: vi.fn().mockResolvedValue({ valid: true, campaignId: 'c' }),
      uploadPhoto: vi.fn(async ({ slot }) => { inFlight++; peak = Math.max(peak, inFlight); await new Promise((r) => setTimeout(r, 5)); inFlight--; return { photoId: 'p-' + slot } }),
      submit: vi.fn().mockResolvedValue({ requestId: 'r', vehicleId: 'v', status: 'PENDING_APPROVAL' }),
    }
    const files = Object.fromEntries(REGISTRATION_PHOTO_SLOTS.map(({ id }) => [id, new File([new Uint8Array([1, 2])], id + '.png', { type: 'image/png' })]))
    const work = useRegistrationIntake({ repository, permissions: ['vehicle.registration.approve'] })
    await work.submit({ campaignToken: 'a'.repeat(64), fields: {}, files })
    expect(peak).toBe(5)
    expect(repository.submit).toHaveBeenCalledTimes(1)
    expect(repository.submit.mock.calls[0][0].photos.map((p) => p.photoId)).toEqual(REGISTRATION_PHOTO_SLOTS.map(({ id }) => 'p-' + id))
  })

  it('a failed upload keeps the successful ones so a retry resends only the failed slot', async () => {
    let failOnce = true
    const repository = {
      validateCampaign: vi.fn().mockResolvedValue({ valid: true }),
      uploadPhoto: vi.fn(async ({ slot }) => { if (slot === 'REAR' && failOnce) { failOnce = false; throw Object.assign(new Error('x'), { code: 'HTTP_500' }) } return { photoId: 'p-' + slot } }),
      submit: vi.fn().mockResolvedValue({ requestId: 'r', vehicleId: 'v', status: 'PENDING_APPROVAL' }),
    }
    const files = Object.fromEntries(REGISTRATION_PHOTO_SLOTS.map(({ id }) => [id, new File([new Uint8Array([1])], id + '.png', { type: 'image/png' })]))
    const work = useRegistrationIntake({ repository, permissions: ['vehicle.registration.approve'] })
    await work.submit({ campaignToken: 'a'.repeat(64), fields: {}, files })
    expect(work.phase.value).toBe('error')
    await work.submit({ campaignToken: 'a'.repeat(64), fields: {}, files })
    expect(repository.uploadPhoto).toHaveBeenCalledTimes(6)
    expect(work.phase.value).toBe('success')
  })

  it('review loads the evidence photos in parallel', async () => {
    let inFlight = 0, peak = 0
    const photos = ['FRONT', 'REAR', 'LEFT', 'RIGHT', 'FRONT_ANGLE'].map((slot) => ({ photoId: 'p-' + slot, slot }))
    const repository = {
      listPending: vi.fn(), review: vi.fn(),
      detail: vi.fn().mockResolvedValue({ registration: { requestId: 'r', application: { photos } } }),
      photo: vi.fn(async () => { inFlight++; peak = Math.max(peak, inFlight); await new Promise((r) => setTimeout(r, 5)); inFlight--; return { photo: { mimeType: 'image/png', base64Image: 'AA==' } } }),
    }
    const work = useRegistrationReview({ repository, permissions: ['vehicle.registration.approve'] })
    await work.inspect('r')
    await vi.waitFor(() => expect(Object.values(work.photoStates.value).filter((x) => x.status === 'ready')).toHaveLength(5))
    expect(peak).toBe(5)
  })

  it('search uses the history embedded in the lookup (one call) and falls back for older backends', async () => {
    const perms = { permissions: ['vehicle.lookup', 'vehicle.history.read'] }
    const embedded = vi.fn().mockResolvedValue({ data: { ...vehicle, history: [auditRow] }, requestId: 'q1' })
    const r1 = await createGasVehicleSearchRepository({ callOperation: embedded }).lookup({ plate: 'กข1', province: '65' }, perms)
    expect(embedded).toHaveBeenCalledTimes(1)
    expect(r1.history.map((h) => h.action)).toEqual(['REGISTRATION_APPROVED'])
    const legacy = vi.fn().mockResolvedValueOnce({ data: vehicle, requestId: 'q1' }).mockResolvedValueOnce({ data: [auditRow], requestId: 'q2' })
    const r2 = await createGasVehicleSearchRepository({ callOperation: legacy }).lookup({ plate: 'กข1', province: '65' }, perms)
    expect(legacy.mock.calls.map(([op]) => op)).toEqual(['vehicles.lookup', 'vehicles.history'])
    expect(r2.history).toHaveLength(1)
  })

  it('detail exposes embedded history (null when the backend does not embed it)', async () => {
    const withH = await createGasVehicleDetailRepository({ callOperation: vi.fn().mockResolvedValue({ data: { ...vehicle, version: 2, history: [auditRow] }, requestId: 'q' }) }).detail('v1', { permissions: [] })
    expect(withH.history).toHaveLength(1)
    const without = await createGasVehicleDetailRepository({ callOperation: vi.fn().mockResolvedValue({ data: { ...vehicle, version: 2 }, requestId: 'q' }) }).detail('v1', { permissions: [] })
    expect(without.history).toBeNull()
  })
})

describe('P1.4 maintenance page', () => {
  const page = read('../src/pages/VehicleMaintenancePage.vue')
  it('picks codes from labelled lists, accepts Thai phone input, confirms saves, and has an unambiguous cancel dialog', () => {
    expect(page).toContain("withCurrent('provinces', vehicleForm.province)")
    expect(page).toContain("withCurrent('colors', vehicleForm.color)")
    expect(page).toContain('toE164(contactForm.value.contactPhone)')
    expect(page).toContain('alert alert-success mb-5')
    expect(page).toContain('cancel-label="ไม่ใช่ กลับไป"')
  })
})

describe('P1.2 labels instead of codes', () => {
  it('relationship labels mirror the backend reference seed exactly', async () => {
    const { RELATIONSHIP_LABELS } = await import('../src/domain/reference/vehicle-presentation.js')
    const seed = read('../../backend/gas/src/domain/reference/ReferenceSeedV1.js')
    const block = seed.match(/const RELATIONSHIPS=Object\.freeze\(\[([\s\S]*?)\]\);/)[1]
    const backend = Object.fromEntries([...block.matchAll(/\['([A-Z_]+)','([^']+)'\]/g)].map(([, c, l]) => [c, l]))
    expect(RELATIONSHIP_LABELS).toEqual(backend)
  })
  it('the mapper keeps backend labels and plateType; the card prefers labels over codes', async () => {
    const { mapVehicleResponse } = await import('../src/infrastructure/vehicles/gas-vehicle-search-repository.js')
    const v = mapVehicleResponse({ ...vehicle, vehicleType: 'RY01', color: 'WHITE', plateType: 'STANDARD',
      labels: { vehicleType: 'รถยนต์นั่ง', color: 'ขาว', plateType: 'ป้ายปกติ' } }, new Set())
    expect(v.labels).toEqual({ vehicleType: 'รถยนต์นั่ง', color: 'ขาว', plateType: 'ป้ายปกติ' })
    expect(v.plateType).toBe('STANDARD')
    expect(mapVehicleResponse(vehicle, new Set()).labels).toEqual({ vehicleType: '', color: '', plateType: '' })
    const card = read('../src/features/vehicle-search/components/VehicleSearchResult.vue')
    expect(card).toContain('vehicle.value.labels?.vehicleType || vehicle.value.vehicleType')
    expect(card).toContain('relationshipLabel(contact.relationship)')
  })
})
