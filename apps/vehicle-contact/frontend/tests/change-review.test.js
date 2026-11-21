import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createGasChangeReviewRepository, ChangeReviewContractError } from '../src/infrastructure/vehicles/gas-change-review-repository.js'
import { createGasVehicleDetailRepository } from '../src/infrastructure/vehicles/gas-vehicle-detail-repository.js'
import { useChangeReview } from '../src/features/vehicle-changes/useChangeReview.js'

const page = readFileSync(new URL('../src/pages/ChangeReviewPage.vue', import.meta.url), 'utf8')
const router = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8')

describe('change review repository contract', () => {
  it('maps the pending queue through a delta allowlist and sends the exact paginated DTO', async () => {
    const callOperation = vi.fn().mockResolvedValue({
      data: { items: [{ requestId: 'c-1', vehicleId: 'v-1', submittedAt: '2026-11-20T00:00:00.000Z', proposedDelta: { brand: 'Honda', contactName: 'ใหม่', secret: 'drop' }, internal: 'drop' }], total: 1, page: 1, pageSize: 10, totalPages: 1 },
      requestId: 'list',
    })
    const repository = createGasChangeReviewRepository({ callOperation })
    const result = await repository.listPending({ page: 1, pageSize: 10 })
    expect(callOperation).toHaveBeenCalledWith('changes.listPending', { page: 1, pageSize: 10 }, undefined)
    expect(result.changes[0]).toEqual({ requestId: 'c-1', vehicleId: 'v-1', submittedAt: '2026-11-20T00:00:00.000Z', proposedDelta: { brand: 'Honda', contactName: 'ใหม่' } })
    expect(JSON.stringify(result)).not.toContain('drop')
  })

  it('sends exact review DTOs and accepts the APPROVE/REJECT verb status', async () => {
    const callOperation = vi.fn()
      .mockResolvedValueOnce({ data: { requestId: 'c-1', status: 'APPROVE' }, requestId: 'approve' })
      .mockResolvedValueOnce({ data: { requestId: 'c-2', status: 'REJECT' }, requestId: 'reject' })
    const repository = createGasChangeReviewRepository({ callOperation })
    expect((await repository.review({ requestId: 'c-1', decision: 'APPROVE' })).status).toBe('APPROVE')
    await repository.review({ requestId: 'c-2', decision: 'REJECT' })
    expect(callOperation.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ['changes.review', { requestId: 'c-1', decision: 'APPROVE' }],
      ['changes.review', { requestId: 'c-2', decision: 'REJECT' }],
    ])
  })

  it('fails closed for mismatched request id or unknown status', async () => {
    for (const data of [{ requestId: 'other', status: 'APPROVE' }, { requestId: 'c-1', status: 'APPROVED' }, null]) {
      const repository = createGasChangeReviewRepository({ callOperation: vi.fn().mockResolvedValue({ data, requestId: 'r' }) })
      await expect(repository.review({ requestId: 'c-1', decision: 'APPROVE' })).rejects.toBeInstanceOf(ChangeReviewContractError)
    }
  })
})

describe('vehicle detail repository contract', () => {
  it('reads current values through the exact DTO, strips storage refs and keeps version', async () => {
    const callOperation = vi.fn().mockResolvedValue({
      data: { vehicleId: 'v-1', plate: 'กข1234', province: '65', status: 'ACTIVE', vehicleType: 'CAR', brand: 'Toyota', model: 'Test', color: 'ขาว', version: 3, contacts: [{ name: 'ผู้ทดสอบ', phone: '+66800000000', relationship: 'เจ้าของ', isPrimary: true }], photos: [{ photoId: 'p-1', slot: 'FRONT', mimeType: 'image/jpeg', storageRef: 'private-drive-ref' }] },
      requestId: 'detail',
    })
    const repository = createGasVehicleDetailRepository({ callOperation })
    const result = await repository.detail('v-1', { permissions: ['vehicle.contact.read', 'vehicle.photos.read'] })
    expect(callOperation).toHaveBeenCalledWith('vehicles.detail', { vehicleId: 'v-1' }, { signal: undefined })
    expect(result.version).toBe(3)
    expect(result.vehicle.contacts[0].name).toBe('ผู้ทดสอบ')
    expect(result.vehicle.photos).toEqual([{ photoId: 'p-1', slot: 'FRONT', mimeType: 'image/jpeg' }])
    expect(JSON.stringify(result)).not.toContain('private-drive-ref')
  })

  it('withholds contacts and photos when the session lacks read permission', async () => {
    const callOperation = vi.fn().mockResolvedValue({
      data: { vehicleId: 'v-1', plate: 'กข1234', province: '65', status: 'ACTIVE', brand: 'Toyota', version: 1, contacts: [{ name: 'ผู้ทดสอบ', isPrimary: true }], photos: [{ photoId: 'p-1', slot: 'FRONT' }] },
      requestId: 'detail',
    })
    const repository = createGasVehicleDetailRepository({ callOperation })
    const result = await repository.detail('v-1', { permissions: [] })
    expect(result.vehicle.contacts).toEqual([])
    expect(result.vehicle.photos).toEqual([])
  })
})

describe('change review state and page contracts', () => {
  it('does not call the backend without permission', async () => {
    const repository = { listPending: vi.fn(), review: vi.fn() }
    const detailRepository = { detail: vi.fn() }
    const work = useChangeReview({ repository, detailRepository, permissions: [] })
    await work.load()
    expect(work.phase.value).toBe('forbidden')
    expect(repository.listPending).not.toHaveBeenCalled()
    expect(detailRepository.detail).not.toHaveBeenCalled()
  })

  it('builds a current-versus-proposed diff from the primary contact and vehicle fields', async () => {
    const item = { requestId: 'c-1', vehicleId: 'v-1', submittedAt: '2026-11-20T00:00:00.000Z', proposedDelta: { brand: 'Honda', contactName: 'ใหม่' } }
    const repository = {
      listPending: vi.fn().mockResolvedValue({ changes: [item], pagination: { total: 1, page: 1, pageSize: 10, totalPages: 1 } }),
      review: vi.fn(),
    }
    const detailRepository = { detail: vi.fn().mockResolvedValue({ vehicle: { brand: 'Toyota', model: 'Test', color: 'ขาว', contacts: [{ name: 'เดิม', phone: '+668', isPrimary: true }] }, version: 3, requestId: 'd' }) }
    const work = useChangeReview({ repository, detailRepository, permissions: ['vehicle.change.approve', 'vehicle.contact.read'] })
    await work.load()
    await work.inspect(item)
    expect(detailRepository.detail).toHaveBeenCalledWith('v-1', { permissions: ['vehicle.change.approve', 'vehicle.contact.read'] })
    expect(work.diffRows.value).toEqual([
      { field: 'brand', label: 'ยี่ห้อ', current: 'Toyota', proposed: 'Honda' },
      { field: 'contactName', label: 'ชื่อผู้ประสานงาน', current: 'เดิม', proposed: 'ใหม่' },
    ])
  })

  it('never retries an uncertain write and surfaces the support request id', async () => {
    const timeout = Object.assign(new Error('timeout'), { code: 'TIMEOUT', requestId: 'support' })
    const repository = {
      listPending: vi.fn().mockResolvedValue({ changes: [], pagination: { total: 0, page: 1, pageSize: 10, totalPages: 0 } }),
      review: vi.fn().mockRejectedValue(timeout),
    }
    const work = useChangeReview({ repository, detailRepository: { detail: vi.fn() }, permissions: ['vehicle.change.approve'] })
    await work.review({ requestId: 'c-1', decision: 'APPROVE' })
    expect(work.actionPhase.value).toBe('uncertain')
    expect(repository.review).toHaveBeenCalledTimes(1)
    expect(work.failure.value.requestId).toBe('support')
  })

  it('wires the protected route and shared page contracts', () => {
    expect(router).toContain("name: 'change-review'")
    expect(router).toContain("requiredPermissions: ['vehicle.change.approve']")
    expect(page).toContain('<PageTemplateComponent')
    expect(page).toContain('<OperationalContextStrip')
    expect(page).toContain('<PaginationControl')
    expect(page).toContain('<ConfirmDialog')
    expect(page).toContain('work.diffRows.value')
    expect(page).toContain('ค่าที่เสนอ')
    expect(page).not.toContain('fetch(')
    expect(page).not.toContain('localStorage')
    expect(page).not.toContain('sessionStorage')
  })
})