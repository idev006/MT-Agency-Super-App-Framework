// R4: stepped intake. Safety rules: an uncertain submit is resent only with the SAME payload and
// the SAME idempotency key (backend replays the winner; a changed payload is IDEMPOTENCY_CONFLICT).
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { REGISTRATION_PHOTO_SLOTS, imageFileProblem, useRegistrationIntake } from '../src/features/registrations/useRegistrationIntake.js'
import { toE164 } from '../src/domain/reference/vehicle-presentation.js'

const TOKEN = 'a'.repeat(64)
const png = (name) => new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' })
const files = () => Object.fromEntries(REGISTRATION_PHOTO_SLOTS.map(({ id }) => [id, png(`${id}.png`)]))
const repo = (submit) => ({
  validateCampaign: vi.fn().mockResolvedValue({ valid: true, campaignId: 'c-1' }),
  uploadPhoto: vi.fn(({ slot }) => Promise.resolve({ photoId: `photo-${slot}`, slot })),
  submit,
})

describe('R4 uncertain submit → safe resend', () => {
  it('locks editing and resends the identical payload with the same key, without re-uploading', async () => {
    const submit = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('net'), { code: 'NETWORK_ERROR', requestId: 'q-1' }))
      .mockResolvedValueOnce({ requestId: 'r-1', vehicleId: 'v-1', status: 'PENDING_APPROVAL' })
    const repository = repo(submit)
    const work = useRegistrationIntake({ repository, permissions: ['vehicle.registration.approve'] })
    const fields = { plate: 'กข1234', contactPhone: '+66812345678' }
    await work.submit({ campaignToken: TOKEN, fields, files: files() })
    expect(work.phase.value).toBe('uncertain')
    expect(work.locked.value).toBe(true)
    fields.plate = 'changed-after-the-fact'
    await work.retrySame()
    expect(work.phase.value).toBe('success')
    const [first, second] = submit.mock.calls.map(([payload]) => payload)
    expect(second.idempotencyKey).toBe(first.idempotencyKey)
    expect(second).toEqual(first)
    expect(second.plate).toBe('กข1234')
    expect(repository.uploadPhoto).toHaveBeenCalledTimes(5)
  })

  it('a fresh submission after success gets a new key; next vehicle can keep the campaign', async () => {
    const submit = vi.fn().mockResolvedValue({ requestId: 'r', vehicleId: 'v', status: 'PENDING_APPROVAL' })
    const work = useRegistrationIntake({ repository: repo(submit), permissions: ['vehicle.registration.approve'] })
    await work.submit({ campaignToken: TOKEN, fields: { plate: 'a' }, files: files() })
    work.reset({ keepCampaign: true })
    expect(work.campaign.value?.valid).toBe(true)
    expect(work.phase.value).toBe('ready')
    await work.submit({ campaignToken: TOKEN, fields: { plate: 'b' }, files: files() })
    expect(submit.mock.calls[0][0].idempotencyKey).not.toBe(submit.mock.calls[1][0].idempotencyKey)
    expect(await work.retrySame()).toBe(false)
  })
})

describe('R4 input helpers', () => {
  it('converts Thai national numbers to E.164 and rejects junk', () => {
    expect(toE164('081-234-5678')).toBe('+66812345678')
    expect(toE164('02 123 4567')).toBe('+6621234567')
    expect(toE164('+66812345678')).toBe('+66812345678')
    expect(toE164('12345')).toBe('')
    expect(toE164('')).toBe('')
  })
  it('flags a bad photo at pick time with a Thai reason (phone photos up to 25 MB are accepted: compressed on device)', () => {
    expect(imageFileProblem(png('x.png'))).toBe('')
    expect(imageFileProblem(new File(['x'], 'x.pdf', { type: 'application/pdf' }))).toMatch(/ไม่ใช่รูปภาพ/)
    expect(imageFileProblem(new File([new Uint8Array(6_000_000)], 'phone.jpg', { type: 'image/jpeg' }))).toBe('')
    expect(imageFileProblem(new File([new Uint8Array(25_000_001)], 'huge.jpg', { type: 'image/jpeg' }))).toMatch(/25 MB/)
    expect(imageFileProblem(null)).toMatch(/ยังไม่ได้เลือก/)
  })
})

describe('R4 page contract', () => {
  const page = readFileSync(new URL('../src/pages/RegistrationIntakePage.vue', import.meta.url), 'utf8')
  it('is a 5-step flow with a review step and keeps inputs mounted', () => {
    expect(page).toContain("'ตรวจทานและส่ง'")
    expect(page).toMatch(/v-show="step === 3"/)
    expect(page).not.toMatch(/<fieldset v-if="step/)
    expect(page).toContain('work.retrySame')
    expect(page).toContain('URL.revokeObjectURL')
  })
})
