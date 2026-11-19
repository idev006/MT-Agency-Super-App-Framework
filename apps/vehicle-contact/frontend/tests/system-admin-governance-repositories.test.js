import { describe, expect, it, vi } from 'vitest'
import { createGasAuditRepository } from '../src/infrastructure/audit/gas-audit-repository.js'
import { createGasQrGovernanceRepository } from '../src/infrastructure/qr/gas-qr-governance-repository.js'
import { createGasRetentionRepository } from '../src/infrastructure/retention/gas-retention-repository.js'

describe('SYSTEM_ADMIN governance repositories', () => {
  it('maps QR issue, replace and revoke through protected operations', async () => {
    const callOperation = vi.fn()
      .mockResolvedValueOnce({ data: { vehicleId: 'v-1', qrId: 'q-1', token: 'one-time' }, requestId: 'r1' })
      .mockResolvedValueOnce({ data: { vehicleId: 'v-1', qrId: 'q-2', token: 'replacement' }, requestId: 'r2' })
      .mockResolvedValueOnce({ data: { vehicleId: 'v-1', revoked: true }, requestId: 'r3' })
    const repository = createGasQrGovernanceRepository({ callOperation })
    expect((await repository.issue('v-1')).token).toBe('one-time')
    expect((await repository.replace('v-1')).token).toBe('replacement')
    expect((await repository.revoke('v-1')).revoked).toBe(true)
    expect(callOperation.mock.calls.map((call) => call[0])).toEqual(['qr.issue', 'qr.replace', 'qr.revoke'])
  })

  it('lists, approves and inspects retention without exposing execute', async () => {
    const callOperation = vi.fn()
      .mockResolvedValueOnce({ data: { items: [{ jobId: 'j-1', vehicleId: 'v-1', dueAt: '2026-11-20', status: 'DUE' }], total: 1, page: 1, pageSize: 10, totalPages: 1 }, requestId: 'r1' })
      .mockResolvedValueOnce({ data: { jobId: 'j-1', approved: true }, requestId: 'r2' })
      .mockResolvedValueOnce({ data: { jobId: 'j-1', vehicleId: 'v-1', status: 'APPROVED', attempts: 0, lastError: '' }, requestId: 'r3' })
    const repository = createGasRetentionRepository({ callOperation })
    expect((await repository.listDue()).jobs).toHaveLength(1)
    expect((await repository.approve('j-1')).approved).toBe(true)
    expect((await repository.status('j-1')).job.status).toBe('APPROVED')
    expect(callOperation.mock.calls.map((call) => call[0])).toEqual(['retention.listDue', 'retention.approve', 'retention.jobStatus'])
  })

  it('queries and exports normalized audit rows', async () => {
    const row = { type: 'change', eventId: 'e-1', actorId: 'u-1', entityId: 'v-1', action: 'UPDATED', at: '2026-11-19' }
    const callOperation = vi.fn()
      .mockResolvedValueOnce({ data: { items: [row], total: 1, page: 1, pageSize: 10, totalPages: 1 }, requestId: 'r1' })
      .mockResolvedValueOnce({ data: { format: 'JSON', rows: [row] }, requestId: 'r2' })
    const repository = createGasAuditRepository({ callOperation })
    expect((await repository.query({ page: 1, pageSize: 10 })).rows[0]).toEqual(row)
    expect((await repository.exportJson({ limit: 50 })).rows[0]).toEqual(row)
    expect(callOperation.mock.calls.map((call) => call[0])).toEqual(['audit.query', 'audit.export'])
  })
})
