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
})

describe('registration review state and page contracts', () => {
  it('does not call the backend without permission', async () => {
    const repository = { listPending: vi.fn(), detail: vi.fn(), review: vi.fn() }
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
    }
    const work = useRegistrationReview({ repository, permissions: ['vehicle.registration.approve'] })
    await work.load(); await work.inspect('r-1'); await work.review({ requestId: 'r-1', decision: 'APPROVE', platePhotoVerified: true })
    expect(work.actionPhase.value).toBe('uncertain')
    expect(repository.review).toHaveBeenCalledTimes(1)
    expect(work.failure.value.requestId).toBe('support')
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
})
