// R5: review queues. Registration decisions are idempotent per (request, decision) on the backend,
// so an uncertain outcome may be resent unchanged. Change decisions are NOT idempotent, so an
// uncertain outcome is resolved only by re-reading the queue.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { useRegistrationReview } from '../src/features/registrations/useRegistrationReview.js'
import { useChangeReview } from '../src/features/vehicle-changes/useChangeReview.js'

const page = (n) => ({ total: n, page: 1, pageSize: 10, totalPages: Math.ceil(n / 10) })
const netDrop = () => Object.assign(new Error('net'), { code: 'NETWORK_ERROR' })

describe('registration review: safe resend of the same decision', () => {
  it('resends exactly the same request/decision/plate check and shows the replayed QR', async () => {
    const review = vi.fn()
      .mockRejectedValueOnce(netDrop())
      .mockResolvedValueOnce({ requestId: 'r-1', vehicleId: 'v-1', status: 'APPROVED', qrToken: 'f'.repeat(64), qrId: 'q-1' })
    const repository = {
      listPending: vi.fn().mockResolvedValue({ registrations: [], pagination: page(0) }),
      detail: vi.fn(), photo: vi.fn(), review,
    }
    const work = useRegistrationReview({ repository, permissions: ['vehicle.registration.approve'] })
    await work.review({ requestId: 'r-1', decision: 'APPROVE', platePhotoVerified: true })
    expect(work.actionPhase.value).toBe('uncertain')
    expect(work.lastDecision.value).toEqual({ requestId: 'r-1', decision: 'APPROVE', platePhotoVerified: true, stickerCategory: '' })
    await work.resendDecision()
    expect(review.mock.calls[1][0]).toEqual(review.mock.calls[0][0])
    expect(work.actionPhase.value).toBe('success')
    expect(work.oneTimeQr.value.token).toBe('f'.repeat(64))
    expect(work.lastDecision.value).toBeNull()
    expect(await work.resendDecision()).toBe(false)
  })
})

describe('change review: uncertain outcome is resolved by re-reading, never by resending', () => {
  const setup = (pendingAfter, totalAfter = pendingAfter.length) => {
    const listPending = vi.fn()
      .mockResolvedValueOnce({ changes: [{ requestId: 'c-1', vehicleId: 'v-1', submittedAt: '', status: 'PENDING', proposedDelta: { model: 'B' } }], pagination: page(1) })
      .mockResolvedValue({ changes: pendingAfter, pagination: page(totalAfter) })
    const repository = { listPending, review: vi.fn().mockRejectedValue(netDrop()) }
    const detailRepository = { detail: vi.fn() }
    const work = useChangeReview({ repository, detailRepository, permissions: ['vehicle.change.approve'] })
    return { work, repository }
  }

  it('reports "decided" when the request left the only page of the queue', async () => {
    const { work, repository } = setup([])
    await work.load()
    await work.review({ requestId: 'c-1', decision: 'APPROVE' })
    expect(work.actionPhase.value).toBe('uncertain')
    expect(await work.checkOutcome()).toBe('decided')
    expect(repository.review).toHaveBeenCalledTimes(1)
  })

  it('reports "still-pending" when it is still queued and "unknown" when other pages exist', async () => {
    const pending = setup([{ requestId: 'c-1', vehicleId: 'v-1', submittedAt: '', status: 'PENDING', proposedDelta: {} }])
    await pending.work.load(); await pending.work.review({ requestId: 'c-1', decision: 'REJECT' })
    expect(await pending.work.checkOutcome()).toBe('still-pending')
    const many = setup([], 25)
    await many.work.load(); await many.work.review({ requestId: 'c-1', decision: 'REJECT' })
    expect(await many.work.checkOutcome()).toBe('unknown')
  })
})

describe('R5 page contracts', () => {
  const reg = readFileSync(new URL('../src/pages/RegistrationReviewPage.vue', import.meta.url), 'utf8')
  const chg = readFileSync(new URL('../src/pages/ChangeReviewPage.vue', import.meta.url), 'utf8')
  it('registration review shows Thai labels and offers only the same-decision resend', () => {
    expect(reg).toContain("labelOf('vehicleTypes', application.vehicleType)")
    expect(reg).toContain('formatThaiPhone(application.contactPhone)')
    expect(reg).toContain('work.resendDecision')
    expect(reg).not.toContain('ห้ามกดซ้ำ ให้โหลดรายการใหม่')
  })
  it('change review offers a status check, not a resend', () => {
    expect(chg).toContain('work.checkOutcome')
    expect(chg).not.toContain('resendDecision')
    expect(chg).toContain("showValue(row.field, row.proposed)")
  })
})
