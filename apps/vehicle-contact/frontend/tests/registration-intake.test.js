import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createGasRegistrationIntakeRepository, RegistrationIntakeContractError } from '../src/infrastructure/registrations/gas-registration-intake-repository.js'
import { REGISTRATION_PHOTO_SLOTS, useRegistrationIntake } from '../src/features/registrations/useRegistrationIntake.js'
import { CUSTOM_BRAND_CHOICE, reconcileBrandValue, resolveBrandValue } from '../src/features/registrations/brand-field.js'
import { CUSTOM_COLOR_CHOICE, reconcileColorValue, resolveColorValue } from '../src/features/registrations/color-field.js'

const page = readFileSync(new URL('../src/pages/RegistrationIntakePage.vue', import.meta.url), 'utf8')
const router = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8')
const menu = readFileSync(new URL('../src/domain/navigation/menu-catalog.js', import.meta.url), 'utf8')

describe('registration intake repository contract', () => {
  it('calls only the three public campaign registration operations with exact DTOs', async () => {
    const callPublicOperation = vi.fn()
      .mockResolvedValueOnce({ data: { valid: true, campaignId: 'c-1' }, requestId: 'validate' })
      .mockResolvedValueOnce({ data: { photoId: 'p-1', slot: 'FRONT' }, requestId: 'photo' })
      .mockResolvedValueOnce({ data: { requestId: 'r-1', vehicleId: 'v-1', status: 'PENDING_APPROVAL' }, requestId: 'submit' })
    const repository = createGasRegistrationIntakeRepository({ callPublicOperation })
    await repository.validateCampaign('a'.repeat(64))
    await repository.uploadPhoto({ campaignToken: 'a'.repeat(64), slot: 'FRONT', base64Image: 'iVBORw==', mimeType: 'image/png' })
    const payload = { campaignToken: 'a'.repeat(64), photos: [], idempotencyKey: 'id-1' }
    await repository.submit(payload)
    expect(callPublicOperation.mock.calls).toEqual([
      ['campaigns.validate', { campaignToken: 'a'.repeat(64) }],
      ['photos.upload', { campaignToken: 'a'.repeat(64), slot: 'FRONT', base64Image: 'iVBORw==', mimeType: 'image/png' }],
      ['registrations.submit', payload],
    ])
  })

  it('fails closed for malformed successful responses', async () => {
    const repository = createGasRegistrationIntakeRepository({ callPublicOperation: vi.fn().mockResolvedValue({ data: { valid: false } }) })
    await expect(repository.validateCampaign('a'.repeat(64))).rejects.toBeInstanceOf(RegistrationIntakeContractError)
  })
})

describe('registration intake state and page contracts', () => {
  it('keeps vehicle model free text and resolves preset or custom brands and colors', () => {
    const brands = [{ code: 'TOYOTA', label: 'TOYOTA' }]
    const colors = [{ code: 'WHITE', label: 'ขาว' }]
    expect(reconcileBrandValue('TOYOTA', brands)).toEqual({ choice: 'TOYOTA', customValue: '' })
    expect(reconcileBrandValue('ยี่ห้อท้องถิ่น', brands)).toEqual({ choice: CUSTOM_BRAND_CHOICE, customValue: 'ยี่ห้อท้องถิ่น' })
    expect(resolveBrandValue('TOYOTA')).toBe('TOYOTA')
    expect(resolveBrandValue(CUSTOM_BRAND_CHOICE, ' ยี่ห้อท้องถิ่น ')).toBe('ยี่ห้อท้องถิ่น')
    expect(reconcileColorValue('WHITE', colors)).toEqual({ choice: 'WHITE', customValue: '' })
    expect(reconcileColorValue('ฟ้าอมเทา', colors)).toEqual({ choice: CUSTOM_COLOR_CHOICE, customValue: 'ฟ้าอมเทา' })
    expect(resolveColorValue('WHITE')).toBe('WHITE')
    expect(resolveColorValue(CUSTOM_COLOR_CHOICE, ' ฟ้าอมเทา ')).toBe('ฟ้าอมเทา')
    expect(page).toContain('กรอกรุ่นตามสมุดคู่มือจดทะเบียน')
    expect(page).toContain('ไม่พบยี่ห้อ? ระบุเอง')
    expect(page).toContain('aria-label="ระบุยี่ห้อยานพาหนะ"')
    expect(page).toContain('สีอื่น — ระบุเอง')
    expect(page).toContain('aria-label="ระบุสีรถ"')
    expect(page).not.toContain(':options="models"')
  })

  it('does not upload or submit without the registration permission', async () => {
    const repository = { validateCampaign: vi.fn(), uploadPhoto: vi.fn(), submit: vi.fn() }
    const work = useRegistrationIntake({ repository, permissions: [] })
    await work.submit({ campaignToken: 'a'.repeat(64), fields: {}, files: {} })
    expect(work.phase.value).toBe('forbidden')
    expect(repository.uploadPhoto).not.toHaveBeenCalled()
  })

  it('uploads exactly five slots before submitting one pending request', async () => {
    const repository = {
      validateCampaign: vi.fn().mockResolvedValue({ valid: true, campaignId: 'c-1' }),
      uploadPhoto: vi.fn(({ slot }) => Promise.resolve({ photoId: `photo-${slot}`, slot })),
      submit: vi.fn().mockResolvedValue({ requestId: 'r-1', vehicleId: 'v-1', status: 'PENDING_APPROVAL' }),
    }
    // VC-ADR-055: the device codec needs a browser; a stand-in passes the bytes through (the real one never sends an unopened file)
    const compress = async (f) => ({ base64Image: btoa(String.fromCharCode(...new Uint8Array(await f.arrayBuffer()))), mimeType: f.type })
    const work = useRegistrationIntake({ repository, permissions: ['vehicle.registration.approve'], compress })
    const bytes = new Uint8Array([137, 80, 78, 71])
    const files = Object.fromEntries(REGISTRATION_PHOTO_SLOTS.map(({ id }) => [id, new File([bytes], `${id}.png`, { type: 'image/png' })]))
    await work.submit({ campaignToken: 'a'.repeat(64), fields: { plate: 'กข1234' }, files })
    expect(repository.uploadPhoto).toHaveBeenCalledTimes(5)
    expect(repository.uploadPhoto.mock.calls.map(([value]) => value.slot)).toEqual(REGISTRATION_PHOTO_SLOTS.map(({ id }) => id))
    expect(repository.submit).toHaveBeenCalledWith(expect.objectContaining({ photos: REGISTRATION_PHOTO_SLOTS.map(({ id }) => ({ slot: id, photoId: `photo-${id}` })) }))
    expect(work.phase.value).toBe('success')
  })

  it('wires a permission-driven route and responsive native file inputs', () => {
    expect(router).toContain("name: 'registration-intake'")
    expect(router).toContain("requiredPermissions: ['vehicle.registration.approve']")
    expect(menu).toContain("route: 'registration-intake'")
    expect(page).toContain('<PageTemplateComponent')
    expect(page).toContain('<OperationalContextStrip')
    expect(page).toContain('type="file"')
    expect(page).toContain('capture="environment"')
    expect(page).toContain('ตรวจทานก่อนส่ง') // R4: the review step is the confirmation
    expect(page).not.toContain('<ConfirmDialog')
    expect(page).not.toContain('localStorage')
    expect(page).not.toContain('sessionStorage')
    expect(page).not.toContain('fetch(')
  })
})
