// VC-ADR-055: the admin's photo rules applied on the device — same limits as the server (no drift), the device codec follows
// them (orientation, minimum size, quality / size step-down to maxBytes), the raw file is never sent, and every screen gets
// the rules (campaigns.validate, vehicles.detail, system.config.get).
import { describe, it, expect, vi } from 'vitest'
import { DEFAULT_PHOTO_POLICY, PHOTO_ORIENTATIONS, PHOTO_POLICY_LIMITS, toPhotoPolicy, photoPolicyOrDefault, validPhotoPolicy, targetSize,
  photoShapeProblem, photoProblemText } from '../src/domain/media/photo-policy.js'
import * as server from '../../backend/gas/src/domain/policies/PhotoPolicy.js'
import { compressForUpload, inspectPhoto } from '../src/infrastructure/media/image-compress.js'
import { createGasRegistrationIntakeRepository } from '../src/infrastructure/registrations/gas-registration-intake-repository.js'
import { mapVehicleResponse } from '../src/infrastructure/vehicles/gas-vehicle-search-repository.js'
import { createGasSystemSettingsRepository } from '../src/infrastructure/settings/gas-system-settings-repository.js'
import { useVehicleMaintenance } from '../src/features/vehicle-maintenance/useVehicleMaintenance.js'
import { REGISTRATION_PHOTO_SLOTS, useRegistrationIntake } from '../src/features/registrations/useRegistrationIntake.js'

// a fake codec: decode gives the photo's size; encode gives a blob whose size we choose per attempt
const codec = (width, height, sizeOf) => {
  const calls = []
  return { calls, decode: async () => ({ width, height, close() {} }),
    encode: async (img, w, h, q) => { calls.push([w, h, q]); const n = sizeOf(w, h, q); return { size: n, arrayBuffer: async () => new Uint8Array(Math.min(n, 3)).buffer } } }
}
const file = new File([new Uint8Array([1, 2, 3])], 'p.jpg', { type: 'image/jpeg' })

describe('photo rules (VC-ADR-055)', () => {
  it('the web app uses exactly the server limits, defaults and orientations (no drift)', () => {
    expect(PHOTO_POLICY_LIMITS).toEqual(server.PHOTO_POLICY_LIMITS)
    expect(DEFAULT_PHOTO_POLICY).toEqual(server.DEFAULT_PHOTO_POLICY)
    expect(PHOTO_ORIENTATIONS).toEqual(server.PHOTO_ORIENTATIONS)
    for (const [w, h, o] of [[1600, 1200, 'LANDSCAPE'], [1200, 1600, 'LANDSCAPE'], [1000, 1000, 'PORTRAIT'], [900, 1600, 'PORTRAIT']])
      expect(photoShapeProblem(w, h, { ...DEFAULT_PHOTO_POLICY, orientation: o }) === '').toBe(server.fitsOrientation(w, h, o))
  })

  it('reads the server value safely: older value → defaults for the new fields; not a policy → null', () => {
    expect(toPhotoPolicy({ maxSide: 1200, quality: 0.7, maxBytes: 800000, thumbSide: 256 })).toEqual({ maxSide: 1200, quality: 0.7, maxBytes: 800000, thumbSide: 256, minSide: 0, orientation: 'ANY' })
    expect(toPhotoPolicy({ ...DEFAULT_PHOTO_POLICY, orientation: 'SIDEWAYS' })).toBeNull()
    expect(toPhotoPolicy(null)).toBeNull()
    expect(photoPolicyOrDefault(undefined)).toEqual(DEFAULT_PHOTO_POLICY)
    expect(validPhotoPolicy({ ...DEFAULT_PHOTO_POLICY, minSide: 1700 })).toBe(false)
  })

  it('resizes by the longest side, never up, in both orientations; refuses what would break minSide', () => {
    expect(targetSize(4000, 3000, DEFAULT_PHOTO_POLICY)).toEqual({ width: 1600, height: 1200 })
    expect(targetSize(3000, 4000, DEFAULT_PHOTO_POLICY)).toEqual({ width: 1200, height: 1600 })
    expect(targetSize(800, 600, DEFAULT_PHOTO_POLICY)).toEqual({ width: 800, height: 600 })
    expect(targetSize(4000, 1000, { ...DEFAULT_PHOTO_POLICY, minSide: 500 })).toBeNull() // → 1600 × 400
    expect(photoProblemText('PHOTO_ORIENTATION_INVALID', { ...DEFAULT_PHOTO_POLICY, orientation: 'LANDSCAPE' })).toMatch(/แนวนอน/)
    expect(photoProblemText('PHOTO_TOO_SMALL', { ...DEFAULT_PHOTO_POLICY, minSide: 900 })).toMatch(/900/)
  })

  it('the device codec: wrong orientation / too small refused before encoding; quality then size stepped down to maxBytes', async () => {
    const land = { ...DEFAULT_PHOTO_POLICY, orientation: 'LANDSCAPE', minSide: 600 }
    const c1 = codec(3000, 4000, () => 1)
    await expect(compressForUpload(file, land, c1)).rejects.toMatchObject({ code: 'PHOTO_ORIENTATION_INVALID' })
    expect(c1.calls).toEqual([])
    await expect(compressForUpload(file, land, codec(800, 500, () => 1))).rejects.toMatchObject({ code: 'PHOTO_TOO_SMALL' })
    expect(await inspectPhoto(file, land, codec(3000, 4000, () => 1))).toBe('PHOTO_ORIENTATION_INVALID')
    expect(await inspectPhoto(file, land, codec(4000, 3000, () => 1))).toBe('')
    // too big at 0.82 and 0.74, fits at 0.66
    const c2 = codec(4000, 3000, (w, h, q) => (q > 0.7 ? 2_000_000 : 900_000))
    const out = await compressForUpload(file, land, c2)
    expect(c2.calls.map(([, , q]) => q)).toEqual([0.82, 0.74, 0.66])
    expect([out.width, out.height, out.mimeType]).toEqual([1600, 1200, 'image/jpeg'])
    // still too big at the lowest quality → smaller, never under minSide → PHOTO_TOO_LARGE
    const c3 = codec(4000, 3000, () => 5_000_000)
    await expect(compressForUpload(file, land, c3)).rejects.toMatchObject({ code: 'PHOTO_TOO_LARGE' })
    expect(Math.min(...c3.calls.map(([w, h]) => Math.min(w, h)))).toBeGreaterThanOrEqual(600)
  })

  it('a file the browser cannot open is refused — the raw file (with EXIF / GPS) is never sent', async () => {
    const broken = { decode: async () => { throw new Error('x') }, encode: vi.fn() }
    await expect(compressForUpload(file, DEFAULT_PHOTO_POLICY, broken)).rejects.toMatchObject({ code: 'INVALID_MEDIA' })
    expect(broken.encode).not.toHaveBeenCalled()
    await expect(compressForUpload(new File(['x'], 'a.pdf', { type: 'application/pdf' }), DEFAULT_PHOTO_POLICY, codec(1, 1, () => 1))).rejects.toMatchObject({ code: 'INVALID_MEDIA' })
  })

  it('every screen gets the rules: campaigns.validate, vehicles.detail (photo readers), system.config.get + save', async () => {
    const policy = { ...DEFAULT_PHOTO_POLICY, orientation: 'PORTRAIT', minSide: 700 }
    const intake = createGasRegistrationIntakeRepository({ callPublicOperation: async () => ({ data: { valid: true, campaignId: 'c1', photoPolicy: policy }, requestId: 'r' }) })
    expect((await intake.validateCampaign('t')).photoPolicy).toEqual(policy)
    const base = { vehicleId: 'v1', plate: 'กข1', province: 'TH-10', status: 'ACTIVE', photos: [], photoPolicy: policy }
    expect(mapVehicleResponse(base, new Set(['vehicle.photos.read'])).photoPolicy).toEqual(policy)
    expect(mapVehicleResponse(base, new Set()).photoPolicy).toBeNull()
    const calls = []
    const settings = createGasSystemSettingsRepository({ callOperation: async (op, payload) => { calls.push([op, payload]); return { data: { idle_timeout_minutes: 30, retention_days: null, photo_policy: policy }, requestId: 'r' } } })
    expect((await settings.get()).settings.photoPolicy).toEqual(policy)
    await settings.updatePhotoPolicy({ policy })
    expect(calls.at(-1)).toEqual(['system.config.update', { values: { photo_policy: policy } }])
  })

  it('the photo-replace screen and the registration form pass the rules in force to the device codec', async () => {
    const policy = { ...DEFAULT_PHOTO_POLICY, orientation: 'LANDSCAPE' }
    const compress = vi.fn(async () => ({ base64Image: 'QUJD', mimeType: 'image/jpeg' }))
    const vehicle = { vehicleId: 'v-1', plate: 'กข1', province: 'TH-10', status: 'ACTIVE', photoPolicy: policy }
    const work = useVehicleMaintenance({ repository: { updateVehicle: vi.fn(), updateContact: vi.fn(), replacePhoto: vi.fn().mockResolvedValue({}), cancelVehicle: vi.fn() },
      detailRepository: { detail: vi.fn().mockResolvedValue({ vehicle, version: 1, requestId: 'd' }) }, permissions: ['vehicle.update'], compress })
    await work.load('v-1')
    await work.replacePhoto({ slot: 'FRONT', file })
    expect(compress).toHaveBeenCalledWith(file, policy)
    const form = useRegistrationIntake({ repository: { validateCampaign: vi.fn().mockResolvedValue({ valid: true, campaignId: 'c', photoPolicy: policy }),
      uploadPhoto: vi.fn(({ slot }) => Promise.resolve({ photoId: 'p' + slot, slot })), submit: vi.fn().mockResolvedValue({ requestId: 'r', vehicleId: 'v', status: 'PENDING_APPROVAL' }) },
    permissions: ['vehicle.registration.approve'], compress })
    compress.mockClear()
    await form.submit({ campaignToken: 'a'.repeat(64), fields: {}, files: Object.fromEntries(REGISTRATION_PHOTO_SLOTS.map(({ id }) => [id, file])) })
    expect(compress).toHaveBeenCalledTimes(5)
    expect(compress.mock.calls.every(([, p]) => p === form.photoPolicy.value && p.orientation === 'LANDSCAPE')).toBe(true)
  })
})
