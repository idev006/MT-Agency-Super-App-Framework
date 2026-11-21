import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createGasRegistrationReviewRepository, RegistrationReviewContractError } from '../src/infrastructure/registrations/gas-registration-review-repository.js'
import { useRegistrationReview } from '../src/features/registrations/useRegistrationReview.js'

const page = readFileSync(new URL('../src/pages/RegistrationReviewPage.vue', import.meta.url), 'utf8')
const router = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8')

describe('registration review repository contract', () => {
  it('maps the queue and detail through an allowlist without exposing storage references', async () => {
    const callOperation = vi.fn()
      .mockResolvedValueOnce({ data: { items: [{ requestId: 'r-1', vehicleId: 'v-1', submittedAt: '2026-11-20T00:00:00.000Z', status: 'PENDING_APPROVAL', internal: 'drop' }], total: 1, page: 1, pageSize: 10, totalPages: 1 }, requestId: 'list' })
      .mockResolvedValueOnce({ data: { requestId: 'r-1', status: 'PENDING_APPROVAL', submittedAt: '2026-11-20T00:00:00.000Z', application: { plate_normalized: 'กข1234', province_code: '65', plate_type: 'PRIVATE', vehicle_type: 'CAR', make: 'Toyota', model: 'Test', color: 'ขาว', organization_id: 'org-1', relationship: 'เจ้าของ', contactName: 'ผู้ทดสอบ', contactPhone: '+66800000000', photos: [{ photoId: 'p-1', slot: 'PLATE', mimeType: 'image/jpeg', storageRef: 'private-drive-ref' }] } }, requestId: 'detail' })
    const repository = createGasRegistrationReviewRepository({ callOperation })
    expect((await repository.listPending()).registrations[0]).toEqual({ requestId: 'r-1', vehicleId: 'v-1', submittedAt: '2026-11-20T00:00:00.000Z', status: 'PENDING_APPROVAL' })
    const detail = await repository.detail('r-1')
    expect(detail.registration.application.photos).toEqual([{ photoId: 'p-1', slot: 'PLATE', mimeType: 'image/jpeg' }])
    expect(JSON.stringify(detail)).not.toContain('private-drive-ref')
  })

  it('sends exact approval and rejection DTOs and keeps a returned QR token in memory only', async () => {
    const callOperation = vi.fn()
      .mockResolvedValueOnce({ data: { requestId: 'r-1', vehicleId: 'v-1', status: 'APPROVED', qrToken: 'token-once', qrId: 'q-1' }, requestId: 'approve' })
      .mockResolvedValueOnce({ data: { requestId: 'r-2', vehicleId: 'v-2', status: 'REJECTED' }, requestId: 'reject' })
    const repository = createGasRegistrationReviewRepository({ callOperation })
    expect((await repository.review({ requestId: 'r-1', decision: 'APPROVE', platePhotoVerified: true })).qrToken).toBe('token-once')
    await repository.review({ requestId: 'r-2', decision: 'REJECT' })
    expect(callOperation.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ['registrations.review', { requestId: 'r-1', decision: 'APPROVE', platePhotoVerified: true }],
      ['registrations.review', { requestId: 'r-2', decision: 'REJECT' }],
    ])
  })

  it('fails closed for malformed successful responses', async () => {
    const repository = createGasRegistrationReviewRepository({ callOperation: vi.fn().mockResolvedValue({ data: { requestId: 'r-1', status: 'UNKNOWN' } }) })
    await expect(repository.review({ requestId: 'r-1', decision: 'APPROVE', platePhotoVerified: true })).rejects.toBeInstanceOf(RegistrationReviewContractError)
  })

  it('fetches one evidence photo through the exact DTO and maps a memory-only data source', async () => {
    const callOperation = vi.fn().mockResolvedValue({ data: { photoId: 'p-1', slot: 'FRONT', mimeType: 'image/png', base64Image: 'QUJD', storageRef: 'private-drive-ref' }, requestId: 'photo' })
    const repository = createGasRegistrationReviewRepository({ callOperation })
    const result = await repository.photo({ requestId: 'r-1', photoId: 'p-1' })
    expect(callOperation).toHaveBeenCalledWith('registrations.photo', { requestId: 'r-1', photoId: 'p-1' })
    expect(result.photo).toEqual({ photoId: 'p-1', slot: 'FRONT', mimeType: 'image/png', base64Image: 'QUJD' })
    expect(JSON.stringify(result)).not.toContain('private-drive-ref')
  })

  it('fails closed for photo responses that break the contract', async () => {
    const invalid = [
      { photoId: 'other', slot: 'FRONT', mimeType: 'image/png', base64Image: 'QUJD' },
      { photoId: 'p-1', slot: 'FRONT', mimeType: 'application/pdf', base64Image: 'QUJD' },
      { photoId: 'p-1', slot: 'FRONT', mimeType: 'image/png', base64Image: 'not base64!' },
      { photoId: 'p-1', slot: 'FRONT', mimeType: 'image/png', base64Image: '' },
      null,
    ]
    for (const data of invalid) {
      const repository = createGasRegistrationReviewRepository({ callOperation: vi.fn().mockResolvedValue({ data, requestId: 'photo' }) })
      await expect(repository.photo({ requestId: 'r-1', photoId: 'p-1' })).rejects.toBeInstanceOf(RegistrationReviewContractError)
    }
  })
})

describe('registration review state and page contracts', () => {
  it('does not call the backend without permission', async () => {
    const repository = { listPending: vi.fn(), detail: vi.fn(), review: vi.fn(), photo: vi.fn() }
    const work = useRegistrationReview({ repository, permissions: [] })
    await work.load()
    expect(work.phase.value).toBe('forbidden')
    expect(repository.listPending).not.toHaveBeenCalled()
  })

  it('loads, inspects, confirms and never retries an uncertain write', async () => {
    const timeout = Object.assign(new Error('timeout'), { code: 'TIMEOUT', requestId: 'support' })
    const repository = {
      listPending: vi.fn().mockResolvedValue({ registrations: [{ requestId: 'r-1' }], pagination: { total: 1, page: 1, pageSize: 10, totalPages: 1 } }),
      detail: vi.fn().mockResolvedValue({ registration: { requestId: 'r-1' } }),
      review: vi.fn().mockRejectedValue(timeout),
      photo: vi.fn(),
    }
    const work = useRegistrationReview({ repository, permissions: ['vehicle.registration.approve'] })
    await work.load(); await work.inspect('r-1'); await work.review({ requestId: 'r-1', decision: 'APPROVE', platePhotoVerified: true })
    expect(work.actionPhase.value).toBe('uncertain')
    expect(repository.review).toHaveBeenCalledTimes(1)
    expect(work.failure.value.requestId).toBe('support')
  })

  it('loads the FRONT hero first, keeps bytes in memory and clears them on close', async () => {
    const photos = [
      { photoId: 'p-rear', slot: 'REAR', mimeType: 'image/png' },
      { photoId: 'p-front', slot: 'FRONT', mimeType: 'image/png' },
    ]
    const repository = {
      listPending: vi.fn(),
      detail: vi.fn().mockResolvedValue({ registration: { requestId: 'r-1', application: { photos } } }),
      review: vi.fn(),
      photo: vi.fn().mockImplementation(async ({ photoId }) => ({ photo: { photoId, slot: photoId === 'p-front' ? 'FRONT' : 'REAR', mimeType: 'image/png', base64Image: 'QUJD' } })),
    }
    const work = useRegistrationReview({ repository, permissions: ['vehicle.registration.approve'] })
    await work.inspect('r-1')
    expect(work.activePhotoId.value).toBe('p-front')
    await vi.waitFor(() => expect(work.photoStates.value['p-rear']?.status).toBe('ready'))
    expect(repository.photo.mock.calls.map((call) => call[0].photoId)).toEqual(['p-front', 'p-rear'])
    expect(work.photoStates.value['p-front'].dataUrl).toBe('data:image/png;base64,QUJD')
    work.clearSelection()
    expect(work.photoStates.value).toEqual({})
    expect(work.activePhotoId.value).toBe('')
  })

  it('exposes per-photo errors with retry and never refetches a ready photo', async () => {
    const photos = [{ photoId: 'p-1', slot: 'FRONT', mimeType: 'image/png' }]
    const failure = Object.assign(new Error('upstream'), { code: 'GATEWAY_UPSTREAM_ERROR' })
    const repository = {
      listPending: vi.fn(),
      detail: vi.fn().mockResolvedValue({ registration: { requestId: 'r-1', application: { photos } } }),
      review: vi.fn(),
      photo: vi.fn().mockRejectedValueOnce(failure).mockResolvedValue({ photo: { photoId: 'p-1', slot: 'FRONT', mimeType: 'image/png', base64Image: 'QUJD' } }),
    }
    const work = useRegistrationReview({ repository, permissions: ['vehicle.registration.approve'] })
    await work.inspect('r-1')
    await vi.waitFor(() => expect(work.photoStates.value['p-1']?.status).toBe('error'))
    expect(work.photoStates.value['p-1'].code).toBe('GATEWAY_UPSTREAM_ERROR')
    await work.retryPhoto('p-1')
    expect(work.photoStates.value['p-1'].status).toBe('ready')
    await work.selectPhoto('p-1')
    expect(repository.photo).toHaveBeenCalledTimes(2)
  })

  it('wires the protected route and shared page contracts', () => {
    expect(router).toContain("name: 'registration-review'")
    expect(router).toContain("requiredPermissions: ['vehicle.registration.approve']")
    expect(page).toContain('<PageTemplateComponent')
    expect(page).toContain('<OperationalContextStrip')
    expect(page).toContain('<PaginationControl')
    expect(page).toContain('<ConfirmDialog')
    expect(page).not.toContain('fetch(')
    expect(page).not.toContain('localStorage')
    expect(page).not.toContain('sessionStorage')
  })

  it('renders a truncated request id with copy, a hero image and clickable thumbnails', () => {
    expect(page).toContain('shortId(')
    expect(page).toContain('คัดลอกเลขเต็ม')
    expect(page).toContain('navigator.clipboard.writeText')
    expect(page).toContain('aspect-[4/3]')
    expect(page).toContain('aria-pressed')
    expect(page).toContain('work.selectPhoto(photo.photoId)')
    expect(page).toContain('work.retryPhoto(')
    expect(page).toContain('loading loading-spinner')
    expect(page).toContain('skeleton')
  })
})
